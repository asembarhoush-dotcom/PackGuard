#include "platform.h"
#include "report.h"
#include "scanner.h"

#include <errno.h>
#include <float.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_THREADS        1024
#define MAX_NEAR           256
#define MAX_CANDIDATES     1000000
#define DEFAULT_CANDIDATES 256
#define BATCH_PACKAGES     64
#define BATCH_CHUNKS       256

/* Command-line settings. */
typedef struct {
    size_t nthreads;
    size_t near_k;
    size_t candidates;
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
            "usage: packguard [-j threads] [-p candidates] [-t threshold] [-k groups]\n"
            "                 [-o report.json | -d report_dir] <reference_dir> <package_path>...\n"
            "  Scores every .js/.cjs/.mjs file and the root package.json install scripts\n"
            "  of each package_path against every file of reference_dir by NCD. The\n"
            "  references are loaded once for all packages.\n"
            "  -j  worker threads (default: all logical processors)\n"
            "  -p  LZJD prefilter: run NCD only on this many most similar reference\n"
            "      chunks per chunk (default %d; 0 scores every reference, exact)\n"
            "  -t  also report whether the score is at or below this threshold\n"
            "  -k  also list, per chunk, the closest reference groups (first folder\n"
            "      below reference_dir) and their lowest NCD, up to this many\n"
            "  -o  write the report of a single package to this file (default: stdout)\n"
            "  -d  write one report per package to report_dir/<package dir name>.json\n",
            DEFAULT_CANDIDATES);
}

/*
 * Parses argv into opt. Options may come in any order before the
 * positional arguments; "--" ends them.
 * Returns 0 on success, 1 after -h, -1 on a usage error.
 */
