#include "scanner.h"

#include "boilerplate.h"
#include "compresser.h"
#include "manifest.h"
#include "normalise.h"
#include "platform.h"
#include "prefilter.h"

#include <errno.h>
#include <float.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WORK_BLOCK   64u
#define SCORE_BLOCK  16u
#define SCRIPTS_FILE "install_scripts.txt"

_Static_assert(COMPRESS_DICT_SIZE >= 2u * SPLIT_THRESHOLD,
               "the LZMA dictionary must hold a whole reference chunk and a whole target chunk");

/* Work shared by all threads in one parallel pass over the references. */
typedef struct {
    ref_chunk *refs;
    size_t count;
    atomic_size_t next;
    atomic_int failed;
    const file_chunk *target;
    size_t target_csize;
    size_t group_count;
    const size_t *extra_groups;
    int want_groups;
    const size_t *subset;
    uint32_t *digests;
    uint32_t *digest_len;
    const size_t *digest_first;
    const lzjd_index *index;
    uint32_t *slots;
} pass;

/* A group that held a dropped copy of the kept reference chunk at index kept. */
typedef struct {
    size_t kept;
    size_t group;
} extra_pair;

/* One pool thread's own encoder, LZJD scratch, ranking buffers and best results. */
struct scan_worker {
    compressor comp;
    pass *work;
    chunk_score best;
    double *group_best;
    lzjd_builder builder;
    lzjd_query query;
    size_t *subset;
};

/* A run of pass body on every pool thread. */
typedef struct {
    reference_set *set;
    pass *work;
    void *(*body)(void *);
} pass_job;

/* Target chunks that the pool threads take one at a time and score on their own. */
typedef struct {
    reference_set *set;
    const file_chunk *const *chunks;
    size_t count;
    chunk_score *out;
    double *group_best;
    double *seconds;
    atomic_size_t next;
    atomic_int failed;
} chunk_batch;

/* A reference chunk with its content hash, used only while removing repeats. */
typedef struct {
    uint64_t hash;
    size_t index;
    const file_chunk *chunk;
} chunk_key;

/* Returns 1 if name ends in .js, .cjs or .mjs, otherwise 0. */
static int is_js(const char *name)
{
    static const char *const exts[] = {".js", ".cjs", ".mjs"};
    size_t len = strlen(name);
    for (size_t i = 0; i < sizeof exts / sizeof exts[0]; i++) {
        size_t elen = strlen(exts[i]);
        if (len > elen && strcmp(name + len - elen, exts[i]) == 0)
            return 1;
    }
    return 0;
}

/* Returns 1 if the last component of path is exactly name, otherwise 0. */
static int has_name(const char *path, const char *name)
{
    size_t len = strlen(path);
    size_t start = len;
    while (start > 0 && !is_path_sep(path[start - 1]))
        start--;
    return strcmp(path + start, name) == 0;
}

/*
 * Appends path and its chunks to list, taking ownership of chunks.
 * Chunk lists with no chunks are freed and not added.
 * Returns 0 on success, -1 on failure.
 */
static int add_chunks(file_list *list, const char *path, chunk_list chunks, file_kind kind)
{
    if (chunks.count == 0) {
        free_chunks(&chunks);
        return 0;
    }
    if (list->count == list->cap) {
        size_t cap = list->cap ? list->cap * 2 : 1024;
        loaded_file *bigger = realloc(list->items, cap * sizeof *bigger);
        if (bigger == NULL) {
            free_chunks(&chunks);
            return -1;
        }
        list->items = bigger;
        list->cap = cap;
    }
    size_t len = strlen(path) + 1;
    char *copy = malloc(len);
    if (copy == NULL) {
        free_chunks(&chunks);
        return -1;
    }
    memcpy(copy, path, len);
    list->items[list->count++] = (loaded_file){copy, chunks, kind};
    return 0;
}

/*
 * Reads and splits the file at path and appends it to list, using
 * content-defined chunking when use_cdc is nonzero. Files with no chunks
 * (empty files) are not added.
 * Returns 0 on success, -1 on failure.
 */
static int add_file(file_list *list, const char *path, file_kind kind, int use_cdc)
{
    chunk_list chunks;
    int rc = use_cdc ? split_file_cdc(path, &chunks) : split_file(path, &chunks);
    if (rc != 0) {
        fprintf(stderr, "packguard: %s: %s\n", path, strerror(errno));
        return -1;
    }
    return add_chunks(list, path, chunks, kind);
}

/*
 * Reads the JavaScript file at path, replaces it with its normalised token
 * stream (decoding encoded payloads when decode is nonzero), splits that
 * stream and appends it to list under the original path.
 * Returns 0 on success, -1 on failure.
 */
