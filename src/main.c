#include "platform.h"
#include "report.h"
#include "scanner.h"

#include <errno.h>
#include <float.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_THREADS 1024
#define MAX_NEAR    256

/* Command-line settings. */
typedef struct {
    size_t nthreads;
    size_t near_k;
    double threshold;
    const char *out_file;
    const char *out_dir;
    const char *ref_dir;
    char **packages;
    size_t package_count;
} options;

/* Prints the command-line usage to stderr. */
static void usage(void)
{
    fprintf(stderr,
            "usage: packguard [-j threads] [-t threshold] [-k groups] [-o report.json | -d report_dir]\n"
            "                 <reference_dir> <package_path>...\n"
            "  Scores every .js/.cjs/.mjs file of each package_path against every file of\n"
            "  reference_dir by NCD. The references are loaded once for all packages.\n"
            "  -j  worker threads (default: all logical processors)\n"
            "  -t  also report whether the score is at or below this threshold\n"
            "  -k  also list, per chunk, the closest reference groups (first folder\n"
            "      below reference_dir) and their lowest NCD, up to this many\n"
            "  -o  write the report of a single package to this file (default: stdout)\n"
            "  -d  write one report per package to report_dir/<package dir name>.json\n");
}

/*
 * Parses argv into opt. Options may come in any order before the
 * positional arguments; "--" ends them.
 * Returns 0 on success, 1 after -h, -1 on a usage error.
 */
static int parse_args(int argc, char **argv, options *opt)
{
    *opt = (options){.nthreads = cpu_count(), .threshold = -1.0};
    int i = 1;
    for (; i < argc && argv[i][0] == '-' && argv[i][1] != '\0'; i++) {
        const char *a = argv[i];
        if (strcmp(a, "--") == 0) {
            i++;
            break;
        }
        if (strcmp(a, "-h") == 0 || strcmp(a, "--help") == 0)
            return 1;
        if (a[2] != '\0' || i + 1 >= argc || strchr("jtodk", a[1]) == NULL) {
            fprintf(stderr, "packguard: bad option %s\n", a);
            return -1;
        }
        const char *value = argv[++i];
        char *end;
        if (a[1] == 'j') {
            long n = strtol(value, &end, 10);
            if (*end != '\0' || n < 1 || n > MAX_THREADS) {
                fprintf(stderr, "packguard: -j needs 1 to %d\n", MAX_THREADS);
                return -1;
            }
            opt->nthreads = (size_t)n;
        } else if (a[1] == 'k') {
            long n = strtol(value, &end, 10);
            if (*end != '\0' || n < 0 || n > MAX_NEAR) {
                fprintf(stderr, "packguard: -k needs 0 to %d\n", MAX_NEAR);
                return -1;
            }
            opt->near_k = (size_t)n;
        } else if (a[1] == 't') {
            opt->threshold = strtod(value, &end);
            if (*end != '\0' || opt->threshold < 0.0) {
                fprintf(stderr, "packguard: -t needs a number of 0 or more\n");
                return -1;
            }
        } else if (a[1] == 'o') {
            opt->out_file = value;
        } else {
            opt->out_dir = value;
        }
    }
    if (argc - i < 2)
        return -1;
    opt->ref_dir = argv[i];
    opt->packages = argv + i + 1;
    opt->package_count = (size_t)(argc - i - 1);
    if (opt->out_file != NULL && opt->out_dir != NULL) {
        fprintf(stderr, "packguard: use -o or -d, not both\n");
        return -1;
    }
    if (opt->package_count > 1 && opt->out_dir == NULL) {
        fprintf(stderr, "packguard: more than one package needs -d report_dir\n");
        return -1;
    }
    return 0;
}

/*
 * Returns where the last component of path starts and stores its length,
 * ignoring trailing separators.
 */
static const char *last_component(const char *path, size_t *len)
{
    size_t end = strlen(path);
    while (end > 1 && is_path_sep(path[end - 1]))
        end--;
    size_t start = end;
    while (start > 0 && !is_path_sep(path[start - 1]))
        start--;
    *len = end - start;
    return path + start;
}