static int parse_args(int argc, char **argv, options *opt)
{
    *opt = (options){.nthreads = cpu_count(), .candidates = DEFAULT_CANDIDATES, .threshold = -1.0};
    int i = 1;
    for (; i < argc && argv[i][0] == '-' && argv[i][1] != '\0'; i++) {
        const char *a = argv[i];
        if (strcmp(a, "--") == 0) {
            i++;
            break;
        }
        if (strcmp(a, "-h") == 0 || strcmp(a, "--help") == 0)
            return 1;
        if (a[2] != '\0' || i + 1 >= argc || strchr("jtodkp", a[1]) == NULL) {
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
        } else if (a[1] == 'p') {
            long n = strtol(value, &end, 10);
            if (*end != '\0' || n < 0 || n > MAX_CANDIDATES) {
                fprintf(stderr, "packguard: -p needs 0 to %d\n", MAX_CANDIDATES);
                return -1;
            }
            opt->candidates = (size_t)n;
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

/* qsort() comparator for report_matches: lowest NCD first, then most chunks, then name. */
static int compare_matches(const void *pa, const void *pb)
{
    const report_match *a = pa, *b = pb;
    if (a->ncd != b->ncd)
        return a->ncd < b->ncd ? -1 : 1;
    if (a->chunks != b->chunks)
        return a->chunks > b->chunks ? -1 : 1;
    return strcmp(a->package, b->package);
}

/*
 * Fills matched with one entry per distinct reference package that was the
 * closest match of at least one of the count chunks, with its group, its
 * lowest NCD and how many chunks it matched, sorted by compare_matches().
 * Names are borrowed from refs. Returns how many entries were written.
 */
static size_t matched_packages(const reference_set *refs, const chunk_score *scores, size_t count,
                               report_match *matched)
{
    size_t n = 0;
    for (size_t s = 0; s < count; s++) {
        const ref_chunk *m = &refs->refs[scores[s].ref];
        const char *pkg = refs->package_names[refs->file_package[m->file]];
        size_t j = 0;
        while (j < n && matched[j].package != pkg)
            j++;
        if (j == n)
            matched[n++] = (report_match){pkg, refs->group_names[m->group], scores[s].ncd, 0};
        if (scores[s].ncd < matched[j].ncd)
            matched[j].ncd = scores[s].ncd;
        matched[j].chunks++;
    }
    if (n > 1)
        qsort(matched, n, sizeof *matched, compare_matches);
    return n;
}

/* One package of a batch: its path, its files, where its chunks start in the batch and its time. */
typedef struct {
    const char *path;
    file_list targets;
    size_t first;
    size_t count;
    double seconds;
    int loaded;
} package_job;

/*
 * Builds the report of a scored package and writes it to
 * opt->out_dir/<package folder>.json, to opt->out_file, or to stdout.
 * scores, and nears and near_counts when k > 0, hold the package's own
 * chunks in walk order. Progress goes to stderr.
 * Returns 0 on success, -1 on failure.
 */
static int write_package(const reference_set *refs, const options *opt, const package_job *job,
                         const chunk_score *scores, report_near *nears, const size_t *near_counts,
                         size_t k)
{
    int status = -1;
    size_t count = job->count;
    const char *pkg = job->path;
    char *out_path = NULL;
    report_chunk *rows = malloc((count ? count : 1) * sizeof *rows);
    report_match *matched = malloc((count ? count : 1) * sizeof *matched);
    if (rows == NULL || matched == NULL)
        goto done;
    if (opt->out_dir != NULL) {
        size_t blen;
        const char *base = last_component(pkg, &blen);
        size_t len = strlen(opt->out_dir) + blen + 7;
        out_path = malloc(len);
        if (out_path == NULL)
            goto done;
        snprintf(out_path, len, "%s/%.*s.json", opt->out_dir, (int)blen, base);
    }

    double best = 0.0;
    size_t s = 0;
    for (size_t i = 0; i < job->targets.count; i++) {
        const char *file = relative_to(job->targets.items[i].path, pkg);
        for (size_t j = 0; j < job->targets.items[i].chunks.count; j++, s++) {
            const file_chunk *c = &job->targets.items[i].chunks.chunks[j];
            const ref_chunk *m = &refs->refs[scores[s].ref];
            rows[s] = (report_chunk){
                .file = file,
                .start = c->offset,
                .ncd = scores[s].ncd,
                .match_file = relative_to(refs->files.items[m->file].path, opt->ref_dir),
                .match_package = refs->package_names[refs->file_package[m->file]],
                .match_start = m->chunk->offset,
                .text = c->data,
                .text_len = c->length,
            };
            if (k > 0) {
                rows[s].near = nears + s * k;
                rows[s].near_count = near_counts[s];
            }
            if (s == 0 || scores[s].ncd < best)
                best = scores[s].ncd;
            fprintf(stderr, "packguard:   %s @%zu: ncd %.4f\n", file, c->offset, scores[s].ncd);
        }
    }

    char name[512], version[512];
    package_id(pkg, name, version, sizeof name);
    size_t matched_count = matched_packages(refs, scores, count, matched);
    package_report report = {
        .package = name,
        .version = version,
        .score = best,
        .has_score = count > 0,
        .threshold = opt->threshold,
        .has_threshold = opt->threshold >= 0.0,
        .seconds = job->seconds,
        .has_seconds = 1,
        .matched = matched,
        .matched_count = matched_count,
        .chunks = rows,
        .count = count,
    };
    const char *dest = out_path ? out_path : opt->out_file;
    if (dest != NULL) {
        if (write_report_file(dest, &report) != 0) {
            fprintf(stderr, "packguard: %s: %s\n", dest, strerror(errno));
            goto done;
        }
    } else if (write_report(stdout, &report) != 0 || fflush(stdout) != 0) {
        fprintf(stderr, "packguard: writing the report failed\n");
        goto done;
    }
    if (count > 0)
        fprintf(stderr, "packguard: %s: %zu files, %zu chunks, score %.4f, %.1f s, closest %s (%s)\n",
                pkg, job->targets.count, count, best, job->seconds, matched[0].package, matched[0].group);
    else
        fprintf(stderr, "packguard: %s: no JavaScript or install scripts, score null, %.1f s\n", pkg,
                job->seconds);
    status = 0;

done:
    free(out_path);
    free(matched);
    free(rows);
    return status;
}

/*
 * Scans packages[0..n) as one batch: loads every package, scores all their
 * chunks together with score_chunks() (so with enough chunks each thread
 * takes whole chunks and no thread waits on another), then writes each
 * package's report in order. With -k the chunks are scored BATCH_CHUNKS at a
 * time, which bounds the per-group results held at once. A package's
 * seconds are its load time plus the scoring time of its chunks.
 * Returns the number of packages that failed.
 */
static int scan_batch(reference_set *refs, const options *opt, char **packages, size_t n)
{
    int failures = 0;
    size_t k = opt->near_k < refs->group_count ? opt->near_k : refs->group_count;
    package_job *jobs = calloc(n, sizeof *jobs);
    const file_chunk **chunks = NULL;
    chunk_score *scores = NULL;
    double *seconds = NULL;
    double *group_rows = NULL;
    report_near *nears = NULL;
    size_t *near_counts = NULL;
    int scored = 0;
    if (jobs == NULL)
        goto report;

    size_t total = 0;
    for (size_t j = 0; j < n; j++) {
        double t0 = now_seconds();
        jobs[j].path = packages[j];
        if (collect_files(&jobs[j].targets, packages[j]) == 0) {
            jobs[j].loaded = 1;
            jobs[j].first = total;
            for (size_t i = 0; i < jobs[j].targets.count; i++)
                jobs[j].count += jobs[j].targets.items[i].chunks.count;
            total += jobs[j].count;
        }
        jobs[j].seconds = now_seconds() - t0;
    }

    size_t slice = k > 0 ? BATCH_CHUNKS : (total ? total : 1);
    chunks = malloc((total ? total : 1) * sizeof *chunks);
    scores = malloc((total ? total : 1) * sizeof *scores);
    seconds = calloc(total ? total : 1, sizeof *seconds);
    if (k > 0) {
        group_rows = malloc(slice * refs->group_count * sizeof *group_rows);
        nears = malloc((total ? total : 1) * k * sizeof *nears);
        near_counts = malloc((total ? total : 1) * sizeof *near_counts);
    }
    if (chunks == NULL || scores == NULL || seconds == NULL
        || (k > 0 && (group_rows == NULL || nears == NULL || near_counts == NULL)))
        goto report;

    size_t s = 0;
    for (size_t j = 0; j < n; j++)
        for (size_t i = 0; jobs[j].loaded && i < jobs[j].targets.count; i++)
            for (size_t c = 0; c < jobs[j].targets.items[i].chunks.count; c++)
                chunks[s++] = &jobs[j].targets.items[i].chunks.chunks[c];

    scored = 1;
    for (size_t at = 0; at < total; at += slice) {
        size_t m = total - at < slice ? total - at : slice;
        if (score_chunks(refs, chunks + at, m, scores + at, group_rows, seconds + at) != 0) {
            fprintf(stderr, "packguard: scoring a batch of %zu packages failed\n", n);
            scored = 0;
            break;
        }
        for (size_t i = 0; k > 0 && i < m; i++)
            near_counts[at + i] = closest_groups(group_rows + i * refs->group_count, refs->group_names,
                                                 refs->group_count, k, nears + (at + i) * k);
    }

report:
    for (size_t j = 0; j < n; j++) {
        if (jobs == NULL || !jobs[j].loaded || !scored) {
            fprintf(stderr, "packguard: %s: scan failed\n", packages[j]);
            failures++;
            continue;
        }
        for (size_t c = 0; c < jobs[j].count; c++)
            jobs[j].seconds += seconds[jobs[j].first + c];
        if (write_package(refs, opt, &jobs[j], scores + jobs[j].first,
                          k > 0 ? nears + jobs[j].first * k : NULL,
                          k > 0 ? near_counts + jobs[j].first : NULL, k) != 0) {
            fprintf(stderr, "packguard: %s: scan failed\n", packages[j]);
            failures++;
        }
    }
    for (size_t j = 0; jobs != NULL && j < n; j++)
        free_files(&jobs[j].targets);
    free(near_counts);
    free(nears);
    free(group_rows);
    free(seconds);
    free(scores);
    free(chunks);
    free(jobs);
    return failures;
}

/*
 * Stage 1 of PackGuard. Loads the known-malware references once, caching
 * C(x) for each distinct chunk on a pool of threads that stays up for the
 * whole run, then scans the packages BATCH_PACKAGES at a time: every chunk
 * is scored by its lowest NCD to any reference and the package score is the
 * lowest chunk score. Reports are written by write_report() in the order the
 * packages were given. A package that fails is skipped and the exit status
 * is 1; a usage error exits with 2. Stage 2 (the AI filter) is not wired in yet.
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
    if (load_references(&refs, opt.ref_dir, opt.nthreads, opt.candidates) != 0) {
        fprintf(stderr, "packguard: loading references failed\n");
        return 1;
    }
    fprintf(stderr, "packguard: %zu reference files, %zu chunks, %zu distinct, %zu packages, "
            "loaded in %.1f s on %zu threads, ",
            refs.files.count, refs.total_chunks, refs.count, refs.package_count,
            now_seconds() - t0, refs.nthreads);
    if (refs.candidates > 0)
        fprintf(stderr, "LZJD prefilter: NCD on the %zu most similar chunks\n", refs.candidates);
    else
        fprintf(stderr, "no prefilter: NCD on every chunk\n");

    int failures = 0;
    for (size_t i = 0; i < opt.package_count; i += BATCH_PACKAGES) {
        size_t n = opt.package_count - i < BATCH_PACKAGES ? opt.package_count - i : BATCH_PACKAGES;
        failures += scan_batch(&refs, &opt, opt.packages + i, n);
    }

    free_references(&refs);
    return failures ? 1 : 0;
}
