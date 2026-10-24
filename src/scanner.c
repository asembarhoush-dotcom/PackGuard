#include "scanner.h"

#include "compresser.h"
#include "platform.h"
#include "prefilter.h"

#include <errno.h>
#include <float.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WORK_BLOCK 64u

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
    const uint32_t *target_digest;
    size_t target_digest_len;
    ref_rank *ranks;
} pass;

/* A group that held a dropped copy of the kept reference chunk at index kept. */
typedef struct {
    size_t kept;
    size_t group;
} extra_pair;

/* One worker thread: its own encoder, its thread and its best results. */
struct scan_worker {
    compressor comp;
    thread_handle thread;
    pass *work;
    chunk_score best;
    double *group_best;
    lzjd_builder builder;
};

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

/*
 * Reads and splits the file at path and appends it to list.
 * Files with no chunks (empty files) are not added.
 * Returns 0 on success, -1 on failure.
 */
static int add_file(file_list *list, const char *path)
{
    chunk_list chunks;
    if (split_file(path, &chunks) != 0) {
        fprintf(stderr, "packguard: %s: %s\n", path, strerror(errno));
        return -1;
    }
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
    list->items[list->count++] = (loaded_file){copy, chunks};
    return 0;
}

/*
 * Adds path to list; top is 1 for the path the caller passed, which is
 * added even when its name is not .js, .cjs or .mjs.
 * Returns 0 on success, -1 on failure.
 */
static int collect(file_list *list, const char *path, int top)
{
    path_kind kind = path_type(path);
    if (kind == PATH_MISSING) {
        fprintf(stderr, "packguard: %s: no such file or directory\n", path);
        return -1;
    }
    if (kind == PATH_FILE)
        return top || is_js(path) ? add_file(list, path) : 0;
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
        rc = collect(list, child, 0);
        free(child);
    }
    free_names(names, n);
    return rc;
}

int collect_files(file_list *list, const char *path)
{
    return collect(list, path, 1);
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
 * Thread body for ranking references: claims WORK_BLOCK references at a
 * time and stores each one's LZJD similarity to the target in p->ranks.
 */
static void *similarity_worker(void *arg)
{
    struct scan_worker *w = arg;
    pass *p = w->work;
    for (;;) {
        size_t begin = atomic_fetch_add(&p->next, WORK_BLOCK);
        if (begin >= p->count || atomic_load(&p->failed))
            break;
        size_t end = begin + WORK_BLOCK < p->count ? begin + WORK_BLOCK : p->count;
        for (size_t i = begin; i < end; i++) {
            double s = lzjd_similarity(p->target_digest, p->target_digest_len,
                                       p->digests + p->digest_first[i], p->digest_len[i]);
            p->ranks[i] = (ref_rank){s, i};
        }
    }
    return NULL;
}

/* qsort() comparator that puts the most similar references first, earlier ones first on ties. */
static int compare_ranks(const void *pa, const void *pb)
{
    const ref_rank *a = pa, *b = pb;
    if (a->similarity != b->similarity)
        return a->similarity > b->similarity ? -1 : 1;
    return a->ref < b->ref ? -1 : a->ref > b->ref;
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
 * Thread body for scoring one target chunk: claims WORK_BLOCK references at
 * a time and keeps the lowest NCD it sees in w->best (the earliest reference
 * on ties).
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
        size_t begin = atomic_fetch_add(&p->next, WORK_BLOCK);
        if (begin >= p->count || atomic_load(&p->failed))
            break;
        size_t end = begin + WORK_BLOCK < p->count ? begin + WORK_BLOCK : p->count;
        for (size_t pos = begin; pos < end; pos++) {
            size_t i = p->subset ? p->subset[pos] : pos;
            const file_chunk *r = p->refs[i].chunk;
            size_t given;
            if (compressed_size_given(&w->comp, r->data, r->length,
                                      p->target->data, p->target->length, &given) != 0) {
                atomic_store(&p->failed, 1);
                break;
            }
            double d = ncd(p->refs[i].csize, p->target_csize, given);
            if (d < w->best.ncd || (d == w->best.ncd && i < w->best.ref))
                w->best = (chunk_score){d, i};
            if (p->want_groups) {
                const ref_chunk *ref = &p->refs[i];
                if (d < w->group_best[ref->group])
                    w->group_best[ref->group] = d;
                for (size_t e = 0; e < ref->extra_count; e++) {
                    size_t g = p->extra_groups[ref->extra_first + e];
                    if (d < w->group_best[g])
                        w->group_best[g] = d;
                }
            }
        }
    }
    return NULL;
}