/*
 * Returns path relative to root when it lies under root, its last component
 * when it is root itself, otherwise path unchanged.
 */
static const char *relative_to(const char *path, const char *root)
{
    size_t len = strlen(root);
    if (strncmp(path, root, len) == 0) {
        if (len > 0 && is_path_sep(root[len - 1]))
            return path + len;
        if (is_path_sep(path[len]))
            return path + len + 1;
        if (path[len] == '\0') {
            size_t n;
            return last_component(path, &n);
        }
    }
    return path;
}

/*
 * Splits the last component of path at its last '@' (not counting a leading
 * one) into package name and version. Without one, the whole component is
 * the name and the version is empty. Writes into name and version, each of
 * size bytes.
 */
static void package_id(const char *path, char *name, char *version, size_t size)
{
    size_t blen;
    const char *base = last_component(path, &blen);
    const char *at = NULL;
    for (size_t i = 1; i < blen; i++)
        if (base[i] == '@')
            at = base + i;
    size_t nlen = at ? (size_t)(at - base) : blen;
    snprintf(name, size, "%.*s", (int)nlen, base);
    if (at)
        snprintf(version, size, "%.*s", (int)(blen - nlen - 1), at + 1);
    else
        version[0] = '\0';
}

/*
 * Fills near with up to k groups from group_best[0..group_count) with the
 * lowest NCD, closest first (lower group index first on ties). Group names
 * are borrowed from names. Returns how many entries were written.
 */
static size_t closest_groups(const double *group_best, char *const *names, size_t group_count,
                             size_t k, report_near *near)
{
    size_t n = 0;
    size_t last = SIZE_MAX;
    for (; n < k; n++) {
        size_t pick = SIZE_MAX;
        for (size_t g = 0; g < group_count; g++) {
            double v = group_best[g];
            if (v >= DBL_MAX)
                continue;
            if (last != SIZE_MAX && (v < group_best[last] || (v == group_best[last] && g <= last)))
                continue;
            if (pick == SIZE_MAX || v < group_best[pick])
                pick = g;
        }
        if (pick == SIZE_MAX)
            break;
        near[n] = (report_near){names[pick], group_best[pick]};
        last = pick;
    }
    return n;
}

/*
 * Scans one package against refs and writes its report to out_path, or to
 * stdout when out_path is NULL. Progress goes to stderr.
 * Returns 0 on success, -1 on failure.
 */
