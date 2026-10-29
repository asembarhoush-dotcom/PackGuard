#ifndef PACKGUARD_SCANNER_H
#define PACKGUARD_SCANNER_H

#include "chunker.h"
#include "prefilter.h"

#include <stddef.h>
#include <stdint.h>

typedef enum {
    FILE_JS,
    FILE_INSTALL_SCRIPT,
    FILE_OTHER
} file_kind;

/* One file read into memory, split into chunks and tagged with what it holds. */
typedef struct {
    char *path;
    chunk_list chunks;
    file_kind kind;
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

struct scan_worker;
struct thread_pool;

/* Known-malware references with cached C(x) and LZJD digests, plus one encoder per thread. */
typedef struct {
    file_list files;
    ref_chunk *refs;
    size_t count;
    size_t total_chunks;
    size_t boilerplate_chunks;
    char **group_names;
    size_t group_count;
    size_t *extra_groups;
    size_t extra_count;
    char **package_names;
    size_t package_count;
    size_t *file_package;
    size_t candidates;
    uint32_t *digest_len;
    lzjd_index index;
    uint64_t *exact_hash;
    size_t *exact_ref;
    size_t exact_cap;
    struct scan_worker *workers;
    struct thread_pool *pool;
    size_t nthreads;
} reference_set;

/*
 * Adds path to list. A regular file is added whatever its name; a directory
 * is walked recursively in strcmp() order, skipping node_modules, and only
 * its .js, .cjs and .mjs files (matched case-sensitively, as npm resolves
 * them) and its install_scripts.txt files are added. A package.json that is
 * the path itself or sits directly in it is added as its install-script
 * text only (see install_scripts()); deeper ones are skipped, since npm
 * runs no scripts from them. Empty files, and package.json files with no
 * install scripts, are left out. Paths below the given one are joined with
 * '/' on every platform. Every added file is tagged FILE_JS, FILE_INSTALL_SCRIPT
 * or FILE_OTHER: the first for .js, .cjs and .mjs, the second for package.json
 * and install_scripts.txt, the third for a file named directly on the command
 * line with another name.
 *
 * Returns 0 on success, -1 on failure (with a message on stderr).
 */
int collect_files(file_list *list, const char *path);

/*
 * Like collect_files(), with content-defined chunking when use_cdc is
 * nonzero. When normalise is nonzero only JavaScript files are collected and
 * each is replaced by its normalised token stream (see normalise_js()), with
 * encoded payloads decoded when decode is nonzero.
 *
 * Returns 0 on success, -1 on failure.
 */
int collect_files_ex(file_list *list, const char *path, int use_cdc, int normalise, int decode);

/* Frees every file in list and resets it to empty. */
void free_files(file_list *list);

/*
 * Loads every file under dir that collect_files() would add (.js, .cjs,
 * .mjs and install_scripts.txt) as a reference, splits it
 * into chunks and keeps one copy of each distinct chunk (byte-identical
 * chunks give identical NCDs, so dropping repeats never changes a score;
 * the first one in walk order is kept). When drop_boilerplate is nonzero,
 * chunks that hold only a compiled module stub (see is_boilerplate()) are
 * dropped next, and boilerplate_chunks counts them. Then caches C(x) for
 * every kept chunk using a pool of nthreads threads that is started once
 * here and reused by every later call, each thread with its own encoder.
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
 * (see lzjd_digest()) and turned into an inverted index from digest value
 * to references (see lzjd_top()); only the digest lengths are kept. Then
 * score_chunk() runs NCD only against the candidates references with the
 * most similar digests. With 0 every reference is scored and the result is
 * exact.
 * set owns everything it points to; refs[i].chunk borrows from set->files
 * and stays valid until free_references().
 *
 * Returns 0 on success, -1 on failure; set is left empty on failure.
 */
int load_references(reference_set *set, const char *dir, size_t nthreads, size_t candidates,
                    int drop_boilerplate);

/*
 * Like load_references(), with content-defined chunking when use_cdc is
 * nonzero, normalised JavaScript references when normalise is nonzero, and
 * encoded payloads decoded when decode is nonzero. When drop_boilerplate is
 * nonzero, raw reference chunks that are compiled module stubs are dropped;
 * normalised references keep every chunk, because stage 2 filters false
 * alarms. When use_exact_hash is nonzero an open-addressed hash table of the
 * kept chunks is built, so a byte-identical target chunk scores 0 without
 * running NCD.
 *
 * Returns 0 on success, -1 on failure; set is left empty on failure.
 */
int load_references_ex(reference_set *set, const char *dir, size_t nthreads, size_t candidates,
                       int drop_boilerplate, int use_cdc, int normalise, int decode,
                       int use_exact_hash);

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

/*
 * Scores chunks[0..count) as score_chunk() does and stores the results in
 * out[0..count); the results are identical. With at least as many chunks as
 * threads, each thread takes whole chunks one after another and scores them
 * on its own, so no thread waits for the others within a chunk; with fewer,
 * each chunk is split across all threads by score_chunk().
 * When group_best is not NULL it must hold count * set->group_count entries,
 * and row i (from i * set->group_count) receives chunk i's group results as
 * in score_chunk(). When seconds is not NULL, seconds[i] receives the time
 * spent scoring chunk i (on one thread, or on all of them for a split chunk).
 * set is used exclusively for the duration of the call.
 *
 * Returns 0 on success, -1 on failure.
 */
int score_chunks(reference_set *set, const file_chunk *const *chunks, size_t count,
                 chunk_score *out, double *group_best, double *seconds);

/* Frees everything load_references() allocated and resets set to empty. */
void free_references(reference_set *set);

#endif