/*
 * Runs body on every worker at once and waits for all of them.
 * Returns 0 on success, -1 if a thread could not start or a worker failed.
 */
static int run_pass(reference_set *set, pass *p, void *(*body)(void *))
{
    atomic_store(&p->next, 0);
    atomic_store(&p->failed, 0);
    size_t started = 0;
    for (; started < set->nthreads; started++) {
        set->workers[started].work = p;
        if (thread_start(&set->workers[started].thread, body, &set->workers[started]) != 0) {
            atomic_store(&p->failed, 1);
            break;
        }
    }
    for (size_t i = 0; i < started; i++)
        thread_join(&set->workers[i].thread);
    for (size_t i = 0; i < set->nthreads; i++)
        set->workers[i].work = NULL;
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
 * Computes the LZJD digest of every kept reference on all threads and packs
 * the digests end to end in set->digests (digest_first and digest_len
 * locate each one), then allocates the per-chunk ranking buffers.
 * Returns 0 on success, -1 on failure.
 */
static int build_digests(reference_set *set)
{
    set->digests = malloc(set->count * LZJD_K * sizeof *set->digests);
    set->digest_len = malloc(set->count * sizeof *set->digest_len);
    set->digest_first = malloc(set->count * sizeof *set->digest_first);
    set->ranks = malloc(set->count * sizeof *set->ranks);
    set->subset = malloc(set->count * sizeof *set->subset);
    if (set->digests == NULL || set->digest_len == NULL || set->digest_first == NULL
        || set->ranks == NULL || set->subset == NULL)
        return -1;
    pass p = {.refs = set->refs, .count = set->count, .digests = set->digests,
              .digest_len = set->digest_len};
    if (run_pass(set, &p, digest_worker) != 0)
        return -1;

    size_t pos = 0;
    for (size_t i = 0; i < set->count; i++) {
        memmove(set->digests + pos, set->digests + i * LZJD_K, set->digest_len[i] * sizeof *set->digests);
        set->digest_first[i] = pos;
        pos += set->digest_len[i];
    }
    uint32_t *packed = realloc(set->digests, (pos ? pos : 1) * sizeof *packed);
    if (packed != NULL)
        set->digests = packed;
    return 0;
}

int load_references(reference_set *set, const char *dir, size_t nthreads, size_t candidates)
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

    if (collect(&set->files, dir, 1) != 0)
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

int score_chunk(reference_set *set, const file_chunk *chunk, chunk_score *out, double *group_best)
{
    if (set == NULL || set->count == 0 || chunk == NULL || out == NULL)
        return -1;
    if (set->candidates > 0) {
        uint32_t digest[LZJD_K];
        long n = lzjd_digest(&set->workers[0].builder, chunk->data, chunk->length, digest);
        if (n < 0)
            return -1;
        pass r = {.refs = set->refs, .count = set->count, .digests = set->digests,
                  .digest_len = set->digest_len, .digest_first = set->digest_first,
                  .target_digest = digest, .target_digest_len = (size_t)n, .ranks = set->ranks};
        if (run_pass(set, &r, similarity_worker) != 0)
            return -1;
        qsort(set->ranks, set->count, sizeof *set->ranks, compare_ranks);
        for (size_t i = 0; i < set->candidates; i++)
            set->subset[i] = set->ranks[i].ref;
    }
    pass p = {.refs = set->refs, .count = set->candidates ? set->candidates : set->count,
              .target = chunk, .group_count = set->group_count, .extra_groups = set->extra_groups,
              .want_groups = group_best != NULL, .subset = set->candidates ? set->subset : NULL};
    if (compressed_size(&set->workers[0].comp, chunk->data, chunk->length, &p.target_csize) != 0)
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
    for (size_t i = 0; i < set->nthreads; i++)
        compressor_free(&set->workers[i].comp);
    if (set->workers != NULL) {
        for (size_t i = 0; i < set->nthreads; i++) {
            free(set->workers[i].group_best);
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
    free(set->digests);
    free(set->digest_len);
    free(set->digest_first);
    free(set->ranks);
    free(set->subset);
    free(set->refs);
    free_files(&set->files);
    *set = (reference_set){0};
}
