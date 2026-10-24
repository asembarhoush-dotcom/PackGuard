#ifndef PACKGUARD_SCANNER_H
#define PACKGUARD_SCANNER_H

#include "chunker.h"

#include <stddef.h>
#include <stdint.h>

/* One file read into memory and split into chunks. */
typedef struct {
    char *path;
    chunk_list chunks;
} loaded_file;

/* A growable list of loaded files in walk order. */
typedef struct {
    loaded_file *items;
    size_t count;
    size_t cap;
} file_list;

/* One distinct reference chunk, its first file and group, other groups holding it, and its C(x). */
typedef struct {
    const file_chunk *chunk;
    size_t file;
    size_t group;
    size_t extra_first;
    size_t extra_count;
    size_t csize;
} ref_chunk;

/* Lowest NCD found for one chunk and the index of the reference that gave it. */
typedef struct {
    double ncd;
    size_t ref;
} chunk_score;

/* LZJD similarity of one reference chunk to the chunk being scored. */
typedef struct {
    double similarity;
    size_t ref;
} ref_rank;

struct scan_worker;

/* Known-malware references with cached C(x) and LZJD digests, plus one encoder per thread. */
typedef struct {
    file_list files;
    ref_chunk *refs;
    size_t count;
    size_t total_chunks;
    char **group_names;
    size_t group_count;
    size_t *extra_groups;
    size_t extra_count;
    char **package_names;
    size_t package_count;
    size_t *file_package;
    size_t candidates;
    uint32_t *digests;
    size_t *digest_first;
    uint32_t *digest_len;
    ref_rank *ranks;
    size_t *subset;
    struct scan_worker *workers;
    size_t nthreads;
} reference_set;

/*
 * Adds path to list. A regular file is added whatever its name; a directory
 * is walked recursively in strcmp() order, skipping node_modules, and only
 * its .js, .cjs and .mjs files are added (matched case-sensitively, as npm
 * resolves them). Empty files are left out. Paths below the given one are
 * joined with '/' on every platform.
 *
 * Returns 0 on success, -1 on failure (with a message on stderr).
 */
int collect_files(file_list *list, const char *path);

/* Frees every file in list and resets it to empty. */
void free_files(file_list *list);

/*
 * Loads every .js, .cjs and .mjs file under dir as a reference, splits it
 * into chunks and keeps one copy of each distinct chunk (byte-identical
 * chunks give identical NCDs, so dropping repeats never changes a score;
 * the first one in walk order is kept). Then caches C(x) for every kept
 * chunk using nthreads threads, each with its own v1 encoder.
 * Each reference file also gets a group: the first path component below
 * dir (in v1, the code-shape folder), or its own name when it sits
 * directly in dir. group_names holds them in walk order. A kept chunk
 * belongs to its own group plus, in ascending order,
 * extra_groups[extra_first .. extra_first + extra_count) for every other
 * group that held a dropped copy, so per-group results stay exact.
 * Each file also gets a package: the second path component below dir when
 * there is one (in v1, <package>@<version>), otherwise the group;
 * package_names[file_package[file]] names it.
 * With candidates > 0 the LZJD digest of every kept chunk is computed too
 * (see lzjd_digest()), and score_chunk() runs NCD only against the
 * candidates references with the most similar digests. With 0 every
 * reference is scored and the result is exact.
 * set owns everything it points to; refs[i].chunk borrows from set->files
 * and stays valid until free_references().
 *
 * Returns 0 on success, -1 on failure; set is left empty on failure.
 */
int load_references(reference_set *set, const char *dir, size_t nthreads, size_t candidates);

/*
 * Scores chunk against every reference on all threads:
 * NCD(x, y) = (C(xy) - min(C(x), C(y))) / max(C(x), C(y)), with C(xy)
 * estimated as C(x) + C(y|x) (see compressed_size_given()), and stores the
 * lowest NCD in *out. Ties keep the reference that comes first.
 * When set->candidates > 0, only the set->candidates references whose LZJD
 * digests are most similar to the chunk's are scored (ties on similarity
 * keep the earlier reference), so the result can miss the true minimum.
 * When group_best is not NULL it must hold set->group_count entries and
 * receives the lowest NCD within each reference group among the
 * references scored; groups with none scored get DBL_MAX.
 * set is used exclusively for the duration of the call.
 *
 * Returns 0 on success, -1 on failure.
 */
int score_chunk(reference_set *set, const file_chunk *chunk, chunk_score *out, double *group_best);

/* Frees everything load_references() allocated and resets set to empty. */
void free_references(reference_set *set);

#endif