static int add_normalised_file(file_list *list, const char *path, int use_cdc, int decode)
{
    size_t len = 0;
    unsigned char *raw = read_file(path, &len);
    if (raw == NULL) {
        fprintf(stderr, "packguard: %s: %s\n", path, strerror(errno));
        return -1;
    }
    size_t norm_len = 0;
    unsigned char *norm = normalise_js(raw, len, decode, &norm_len);
    free(raw);
    if (norm == NULL) {
        fprintf(stderr, "packguard: %s: normalising failed\n", path);
        return -1;
    }
    chunk_list chunks;
    int rc = use_cdc ? split_buffer_cdc(norm, norm_len, &chunks) : split_buffer(norm, norm_len, &chunks);
    if (rc != 0) {
        fprintf(stderr, "packguard: %s: %s\n", path, strerror(errno));
        return -1;
    }
    return add_chunks(list, path, chunks, FILE_JS);
}

/*
 * Reads the package.json at path, keeps only its install-script text (see
 * install_scripts()) and appends that to list under the same path.
 * A package.json with no install scripts is not added.
 * Returns 0 on success, -1 on failure.
 */
static int add_manifest(file_list *list, const char *path)
{
    size_t len = 0;
    unsigned char *json = read_file(path, &len);
    if (json == NULL) {
        fprintf(stderr, "packguard: %s: %s\n", path, strerror(errno));
        return -1;
    }
    unsigned char *text;
    size_t text_len;
    int rc = install_scripts(json, len, &text, &text_len);
    free(json);
    if (rc != 0)
        return -1;
    chunk_list chunks;
    if (split_buffer(text, text_len, &chunks) != 0)
        return -1;
    return add_chunks(list, path, chunks, FILE_INSTALL_SCRIPT);
}

/*
 * Adds path to list; depth is 0 for the path the caller passed, which is
 * added even when its name is not .js, .cjs or .mjs. A file named
 * package.json contributes only its install scripts (see install_scripts()),
 * and only when it is the path itself or directly inside it, since npm runs
 * the scripts of the package root only. A file named install_scripts.txt,
 * which is how reference sets store install scripts as they keep no
 * package.json, is added whole. Each added file is tagged with its kind:
 * FILE_INSTALL_SCRIPT for the two script names, FILE_JS for the three
 * JavaScript extensions, FILE_OTHER for any other file passed directly.
 * When normalise is nonzero only JavaScript files are added, each as its
 * normalised token stream. use_cdc selects content-defined chunking.
 * Returns 0 on success, -1 on failure.
 */
static int collect(file_list *list, const char *path, int depth, int use_cdc, int normalise, int decode)
{
    path_kind kind = path_type(path);
    if (kind == PATH_MISSING) {
        fprintf(stderr, "packguard: %s: no such file or directory\n", path);
        return -1;
    }
    if (kind == PATH_FILE) {
        if (has_name(path, "package.json"))
            return normalise || depth > 1 ? 0 : add_manifest(list, path);
        if (normalise)
            return is_js(path) ? add_normalised_file(list, path, use_cdc, decode) : 0;
        if (depth != 0 && !is_js(path) && !has_name(path, SCRIPTS_FILE))
            return 0;
        return add_file(list, path, has_name(path, SCRIPTS_FILE) ? FILE_INSTALL_SCRIPT
                               : is_js(path) ? FILE_JS : FILE_OTHER, use_cdc);
    }
    if (kind != PATH_DIR)
        return 0;

    char **names;
    size_t n;
    if (list_dir(path, &names, &n) != 0) {
        fprintf(stderr, "packguard: %s: %s\n", path, strerror(errno));
        return -1;
    }
    size_t plen = strlen(path);
    const char *sep = plen > 0 && is_path_sep(path[plen - 1]) ? "" : "/";
    int rc = 0;
    for (size_t i = 0; i < n && rc == 0; i++) {
        if (strcmp(names[i], "node_modules") == 0)
            continue;
        size_t len = plen + strlen(names[i]) + 2;
        char *child = malloc(len);
        if (child == NULL) {
            rc = -1;
            break;
        }
        snprintf(child, len, "%s%s%s", path, sep, names[i]);
        rc = collect(list, child, depth + 1, use_cdc, normalise, decode);
        free(child);
    }
    free_names(names, n);
    return rc;
}

int collect_files(file_list *list, const char *path)
{
    return collect(list, path, 0, 0, 0, 0);
}

int collect_files_ex(file_list *list, const char *path, int use_cdc, int normalise, int decode)
{
    return collect(list, path, 0, use_cdc, normalise, decode);
}

void free_files(file_list *list)
{
    for (size_t i = 0; i < list->count; i++) {
        free(list->items[i].path);
        free_chunks(&list->items[i].chunks);
    }
    free(list->items);
    *list = (file_list){0};
}