static int scan_package(reference_set *refs, const options *opt, const char *pkg,
                        const char *out_path)
{
    double t0 = now_seconds();
    int status = -1;
    file_list targets = {0};
    chunk_score *scores = NULL;
    report_chunk *rows = NULL;
    double *group_best = NULL;
    report_near *nears = NULL;

    if (collect_files(&targets, pkg) != 0)
        goto done;
    size_t count = 0;
    for (size_t i = 0; i < targets.count; i++)
        count += targets.items[i].chunks.count;
    scores = malloc((count ? count : 1) * sizeof *scores);
    rows = malloc((count ? count : 1) * sizeof *rows);
    if (scores == NULL || rows == NULL)
        goto done;
    size_t k = opt->near_k < refs->group_count ? opt->near_k : refs->group_count;
    if (k > 0) {
        group_best = malloc(refs->group_count * sizeof *group_best);
        nears = malloc((count ? count : 1) * k * sizeof *nears);
        if (group_best == NULL || nears == NULL)
            goto done;
    }

    double best = 0.0;
    size_t s = 0;
    for (size_t i = 0; i < targets.count; i++) {
        const char *file = relative_to(targets.items[i].path, pkg);
        for (size_t j = 0; j < targets.items[i].chunks.count; j++, s++) {
            const file_chunk *c = &targets.items[i].chunks.chunks[j];
            if (score_chunk(refs, c, &scores[s], group_best) != 0) {
                fprintf(stderr, "packguard: %s: scoring %s failed\n", pkg, file);
                goto done;
            }
            const ref_chunk *m = &refs->refs[scores[s].ref];
            rows[s] = (report_chunk){
                .file = file,
                .start = c->offset,
                .ncd = scores[s].ncd,
                .match_file = relative_to(refs->files.items[m->file].path, opt->ref_dir),
                .match_start = m->chunk->offset,
                .text = c->data,
                .text_len = c->length,
            };
            if (k > 0) {
                rows[s].near = nears + s * k;
                rows[s].near_count = closest_groups(group_best, refs->group_names,
                                                    refs->group_count, k, nears + s * k);
            }
            if (s == 0 || scores[s].ncd < best)
                best = scores[s].ncd;
            fprintf(stderr, "packguard:   %s @%zu: ncd %.4f\n", file, c->offset, scores[s].ncd);
        }
    }

    char name[512], version[512];
    package_id(pkg, name, version, sizeof name);
    double seconds = now_seconds() - t0;
    package_report report = {
        .package = name,
        .version = version,
        .score = best,
        .has_score = count > 0,
        .threshold = opt->threshold,
        .has_threshold = opt->threshold >= 0.0,
        .seconds = seconds,
        .has_seconds = 1,
        .chunks = rows,
        .count = count,
    };
    if (out_path != NULL) {
        if (write_report_file(out_path, &report) != 0) {
            fprintf(stderr, "packguard: %s: %s\n", out_path, strerror(errno));
            goto done;
        }
    } else if (write_report(stdout, &report) != 0 || fflush(stdout) != 0) {
        fprintf(stderr, "packguard: writing the report failed\n");
        goto done;
    }
    if (count > 0)
        fprintf(stderr, "packguard: %s: %zu files, %zu chunks, score %.4f, %.1f s\n",
                pkg, targets.count, count, best, seconds);
    else
        fprintf(stderr, "packguard: %s: no JavaScript, score null, %.1f s\n", pkg, seconds);
    status = 0;

done:
    free(nears);
    free(group_best);
    free(rows);
    free(scores);
    free_files(&targets);
    return status;
}

/*
 * Stage 1 of PackGuard. Loads the known-malware references once, caching
 * C(x) for each distinct chunk on all threads, then scans each package in
 * turn: every chunk is scored by its lowest NCD to any reference and the
 * package score is the lowest chunk score. Reports are written by
 * write_report(). A package that fails is skipped and the exit status is 1;
 * a usage error exits with 2. Stage 2 (the AI filter) is not wired in yet.
 */
int main(int argc, char **argv)
{
    options opt;
    int rc = parse_args(argc, argv, &opt);
    if (rc != 0) {
        usage();
        return rc > 0 ? 0 : 2;
    }
    stdout_binary();

    double t0 = now_seconds();
    reference_set refs;
    if (load_references(&refs, opt.ref_dir, opt.nthreads) != 0) {
        fprintf(stderr, "packguard: loading references failed\n");
        return 1;
    }
    fprintf(stderr, "packguard: %zu reference files, %zu chunks, %zu distinct, "
            "C(x) cached in %.1f s on %zu threads\n",
            refs.files.count, refs.total_chunks, refs.count, now_seconds() - t0, refs.nthreads);

    int failures = 0;
    for (size_t i = 0; i < opt.package_count; i++) {
        const char *pkg = opt.packages[i];
        char *out_path = NULL;
        if (opt.out_dir != NULL) {
            size_t blen;
            const char *base = last_component(pkg, &blen);
            size_t len = strlen(opt.out_dir) + blen + 7;
            out_path = malloc(len);
            if (out_path == NULL) {
                failures++;
                continue;
            }
            snprintf(out_path, len, "%s/%.*s.json", opt.out_dir, (int)blen, base);
        }
        if (scan_package(&refs, &opt, pkg, out_path ? out_path : opt.out_file) != 0) {
            fprintf(stderr, "packguard: %s: scan failed\n", pkg);
            failures++;
        }
        free(out_path);
    }

    free_references(&refs);
    return failures ? 1 : 0;
}
