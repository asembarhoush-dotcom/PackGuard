#include "platform.h"
#include "primitives.h"
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
    size_t min_js_bytes;
    int drop_boilerplate;
    int use_cdc;
    int normalised;
    int decode;
    int primitives;
    double threshold;
    double script_threshold;
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
            "usage: packguard [--mode known|new] [-j threads] [-p candidates] [-m bytes]\n"
            "                 [-b 0|1] [-c 0|1|2] [-n 0|1] [-e 0|1] [-t threshold]\n"
            "                 [-s script_threshold] [-k groups]\n"
            "                 [-o report.json | -d report_dir]\n"
            "                 <reference_dir> <package_path>...\n"
            "  Scores every .js/.cjs/.mjs file and the root package.json install scripts\n"
            "  of each package_path against every file of reference_dir by NCD. The\n"
            "  references are loaded once for all packages.\n"
            "  --mode known  the proven v4c2 views and chunking; JavaScript threshold\n"
            "                0.62, install-script threshold 0.50\n"
            "  --mode new    raw NCD plus behavioural primitives, no normalised view;\n"
            "                threshold 0.50\n"
            "  -j  worker threads (default: all logical processors)\n"
            "  -p  LZJD prefilter: run NCD only on this many most similar reference\n"
            "      chunks per chunk (default %d; 0 scores every reference, exact)\n"
            "  -m  leave JavaScript chunks shorter than this many bytes out of the\n"
            "      package score (default 256; 0 scores every chunk)\n"
            "  -b  drop reference chunks that hold only a compiled module stub\n"
            "      (default 1; 0 keeps every reference chunk)\n"
            "  -t  also report each chunk's threshold and flagged state, and whether\n"
            "      any non-ignored chunk is at or below its threshold\n"
            "  -s  with -t, the threshold for install-script chunks (default 0.45)\n"
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
    *opt = (options){.nthreads = cpu_count(), .candidates = DEFAULT_CANDIDATES,
                     .min_js_bytes = 256, .drop_boilerplate = 1, .use_cdc = 0,
                     .normalised = 0, .decode = 1, .primitives = 0, .threshold = -1.0,
                     .script_threshold = 0.45};
    int i = 1;
    for (; i < argc && argv[i][0] == '-' && argv[i][1] != '\0'; i++) {
        const char *a = argv[i];
        if (strcmp(a, "--") == 0) {
            i++;
            break;
        }
        if (strcmp(a, "-h") == 0 || strcmp(a, "--help") == 0)
            return 1;
        if (strcmp(a, "--mode") == 0 || strncmp(a, "--mode=", 7) == 0) {
            const char *mode = a[6] == '=' ? a + 7 : (i + 1 < argc ? argv[++i] : NULL);
            if (mode == NULL) {
                fprintf(stderr, "packguard: --mode needs known or new\n");
                return -1;
            }
            if (strcmp(mode, "known") == 0) {
                opt->use_cdc = 2;
                opt->normalised = 1;
                opt->decode = 1;
                opt->drop_boilerplate = 1;
                opt->primitives = 0;
                opt->threshold = 0.62;
                opt->script_threshold = 0.50;
            } else if (strcmp(mode, "new") == 0) {
                opt->use_cdc = 0;
                opt->normalised = 0;
                opt->decode = 0;
                opt->drop_boilerplate = 1;
                opt->primitives = 1;
                opt->threshold = 0.50;
                opt->script_threshold = 0.50;
            } else {
                fprintf(stderr, "packguard: --mode needs known or new\n");
                return -1;
            }
            continue;
        }
        if (a[2] != '\0' || i + 1 >= argc || strchr("jtodkpmbscne", a[1]) == NULL) {
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
        } else if (a[1] == 'm') {
            long n = strtol(value, &end, 10);
            if (*end != '\0' || n < 0 || n > (long)SPLIT_THRESHOLD) {
                fprintf(stderr, "packguard: -m needs 0 to %u\n", SPLIT_THRESHOLD);
                return -1;
            }
            opt->min_js_bytes = (size_t)n;
        } else if (a[1] == 'b') {
            long n = strtol(value, &end, 10);
            if (*end != '\0' || (n != 0 && n != 1)) {
                fprintf(stderr, "packguard: -b needs 0 or 1\n");
                return -1;
            }
            opt->drop_boilerplate = (int)n;
        } else if (a[1] == 'c') {
            long n = strtol(value, &end, 10);
            if (*end != '\0' || n < 0 || n > 2) {
                fprintf(stderr, "packguard: -c needs 0, 1 or 2\n");
                return -1;
            }
            opt->use_cdc = (int)n;
        } else if (a[1] == 'n' || a[1] == 'e') {
            long n = strtol(value, &end, 10);
            if (*end != '\0' || (n != 0 && n != 1)) {
                fprintf(stderr, "packguard: -%c needs 0 or 1\n", a[1]);
                return -1;
            }
            if (a[1] == 'n')
                opt->normalised = (int)n;
            else
                opt->decode = (int)n;
        } else if (a[1] == 't') {
            opt->threshold = strtod(value, &end);
            if (*end != '\0' || opt->threshold < 0.0) {
                fprintf(stderr, "packguard: -t needs a number of 0 or more\n");
                return -1;
            }
        } else if (a[1] == 's') {
            opt->script_threshold = strtod(value, &end);
            if (*end != '\0' || opt->script_threshold < 0.0) {
                fprintf(stderr, "packguard: -s needs a number of 0 or more\n");
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

/* One package of a batch: its path, its raw and normalised files, where their chunks start, and its time. */
typedef struct {
    const char *path;
    file_list targets;
    file_list norm_targets;
    size_t first;
    size_t count;
    size_t norm_first;
    size_t norm_count;
    double seconds;
    int loaded;
} package_job;

/* Returns the report name of one file kind. */
static const char *kind_report_name(file_kind kind)
{
    if (kind == FILE_JS)
        return "js";
    if (kind == FILE_INSTALL_SCRIPT)
        return "install_script";
    return "other";
}

/*
 * Scans the package's raw chunks and returns the union of its JavaScript
 * primitives, storing the install-script union in script_hits.
 */
static primitive_hits package_primitive_hits(const package_job *job, primitive_hits *script_hits)
{
    primitive_hits js = {0};
    *script_hits = (primitive_hits){0};
    for (size_t i = 0; i < job->targets.count; i++) {
        const loaded_file *file = &job->targets.items[i];
        if (file->kind == FILE_OTHER)
            continue;
        for (size_t j = 0; j < file->chunks.count; j++) {
            const file_chunk *chunk = &file->chunks.chunks[j];
            primitive_hits hits = primitives_scan(chunk->data, chunk->length);
            if (file->kind == FILE_INSTALL_SCRIPT)
                *script_hits = primitives_union(*script_hits, hits);
            else
                js = primitives_union(js, hits);
        }
    }
    return js;
}

/*
 * Builds the report of a scored package and writes it to
 * opt->out_dir/<package folder>.json, to opt->out_file, or to stdout.
 * scores, and nears and near_counts when k > 0, hold the package's own
 * chunks in walk order. JavaScript chunks shorter than opt->min_js_bytes are
 * marked ignored and left out of the package score; when a package has no
 * other chunk, its largest JavaScript chunk sets the score and the report is
 * marked low_confidence. Progress goes to stderr.
 * Returns 0 on success, -1 on failure.
 */
static int write_package(const reference_set *refs, const reference_set *norm_refs,
                         const options *opt, const package_job *job,
                         const chunk_score *scores, const chunk_score *norm_scores,
                         report_near *nears, const size_t *near_counts, size_t k)
{
    int status = -1;
    size_t count = job->count;
    const char *pkg = job->path;
    char *out_path = NULL;
    report_chunk *rows = malloc((count ? count : 1) * sizeof *rows);
    report_match *matched = malloc((count ? count : 1) * sizeof *matched);
    chunk_score *used = malloc((count ? count : 1) * sizeof *used);
    if (rows == NULL || matched == NULL || used == NULL)
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

    double best_raw = DBL_MAX;
    primitive_hits js_hits = {0};
    primitive_hits script_hits = {0};
    primitive_hits all_hits = {0};
    char primitive_hits_text[128] = "";
    unsigned primitive_score = 0;
    int primitive_flagged = 0;
    if (opt->primitives) {
        js_hits = package_primitive_hits(job, &script_hits);
        all_hits = primitives_union(js_hits, script_hits);
        primitive_score = primitives_score(all_hits);
        primitive_flagged = primitives_flagged(js_hits, 0) || primitives_flagged(script_hits, 1);
        primitives_hits_string(all_hits, primitive_hits_text, sizeof primitive_hits_text);
    }
    size_t ignored = 0;
    size_t fallback = SIZE_MAX;
    size_t fallback_len = 0;
    size_t s = 0;
    for (size_t i = 0; i < job->targets.count; i++) {
        const loaded_file *target = &job->targets.items[i];
        const char *file = relative_to(target->path, pkg);
        const char *kind = kind_report_name(target->kind);
        for (size_t j = 0; j < target->chunks.count; j++, s++) {
            const file_chunk *c = &target->chunks.chunks[j];
            const ref_chunk *m = &refs->refs[scores[s].ref];
            int skip = target->kind == FILE_JS && c->length < opt->min_js_bytes;
            int has_threshold = opt->threshold >= 0.0;
            double limit = target->kind == FILE_INSTALL_SCRIPT ? opt->script_threshold : opt->threshold;
            rows[s] = (report_chunk){
                .file = file,
                .kind = kind,
                .start = c->offset,
                .ncd = scores[s].ncd,
                .threshold = limit,
                .has_threshold = has_threshold,
                .flagged = has_threshold && scores[s].ncd <= limit,
                .match_file = relative_to(refs->files.items[m->file].path, opt->ref_dir),
                .match_package = refs->package_names[refs->file_package[m->file]],
                .match_start = m->chunk->offset,
                .text = c->data,
                .text_len = c->length,
                .ignored = skip,
            };
            if (k > 0) {
                rows[s].near = nears + s * k;
                rows[s].near_count = near_counts[s];
            }
            if (skip) {
                ignored++;
                if (c->length > fallback_len) {
                    fallback_len = c->length;
                    fallback = s;
                }
            } else if (scores[s].ncd < best_raw) {
                best_raw = scores[s].ncd;
            }
            fprintf(stderr, "packguard:   %s @%zu: ncd %.4f\n", file, c->offset, scores[s].ncd);
        }
    }

    int low_confidence = 0;
    if (best_raw == DBL_MAX && fallback != SIZE_MAX) {
        best_raw = scores[fallback].ncd;
        rows[fallback].ignored = 0;
        ignored--;
        low_confidence = 1;
    }

    double best_norm = DBL_MAX;
    size_t norm_best = SIZE_MAX;
    for (size_t i = 0; norm_scores != NULL && i < job->norm_count; i++) {
        if (norm_scores[i].ncd < best_norm) {
            best_norm = norm_scores[i].ncd;
            norm_best = i;
        }
    }
    if (best_norm < best_raw)
        low_confidence = 0;

    double best = best_raw < best_norm ? best_raw : best_norm;
    int has_score = count > 0 && best != DBL_MAX;
    const char *score_view = NULL;
    if (best_norm < best_raw)
        score_view = "normalized";
    else if (best_raw < DBL_MAX)
        score_view = "raw";
    int flagged = 0;
    for (size_t i = 0; i < count; i++)
        if (!rows[i].ignored && rows[i].flagged)
            flagged = 1;
    if (opt->threshold >= 0.0 && best_norm <= opt->threshold)
        flagged = 1;
    if (primitive_flagged)
        flagged = 1;

    char name[512], version[512];
    package_id(pkg, name, version, sizeof name);
    size_t used_count = 0;
    for (size_t i = 0; i < count; i++)
        if (!rows[i].ignored)
            used[used_count++] = scores[i];
    size_t matched_count = matched_packages(refs, used, used_count, matched);
    const ref_chunk *nm = norm_best != SIZE_MAX ? &norm_refs->refs[norm_scores[norm_best].ref] : NULL;
    package_report report = {
        .package = name,
        .version = version,
        .score = best,
        .has_score = has_score,
        .score_raw = best_raw,
        .has_score_raw = opt->normalised && best_raw != DBL_MAX,
        .score_normalized = best_norm,
        .has_score_normalized = norm_scores != NULL && best_norm != DBL_MAX,
        .score_view = opt->normalised ? score_view : NULL,
        .normalized_match_file = nm ? relative_to(norm_refs->files.items[nm->file].path, opt->ref_dir) : NULL,
        .normalized_match_package = nm ? norm_refs->package_names[norm_refs->file_package[nm->file]] : NULL,
        .normalized_match_start = nm ? nm->chunk->offset : 0,
        .normalized_match_ncd = nm ? norm_scores[norm_best].ncd : 0.0,
        .ignored_small_chunks = ignored,
        .low_confidence = low_confidence,
        .threshold = opt->threshold,
        .has_threshold = opt->threshold >= 0.0,
        .flagged = flagged,
        .primitive_score = primitive_score,
        .has_primitive = opt->primitives,
        .primitive_flagged = primitive_flagged,
        .primitive_hits = opt->primitives ? primitive_hits_text : NULL,
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
    if (has_score && opt->normalised)
        fprintf(stderr, "packguard: %s: %zu files, %zu chunks, score %.4f%s, raw %.4f, normalised %.4f, %.1f s\n",
                pkg, job->targets.count, count, best, low_confidence ? " (low confidence)" : "",
                best_raw, best_norm, job->seconds);
    else if (has_score)
        fprintf(stderr, "packguard: %s: %zu files, %zu chunks, score %.4f%s, raw %.4f, %.1f s\n",
                pkg, job->targets.count, count, best, low_confidence ? " (low confidence)" : "",
                best_raw, job->seconds);
    else
        fprintf(stderr, "packguard: %s: no JavaScript or install scripts, score null, %.1f s\n", pkg,
                job->seconds);
    if (opt->primitives)
        fprintf(stderr, "packguard: %s: primitive score %u%s%s%s\n", pkg, primitive_score,
                primitive_flagged ? " (flagged)" : "",
                primitive_hits_text[0] != '\0' ? ", hits " : "", primitive_hits_text);
    status = 0;

done:
    free(used);
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
static int scan_batch(reference_set *refs, reference_set *norm_refs, const options *opt,
                      char **packages, size_t n)
{
    int failures = 0;
    size_t k = opt->near_k < refs->group_count ? opt->near_k : refs->group_count;
    package_job *jobs = calloc(n, sizeof *jobs);
    const file_chunk **chunks = NULL;
    const file_chunk **norm_chunks = NULL;
    chunk_score *scores = NULL;
    chunk_score *norm_scores = NULL;
    double *seconds = NULL;
    double *norm_seconds = NULL;
    double *group_rows = NULL;
    report_near *nears = NULL;
    size_t *near_counts = NULL;
    int scored = 0;
    int norm_scored = 0;
    if (jobs == NULL)
        goto report;

    size_t total = 0;
    size_t norm_total = 0;
    for (size_t j = 0; j < n; j++) {
        double t0 = now_seconds();
        jobs[j].path = packages[j];
        if (collect_files_ex(&jobs[j].targets, packages[j], opt->use_cdc == 1, 0, 0) == 0) {
            jobs[j].loaded = 1;
            jobs[j].first = total;
            for (size_t i = 0; i < jobs[j].targets.count; i++)
                jobs[j].count += jobs[j].targets.items[i].chunks.count;
            total += jobs[j].count;
            if (norm_refs != NULL) {
                if (collect_files_ex(&jobs[j].norm_targets, packages[j], opt->use_cdc >= 1, 1,
                                     opt->decode) != 0) {
                    jobs[j].loaded = 0;
                } else {
                    jobs[j].norm_first = norm_total;
                    for (size_t i = 0; i < jobs[j].norm_targets.count; i++)
                        jobs[j].norm_count += jobs[j].norm_targets.items[i].chunks.count;
                    norm_total += jobs[j].norm_count;
                }
            }
        }
        jobs[j].seconds = now_seconds() - t0;
    }

    size_t slice = k > 0 ? BATCH_CHUNKS : (total ? total : 1);
    chunks = malloc((total ? total : 1) * sizeof *chunks);
    scores = malloc((total ? total : 1) * sizeof *scores);
    seconds = calloc(total ? total : 1, sizeof *seconds);
    if (norm_refs != NULL) {
        norm_chunks = malloc((norm_total ? norm_total : 1) * sizeof *norm_chunks);
        norm_scores = malloc((norm_total ? norm_total : 1) * sizeof *norm_scores);
        norm_seconds = calloc(norm_total ? norm_total : 1, sizeof *norm_seconds);
    }
    if (k > 0) {
        group_rows = malloc(slice * refs->group_count * sizeof *group_rows);
        nears = malloc((total ? total : 1) * k * sizeof *nears);
        near_counts = malloc((total ? total : 1) * sizeof *near_counts);
    }
    if (chunks == NULL || scores == NULL || seconds == NULL
        || (norm_refs != NULL && (norm_chunks == NULL || norm_scores == NULL || norm_seconds == NULL))
        || (k > 0 && (group_rows == NULL || nears == NULL || near_counts == NULL)))
        goto report;

    size_t s = 0;
    size_t ns = 0;
    for (size_t j = 0; j < n; j++) {
        for (size_t i = 0; jobs[j].loaded && i < jobs[j].targets.count; i++)
            for (size_t c = 0; c < jobs[j].targets.items[i].chunks.count; c++)
                chunks[s++] = &jobs[j].targets.items[i].chunks.chunks[c];
        for (size_t i = 0; jobs[j].loaded && norm_refs != NULL && i < jobs[j].norm_targets.count; i++)
            for (size_t c = 0; c < jobs[j].norm_targets.items[i].chunks.count; c++)
                norm_chunks[ns++] = &jobs[j].norm_targets.items[i].chunks.chunks[c];
    }

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
    norm_scored = 1;
    if (scored && norm_refs != NULL && norm_total > 0) {
        if (score_chunks(norm_refs, norm_chunks, norm_total, norm_scores, NULL, norm_seconds) != 0) {
            fprintf(stderr, "packguard: scoring the normalised view failed\n");
            norm_scored = 0;
        }
    }

report:
    for (size_t j = 0; j < n; j++) {
        if (jobs == NULL || !jobs[j].loaded || !scored || !norm_scored) {
            fprintf(stderr, "packguard: %s: scan failed\n", packages[j]);
            failures++;
            continue;
        }
        for (size_t c = 0; c < jobs[j].count; c++)
            jobs[j].seconds += seconds[jobs[j].first + c];
        for (size_t c = 0; norm_refs != NULL && c < jobs[j].norm_count; c++)
            jobs[j].seconds += norm_seconds[jobs[j].norm_first + c];
        if (write_package(refs, norm_refs, opt, &jobs[j], scores + jobs[j].first,
                          norm_refs != NULL ? norm_scores + jobs[j].norm_first : NULL,
                          k > 0 ? nears + jobs[j].first * k : NULL,
                          k > 0 ? near_counts + jobs[j].first : NULL, k) != 0) {
            fprintf(stderr, "packguard: %s: scan failed\n", packages[j]);
            failures++;
        }
    }
    for (size_t j = 0; jobs != NULL && j < n; j++) {
        free_files(&jobs[j].targets);
        free_files(&jobs[j].norm_targets);
    }
    free(near_counts);
    free(nears);
    free(group_rows);
    free(norm_seconds);
    free(norm_scores);
    free(norm_chunks);
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
    reference_set norm_refs;
    int has_norm = opt.normalised;
    if (load_references_ex(&refs, opt.ref_dir, opt.nthreads, opt.candidates, opt.drop_boilerplate,
                           opt.use_cdc == 1, 0, 0, 0) != 0) {
        fprintf(stderr, "packguard: loading references failed\n");
        return 1;
    }
    fprintf(stderr, "packguard: %zu reference files, %zu chunks, %zu distinct (%zu boilerplate dropped), "
            "%zu packages, loaded in %.1f s on %zu threads, ",
            refs.files.count, refs.total_chunks, refs.count, refs.boilerplate_chunks,
            refs.package_count, now_seconds() - t0, refs.nthreads);
    if (refs.candidates > 0)
        fprintf(stderr, "LZJD prefilter: NCD on the %zu most similar chunks\n", refs.candidates);
    else
        fprintf(stderr, "no prefilter: NCD on every chunk\n");

    if (has_norm) {
        double t1 = now_seconds();
        if (load_references_ex(&norm_refs, opt.ref_dir, opt.nthreads, opt.candidates, 0,
                               opt.use_cdc >= 1, 1, opt.decode, 1) != 0) {
            fprintf(stderr, "packguard: loading normalised references failed\n");
            free_references(&refs);
            return 1;
        }
        fprintf(stderr, "packguard: normalised view: %zu reference files, %zu chunks, %zu distinct, "
                "%zu packages, loaded in %.1f s\n",
                norm_refs.files.count, norm_refs.total_chunks, norm_refs.count,
                norm_refs.package_count, now_seconds() - t1);
    }

    int failures = 0;
    for (size_t i = 0; i < opt.package_count; i += BATCH_PACKAGES) {
        size_t n = opt.package_count - i < BATCH_PACKAGES ? opt.package_count - i : BATCH_PACKAGES;
        failures += scan_batch(&refs, has_norm ? &norm_refs : NULL, &opt, opt.packages + i, n);
    }

    if (has_norm)
        free_references(&norm_refs);
    free_references(&refs);
    return failures ? 1 : 0;
}