/* Returns the 64-bit FNV-1a hash of len bytes of data. */
static uint64_t fnv1a(const unsigned char *data, size_t len)
{
    uint64_t h = UINT64_C(14695981039346656037);
    for (size_t i = 0; i < len; i++) {
        h ^= data[i];
        h *= UINT64_C(1099511628211);
    }
    return h;
}

/*
 * qsort() comparator that orders chunk_keys by hash, then length, then
 * bytes, then original position, so identical chunks end up next to each
 * other with the earliest one first.
 */
static int compare_keys(const void *pa, const void *pb)
{
    const chunk_key *a = pa, *b = pb;
    if (a->hash != b->hash)
        return a->hash < b->hash ? -1 : 1;
    const file_chunk *ca = a->chunk, *cb = b->chunk;
    if (ca->length != cb->length)
        return ca->length < cb->length ? -1 : 1;
    int c = memcmp(ca->data, cb->data, ca->length);
    if (c != 0)
        return c;
    return a->index < b->index ? -1 : a->index > b->index;
}

/* Returns 1 if the chunks of keys a and b hold the same bytes, otherwise 0. */
static int same_chunk(const chunk_key *a, const chunk_key *b)
{
    return a->hash == b->hash && a->chunk->length == b->chunk->length
           && memcmp(a->chunk->data, b->chunk->data, a->chunk->length) == 0;
}

/*
 * Appends (kept, group) to the growing array *pairs.
 * Returns 0 on success, -1 if memory runs out.
 */
static int push_pair(extra_pair **pairs, size_t *len, size_t *cap, size_t kept, size_t group)
{
    if (*len == *cap) {
        size_t bigger_cap = *cap ? *cap * 2 : 1024;
        extra_pair *bigger = realloc(*pairs, bigger_cap * sizeof *bigger);
        if (bigger == NULL)
            return -1;
        *pairs = bigger;
        *cap = bigger_cap;
    }
    (*pairs)[(*len)++] = (extra_pair){kept, group};
    return 0;
}

/*
 * Removes byte-identical repeats from refs[0..*count), keeping the first of
 * each in the original order, and records for every kept chunk the other
 * groups that held a copy: they go into *extra_out (owned by the caller,
 * *extra_len entries) and each kept chunk's extra_first and extra_count
 * point into it. Returns 0 on success, -1 if memory runs out.
 */
static int drop_repeats(ref_chunk *refs, size_t *count, size_t **extra_out, size_t *extra_len)
{
    size_t n = *count;
    *extra_out = NULL;
    *extra_len = 0;
    int rc = -1;
    chunk_key *keys = malloc((n ? n : 1) * sizeof *keys);
    unsigned char *keep = calloc(n ? n : 1, 1);
    size_t *nextra = calloc(n ? n : 1, sizeof *nextra);
    size_t *cursor = malloc((n ? n : 1) * sizeof *cursor);
    extra_pair *pairs = NULL;
    size_t npairs = 0, cap = 0;
    size_t *extra = NULL;
    if (keys == NULL || keep == NULL || nextra == NULL || cursor == NULL)
        goto done;

    for (size_t i = 0; i < n; i++)
        keys[i] = (chunk_key){fnv1a(refs[i].chunk->data, refs[i].chunk->length), i, refs[i].chunk};
    qsort(keys, n, sizeof *keys, compare_keys);

    for (size_t i = 0; i < n;) {
        size_t end = i + 1;
        while (end < n && same_chunk(&keys[end - 1], &keys[end]))
            end++;
        size_t kept = keys[i].index;
        keep[kept] = 1;
        size_t prev = refs[kept].group;
        for (size_t t = i + 1; t < end; t++) {
            size_t g = refs[keys[t].index].group;
            if (g != prev) {
                if (push_pair(&pairs, &npairs, &cap, kept, g) != 0)
                    goto done;
                nextra[kept]++;
                prev = g;
            }
        }
        i = end;
    }

    extra = malloc((npairs ? npairs : 1) * sizeof *extra);
    if (extra == NULL)
        goto done;
    size_t pos = 0;
    for (size_t i = 0; i < n; i++) {
        cursor[i] = pos;
        if (keep[i])
            pos += nextra[i];
    }
    for (size_t i = 0; i < npairs; i++)
        extra[cursor[pairs[i].kept]++] = pairs[i].group;

    size_t k = 0;
    for (size_t i = 0; i < n; i++) {
        if (!keep[i])
            continue;
        refs[k] = refs[i];
        refs[k].extra_count = nextra[i];
        refs[k].extra_first = cursor[i] - nextra[i];
        k++;
    }
    *count = k;
    *extra_out = extra;
    *extra_len = npairs;
    extra = NULL;
    rc = 0;

done:
    free(extra);
    free(pairs);
    free(cursor);
    free(nextra);
    free(keep);
    free(keys);
    return rc;
}

/*
 * Thread body for caching C(x): claims WORK_BLOCK references at a time and
 * stores each one's compressed size.
 */
static void *cache_worker(void *arg)
{
    struct scan_worker *w = arg;
    pass *p = w->work;
    for (;;) {
        size_t begin = atomic_fetch_add(&p->next, WORK_BLOCK);
        if (begin >= p->count || atomic_load(&p->failed))
            break;
        size_t end = begin + WORK_BLOCK < p->count ? begin + WORK_BLOCK : p->count;
        for (size_t i = begin; i < end; i++) {
            const file_chunk *c = p->refs[i].chunk;
            if (compressed_size(&w->comp, c->data, c->length, &p->refs[i].csize) != 0) {
                atomic_store(&p->failed, 1);
                break;
            }
        }
    }
    return NULL;
}

/*
 * Thread body for computing LZJD digests: claims WORK_BLOCK references at a
 * time and writes each one's digest to its LZJD_K slot in p->digests.
 */
static void *digest_worker(void *arg)
{
    struct scan_worker *w = arg;
    pass *p = w->work;
    for (;;) {
        size_t begin = atomic_fetch_add(&p->next, WORK_BLOCK);
        if (begin >= p->count || atomic_load(&p->failed))
            break;
        size_t end = begin + WORK_BLOCK < p->count ? begin + WORK_BLOCK : p->count;
        for (size_t i = begin; i < end; i++) {
            const file_chunk *c = p->refs[i].chunk;
            long n = lzjd_digest(&w->builder, c->data, c->length, p->digests + i * LZJD_K);
            if (n < 0) {
                atomic_store(&p->failed, 1);
                break;
            }
            p->digest_len[i] = (uint32_t)n;
        }
    }
    return NULL;
}

/*
 * Thread body for building the index: claims WORK_BLOCK references at a time
 * and stores, for each value of their packed digests, its position in
 * p->index->values in p->slots.
 */
static void *slot_worker(void *arg)
{
    struct scan_worker *w = arg;
    pass *p = w->work;
    for (;;) {
        size_t begin = atomic_fetch_add(&p->next, WORK_BLOCK);
        if (begin >= p->count)
            break;
        size_t end = begin + WORK_BLOCK < p->count ? begin + WORK_BLOCK : p->count;
        for (size_t i = begin; i < end; i++)
            for (size_t j = 0; j < p->digest_len[i]; j++)
                p->slots[p->digest_first[i] + j] = lzjd_index_find(p->index, p->digests[p->digest_first[i] + j]);
    }
    return NULL;
}

/*
 * NCD(x, y) = (C(xy) - min(C(x), C(y))) / max(C(x), C(y)), with C(xy)
 * estimated as C(x) + C(y|x) so only the target is compressed per pair.
 */
static double ncd(size_t cx, size_t cy, size_t cy_given_x)
{
    size_t lo = cx < cy ? cx : cy;
    size_t hi = cx < cy ? cy : cx;
    return ((double)(cx + cy_given_x) - (double)lo) / (double)hi;
}

/*
 * Scores the target of p against candidates begin..end (positions in
 * p->subset when it is set, otherwise reference indexes) with encoder comp.
 * Keeps the lowest NCD in *best (the earliest reference on ties) and, when
 * p->want_groups, the lowest NCD per group in group_best.
 * Returns 0 on success, -1 if compression fails.
 */
static int score_range(const pass *p, compressor *comp, size_t begin, size_t end,
                       chunk_score *best, double *group_best)
{
    for (size_t pos = begin; pos < end; pos++) {
        size_t i = p->subset ? p->subset[pos] : pos;
        const file_chunk *r = p->refs[i].chunk;
        size_t given;
        if (compressed_size_given(comp, r->data, r->length, p->target->data, p->target->length, &given) != 0)
            return -1;
        double d = ncd(p->refs[i].csize, p->target_csize, given);
        if (d < best->ncd || (d == best->ncd && i < best->ref))
            *best = (chunk_score){d, i};
        if (p->want_groups) {
            const ref_chunk *ref = &p->refs[i];
            if (d < group_best[ref->group])
                group_best[ref->group] = d;
            for (size_t e = 0; e < ref->extra_count; e++) {
                size_t g = p->extra_groups[ref->extra_first + e];
                if (d < group_best[g])
                    group_best[g] = d;
            }
        }
    }
    return 0;
}

/*
 * Thread body for scoring one target chunk: claims SCORE_BLOCK candidates at
 * a time and keeps the lowest NCD it sees in w->best (the earliest reference
 * on ties). The small block keeps all threads busy on the few hundred
 * candidates the prefilter leaves.
 */
static void *score_worker(void *arg)
{
    struct scan_worker *w = arg;
    pass *p = w->work;
    w->best = (chunk_score){DBL_MAX, SIZE_MAX};
    if (p->want_groups)
        for (size_t g = 0; g < p->group_count; g++)
            w->group_best[g] = DBL_MAX;
    for (;;) {
        size_t begin = atomic_fetch_add(&p->next, SCORE_BLOCK);
        if (begin >= p->count || atomic_load(&p->failed))
            break;
        size_t end = begin + SCORE_BLOCK < p->count ? begin + SCORE_BLOCK : p->count;
        if (score_range(p, &w->comp, begin, end, &w->best, w->group_best) != 0) {
            atomic_store(&p->failed, 1);
            break;
        }
    }
    return NULL;
}

/* Pool job that runs a pass_job's body on the calling pool thread's worker. */
static void run_body(void *arg, size_t worker)
{
    pass_job *job = arg;
    struct scan_worker *w = &job->set->workers[worker];
    w->work = job->work;
    job->body(w);
    w->work = NULL;
}

/*
 * Runs body on every pool thread at once and waits for all of them.
 * Returns 0 on success, -1 if a worker failed.
 */
static int run_pass(reference_set *set, pass *p, void *(*body)(void *))
{
    atomic_store(&p->next, 0);
    atomic_store(&p->failed, 0);
    pass_job job = {set, p, body};
    pool_run(set->pool, run_body, &job);
    return atomic_load(&p->failed) ? -1 : 0;
}

/*
 * Stores in *start and *len the group key of the reference file at path
 * loaded from dir: the first path component below dir, or the file's own
 * name when it sits directly in dir or dir is the file itself.
 */
static void group_key(const char *path, const char *dir, const char **start, size_t *len)
{
    const char *rel = path;
    size_t dlen = strlen(dir);
    if (strncmp(path, dir, dlen) == 0)
        rel = path + dlen;
    while (is_path_sep(*rel))
        rel++;
    if (*rel == '\0') {
        rel = path;
        for (const char *p = path; *p; p++)
            if (is_path_sep(*p) && p[1] != '\0')
                rel = p + 1;
    }
    size_t n = 0;
    while (rel[n] != '\0' && !is_path_sep(rel[n]))
        n++;
    *start = rel;
    *len = n;
}

/*
 * Stores in *start and *len the package key of the reference file at path
 * loaded from dir: the second path component below dir when the file sits
 * at least two folders down (in v1, <package>@<version>), otherwise the
 * group key.
 */
static void package_key(const char *path, const char *dir, const char **start, size_t *len)
{
    group_key(path, dir, start, len);
    const char *second = *start + *len;
    if (!is_path_sep(*second))
        return;
    second++;
    size_t n = 0;
    while (second[n] != '\0' && !is_path_sep(second[n]))
        n++;
    if (n > 0 && is_path_sep(second[n])) {
        *start = second;
        *len = n;
    }
}

/*
 * Gives every reference file an id from key and fills *names (owned by the
 * caller, *count entries) with one copy of each distinct key in walk order;
 * consecutive files with the same key share an id. Returns 0 on success,
 * -1 if memory runs out (*names and *count then hold what was made so far).
 */
static int assign_names(const reference_set *set, const char *dir,
                        void (*key)(const char *, const char *, const char **, size_t *),
                        char ***names, size_t *count, size_t *file_id)
{
    *names = malloc(set->files.count * sizeof **names);
    *count = 0;
    if (*names == NULL)
        return -1;
    const char *prev = NULL;
    size_t prev_len = 0;
    for (size_t i = 0; i < set->files.count; i++) {
        const char *k;
        size_t len;
        key(set->files.items[i].path, dir, &k, &len);
        if (prev == NULL || len != prev_len || memcmp(k, prev, len) != 0) {
            char *name = malloc(len + 1);
            if (name == NULL)
                return -1;
            memcpy(name, k, len);
            name[len] = '\0';
            (*names)[(*count)++] = name;
            prev = k;
            prev_len = len;
        }
        file_id[i] = *count - 1;
    }
    return 0;
}

/*
 * Computes the LZJD digest of every kept reference on all threads, packs the
 * digests end to end and turns them into set->index (the slot lookups also
 * run on all threads). Only set->digest_len outlives the call. Then gives
 * every worker its own query buffers and candidate list.
 * Returns 0 on success, -1 on failure.
 */
static int build_digests(reference_set *set)
{
    int rc = -1;
    uint32_t *digests = malloc(set->count * LZJD_K * sizeof *digests);
    size_t *first = malloc(set->count * sizeof *first);
    uint32_t *slots = NULL;
    set->digest_len = malloc(set->count * sizeof *set->digest_len);
    if (digests == NULL || first == NULL || set->digest_len == NULL)
        goto done;
    pass p = {.refs = set->refs, .count = set->count, .digests = digests, .digest_len = set->digest_len};
    if (run_pass(set, &p, digest_worker) != 0)
        goto done;

    size_t pos = 0;
    for (size_t i = 0; i < set->count; i++) {
        memmove(digests + pos, digests + i * LZJD_K, set->digest_len[i] * sizeof *digests);
        first[i] = pos;
        pos += set->digest_len[i];
    }
    if (lzjd_index_values(&set->index, digests, pos, set->digest_len, set->count) != 0)
        goto done;
    slots = malloc((pos ? pos : 1) * sizeof *slots);
    if (slots == NULL)
        goto done;
    pass s = {.refs = set->refs, .count = set->count, .digests = digests, .digest_len = set->digest_len,
              .digest_first = first, .index = &set->index, .slots = slots};
    if (run_pass(set, &s, slot_worker) != 0)
        goto done;
    free(digests);
    digests = NULL;
    if (lzjd_index_fill(&set->index, slots, first) != 0)
        goto done;

    for (size_t i = 0; i < set->nthreads; i++) {
        set->workers[i].subset = malloc(set->candidates * sizeof *set->workers[i].subset);
        if (set->workers[i].subset == NULL || lzjd_query_init(&set->workers[i].query, set->count) != 0)
            goto done;
    }
    rc = 0;

done:
    free(slots);
    free(first);
    free(digests);
    return rc;
}

/* Returns the 64-bit FNV-1a hash of one chunk. */
static uint64_t chunk_hash(const file_chunk *chunk)
{
    uint64_t h = UINT64_C(14695981039346656037);
    for (size_t i = 0; i < chunk->length; i++) {
        h ^= chunk->data[i];
        h *= UINT64_C(1099511628211);
    }
    return h;
}

/*
 * Builds an open-addressed table over the kept reference chunks, keyed by
 * their content hash and verified with memcmp on lookup.
 * Returns 0 on success, -1 if memory runs out.
 */
static int exact_hash_build(reference_set *set)
{
    size_t cap = 1;
    while (cap < set->count * 2) {
        if (cap > SIZE_MAX / 2)
            return -1;
        cap *= 2;
    }
    uint64_t *hashes = malloc(cap * sizeof *hashes);
    size_t *refs = malloc(cap * sizeof *refs);
    if (hashes == NULL || refs == NULL) {
        free(hashes);
        free(refs);
        return -1;
    }
    for (size_t i = 0; i < cap; i++)
        refs[i] = SIZE_MAX;
    for (size_t i = 0; i < set->count; i++) {
        uint64_t h = chunk_hash(set->refs[i].chunk);
        size_t pos = (size_t)h & (cap - 1);
        while (refs[pos] != SIZE_MAX)
            pos = (pos + 1) & (cap - 1);
        hashes[pos] = h;
        refs[pos] = i;
    }
    set->exact_hash = hashes;
    set->exact_ref = refs;
    set->exact_cap = cap;
    return 0;
}

/* Returns the reference index of a byte-identical chunk, or SIZE_MAX. */
static size_t exact_hash_find(const reference_set *set, const file_chunk *chunk)
{
    if (set->exact_cap == 0)
        return SIZE_MAX;
    uint64_t h = chunk_hash(chunk);
    size_t pos = (size_t)h & (set->exact_cap - 1);
    while (set->exact_ref[pos] != SIZE_MAX) {
        if (set->exact_hash[pos] == h) {
            size_t r = set->exact_ref[pos];
            const file_chunk *c = set->refs[r].chunk;
            if (c->length == chunk->length && memcmp(c->data, chunk->data, c->length) == 0)
                return r;
        }
        pos = (pos + 1) & (set->exact_cap - 1);
    }
    return SIZE_MAX;
}

/* Marks an exact reference hit as distance zero in the group results. */
static void group_hit(const reference_set *set, size_t ref, double *group_best)
{
    if (group_best == NULL)
        return;
    for (size_t g = 0; g < set->group_count; g++)
        group_best[g] = DBL_MAX;
    const ref_chunk *r = &set->refs[ref];
    group_best[r->group] = 0.0;
    for (size_t e = 0; e < r->extra_count; e++)
        group_best[set->extra_groups[r->extra_first + e]] = 0.0;
}

int load_references_ex(reference_set *set, const char *dir, size_t nthreads, size_t candidates,
                       int drop_boilerplate, int use_cdc, int normalise, int decode,
                       int use_exact_hash)
{
    size_t *file_group = NULL;
    *set = (reference_set){0};
    if (nthreads == 0)
        nthreads = 1;

    set->workers = calloc(nthreads, sizeof *set->workers);
    if (set->workers == NULL)
        goto fail;
    for (; set->nthreads < nthreads; set->nthreads++)
        if (compressor_init(&set->workers[set->nthreads].comp, COMPRESS_PRESET,
                            COMPRESS_DICT_SIZE, COMPRESS_LC) != 0)
            goto fail;
    set->pool = pool_create(nthreads);
    if (set->pool == NULL) {
        fprintf(stderr, "packguard: could not start %zu threads\n", nthreads);
        goto fail;
    }

    if (collect(&set->files, dir, 0, use_cdc, normalise, decode) != 0)
        goto fail;
    for (size_t i = 0; i < set->files.count; i++)
        set->total_chunks += set->files.items[i].chunks.count;
    if (set->total_chunks == 0) {
        fprintf(stderr, "packguard: %s: no reference files\n", dir);
        goto fail;
    }

    file_group = malloc(set->files.count * sizeof *file_group);
    set->file_package = malloc(set->files.count * sizeof *set->file_package);
    if (file_group == NULL || set->file_package == NULL
        || assign_names(set, dir, group_key, &set->group_names, &set->group_count, file_group) != 0
        || assign_names(set, dir, package_key, &set->package_names, &set->package_count,
                        set->file_package) != 0)
        goto fail;
    for (size_t i = 0; i < set->nthreads; i++)
        lzjd_builder_init(&set->workers[i].builder);
    for (size_t i = 0; i < set->nthreads; i++) {
        set->workers[i].group_best = malloc(set->group_count * sizeof *set->workers[i].group_best);
        if (set->workers[i].group_best == NULL)
            goto fail;
    }

    set->refs = malloc(set->total_chunks * sizeof *set->refs);
    if (set->refs == NULL)
        goto fail;
    for (size_t i = 0; i < set->files.count; i++)
        for (size_t j = 0; j < set->files.items[i].chunks.count; j++)
            set->refs[set->count++] = (ref_chunk){&set->files.items[i].chunks.chunks[j], i, file_group[i], 0, 0, 0};
    free(file_group);
    file_group = NULL;
    if (drop_repeats(set->refs, &set->count, &set->extra_groups, &set->extra_count) != 0)
        goto fail;
    if (drop_boilerplate) {
        size_t kept = 0;
        for (size_t i = 0; i < set->count; i++)
            if (!is_boilerplate(set->refs[i].chunk->data, set->refs[i].chunk->length))
                set->refs[kept++] = set->refs[i];
        set->boilerplate_chunks = set->count - kept;
        set->count = kept;
        if (set->count == 0) {
            fprintf(stderr, "packguard: %s: no reference chunks after dropping boilerplate\n", dir);
            goto fail;
        }
    }
    if (use_exact_hash && exact_hash_build(set) != 0)
        goto fail;

    pass p = {.refs = set->refs, .count = set->count};
    if (run_pass(set, &p, cache_worker) != 0)
        goto fail;
    if (candidates > 0 && candidates < set->count) {
        set->candidates = candidates;
        if (build_digests(set) != 0)
            goto fail;
    }
    return 0;

fail:
    free(file_group);
    free_references(set);
    return -1;
}

int load_references(reference_set *set, const char *dir, size_t nthreads, size_t candidates,
                    int drop_boilerplate)
{
    return load_references_ex(set, dir, nthreads, candidates, drop_boilerplate, 0, 0, 0, 0);
}

/*
 * Puts in w->subset the set->candidates references whose LZJD digests are
 * most similar to chunk's (see lzjd_top()), using worker w's scratch space.
 * Returns 0 on success, -1 if memory runs out.
 */
static int pick_candidates(const reference_set *set, struct scan_worker *w, const file_chunk *chunk)
{
    uint32_t digest[LZJD_K];
    long n = lzjd_digest(&w->builder, chunk->data, chunk->length, digest);
    if (n < 0)
        return -1;
    lzjd_top(&set->index, &w->query, digest, (size_t)n, set->candidates, w->subset);
    return 0;
}

/*
 * Scores chunk on the calling thread alone with worker w's encoder and
 * buffers, exactly as score_chunk() does across all threads: the same
 * candidates, the same lowest NCD and the same tie rule. When group_best is
 * not NULL it receives set->group_count per-group results.
 * Returns 0 on success, -1 on failure.
 */
static int score_alone(const reference_set *set, struct scan_worker *w, const file_chunk *chunk,
                       chunk_score *out, double *group_best)
{
    size_t exact = exact_hash_find(set, chunk);
    if (exact != SIZE_MAX) {
        *out = (chunk_score){0.0, exact};
        group_hit(set, exact, group_best);
        return 0;
    }
    pass p = {.refs = set->refs, .count = set->candidates ? set->candidates : set->count,
              .target = chunk, .group_count = set->group_count, .extra_groups = set->extra_groups,
              .want_groups = group_best != NULL, .subset = set->candidates ? w->subset : NULL};
    if (compressed_size(&w->comp, chunk->data, chunk->length, &p.target_csize) != 0)
        return -1;
    if (set->candidates > 0 && pick_candidates(set, w, chunk) != 0)
        return -1;
    *out = (chunk_score){DBL_MAX, SIZE_MAX};
    if (group_best != NULL)
        for (size_t g = 0; g < set->group_count; g++)
            group_best[g] = DBL_MAX;
    if (score_range(&p, &w->comp, 0, p.count, out, group_best) != 0)
        return -1;
    return out->ref == SIZE_MAX ? -1 : 0;
}

/* Pool job: each thread takes the next chunk of a chunk_batch and scores it alone. */
static void batch_worker(void *arg, size_t worker)
{
    chunk_batch *b = arg;
    struct scan_worker *w = &b->set->workers[worker];
    for (;;) {
        size_t i = atomic_fetch_add(&b->next, 1);
        if (i >= b->count || atomic_load(&b->failed))
            break;
        double t0 = now_seconds();
        double *row = b->group_best ? b->group_best + i * b->set->group_count : NULL;
        if (score_alone(b->set, w, b->chunks[i], &b->out[i], row) != 0) {
            atomic_store(&b->failed, 1);
            break;
        }
        if (b->seconds != NULL)
            b->seconds[i] = now_seconds() - t0;
    }
}

int score_chunks(reference_set *set, const file_chunk *const *chunks, size_t count,
                 chunk_score *out, double *group_best, double *seconds)
{
    if (set == NULL || set->count == 0 || (chunks == NULL && count > 0) || (out == NULL && count > 0))
        return -1;
    if (count < set->nthreads) {
        for (size_t i = 0; i < count; i++) {
            double t0 = now_seconds();
            double *row = group_best ? group_best + i * set->group_count : NULL;
            if (score_chunk(set, chunks[i], &out[i], row) != 0)
                return -1;
            if (seconds != NULL)
                seconds[i] = now_seconds() - t0;
        }
        return 0;
    }
    chunk_batch b = {.set = set, .chunks = chunks, .count = count, .out = out,
                     .group_best = group_best, .seconds = seconds};
    atomic_init(&b.next, 0);
    atomic_init(&b.failed, 0);
    pool_run(set->pool, batch_worker, &b);
    return atomic_load(&b.failed) ? -1 : 0;
}

int score_chunk(reference_set *set, const file_chunk *chunk, chunk_score *out, double *group_best)
{
    if (set == NULL || set->count == 0 || chunk == NULL || out == NULL)
        return -1;
    size_t exact = exact_hash_find(set, chunk);
    if (exact != SIZE_MAX) {
        *out = (chunk_score){0.0, exact};
        group_hit(set, exact, group_best);
        return 0;
    }
    struct scan_worker *lead = &set->workers[0];
    if (set->candidates > 0 && pick_candidates(set, lead, chunk) != 0)
        return -1;
    pass p = {.refs = set->refs, .count = set->candidates ? set->candidates : set->count,
              .target = chunk, .group_count = set->group_count, .extra_groups = set->extra_groups,
              .want_groups = group_best != NULL, .subset = set->candidates ? lead->subset : NULL};
    if (compressed_size(&lead->comp, chunk->data, chunk->length, &p.target_csize) != 0)
        return -1;
    if (run_pass(set, &p, score_worker) != 0)
        return -1;

    *out = (chunk_score){DBL_MAX, SIZE_MAX};
    for (size_t i = 0; i < set->nthreads; i++) {
        chunk_score b = set->workers[i].best;
        if (b.ncd < out->ncd || (b.ncd == out->ncd && b.ref < out->ref))
            *out = b;
    }
    if (group_best != NULL) {
        for (size_t g = 0; g < set->group_count; g++) {
            group_best[g] = DBL_MAX;
            for (size_t i = 0; i < set->nthreads; i++)
                if (set->workers[i].group_best[g] < group_best[g])
                    group_best[g] = set->workers[i].group_best[g];
        }
    }
    return out->ref == SIZE_MAX ? -1 : 0;
}

void free_references(reference_set *set)
{
    if (set == NULL)
        return;
    pool_free(set->pool);
    for (size_t i = 0; i < set->nthreads; i++)
        compressor_free(&set->workers[i].comp);
    if (set->workers != NULL) {
        for (size_t i = 0; i < set->nthreads; i++) {
            free(set->workers[i].group_best);
            lzjd_query_free(&set->workers[i].query);
            free(set->workers[i].subset);
            lzjd_builder_free(&set->workers[i].builder);
        }
    }
    free(set->workers);
    for (size_t i = 0; i < set->group_count; i++)
        free(set->group_names[i]);
    free(set->group_names);
    for (size_t i = 0; i < set->package_count; i++)
        free(set->package_names[i]);
    free(set->package_names);
    free(set->file_package);
    free(set->extra_groups);
    lzjd_index_free(&set->index);
    free(set->digest_len);
    free(set->exact_hash);
    free(set->exact_ref);
    free(set->refs);
    free_files(&set->files);
    *set = (reference_set){0};
}
