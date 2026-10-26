#ifndef PACKGUARD_PREFILTER_H
#define PACKGUARD_PREFILTER_H

#include <stddef.h>
#include <stdint.h>

#define LZJD_K 1024u

/* Reusable scratch space for building LZJD digests; one per thread. */
typedef struct {
    uint32_t *slots;
    unsigned char *used;
    size_t cap;
    uint32_t *hashes;
    size_t hashes_cap;
} lzjd_builder;

/*
 * Prepares b with no memory; lzjd_digest() grows it as needed.
 * Release it with lzjd_builder_free().
 */
void lzjd_builder_init(lzjd_builder *b);

/* Frees the scratch space of b and resets it to empty. */
void lzjd_builder_free(lzjd_builder *b);

/*
 * Computes the LZJD digest of len bytes of data (Raff and Nicholas, 2017,
 * "Lempel-Ziv Jaccard Distance, an effective alternative to ssdeep and
 * sdhash"). The data is parsed into its Lempel-Ziv set: a phrase grows one
 * byte at a time until it is not yet in the set, then it is added and the
 * next phrase starts. Each phrase is hashed incrementally (64-bit FNV-1a
 * mixed with the MurmurHash3 fmix64 finaliser, kept as 32 bits), and the
 * LZJD_K smallest distinct hashes are written to out in ascending order
 * (a bottom-k min-hash). out must hold LZJD_K values.
 *
 * Returns the number of values written (fewer than LZJD_K for short data),
 * or -1 if memory runs out.
 */
long lzjd_digest(lzjd_builder *b, const unsigned char *data, size_t len, uint32_t *out);

/*
 * Estimates the Jaccard similarity of two LZJD digests, each sorted in
 * ascending order, as |A and B| / |A or B| over the digest values.
 * Returns a value from 0 (nothing shared) to 1 (identical digests);
 * two empty digests give 0.
 */
double lzjd_similarity(const uint32_t *a, size_t alen, const uint32_t *b, size_t blen);

/* Inverted index from LZJD digest values to the references whose digests hold them. */
typedef struct {
    uint32_t *values;
    size_t *first;
    uint32_t *refs;
    size_t value_count;
    const uint32_t *digest_len;
    size_t ref_count;
} lzjd_index;

/* One thread's scratch space for lzjd_top(). */
typedef struct {
    uint32_t *hits;
    uint32_t *touched;
    struct lzjd_rank *ranks;
} lzjd_query;

/*
 * First step of building ix over ref_count references whose digests are
 * packed end to end in digests (total values in all). Stores the distinct
 * values, sorted, in ix->values and borrows digest_len (one length per
 * reference), which must outlive ix.
 * Returns 0 on success, -1 if memory runs out or there are 2^32 references
 * or more.
 */
int lzjd_index_values(lzjd_index *ix, const uint32_t *digests, size_t total,
                      const uint32_t *digest_len, size_t ref_count);

/* Returns the position of value in ix->values, which must hold it. */
uint32_t lzjd_index_find(const lzjd_index *ix, uint32_t value);

/*
 * Last step of building ix: slot[i] is lzjd_index_find() of the i-th value
 * in the packed digests (see lzjd_index_values()). Fills the posting lists
 * so that each value lists its references in ascending order.
 * Returns 0 on success, -1 if memory runs out.
 */
int lzjd_index_fill(lzjd_index *ix, const uint32_t *slot, const size_t *digest_first);

/* Frees ix and resets it to empty. */
void lzjd_index_free(lzjd_index *ix);

/*
 * Prepares q for an index over ref_count references.
 * Returns 0 on success, -1 if memory runs out; release q with lzjd_query_free().
 */
int lzjd_query_init(lzjd_query *q, size_t ref_count);

/* Frees q and resets it to empty. */
void lzjd_query_free(lzjd_query *q);

/*
 * Writes to out the n references (n at most ix->ref_count) most similar to
 * the digest d (dlen values, ascending, distinct) by lzjd_similarity(): most
 * similar first, lower reference index first on equal similarity. This is
 * exactly the order a full sort of every reference gives, but only the
 * references that share a value with d are looked at.
 */
void lzjd_top(const lzjd_index *ix, lzjd_query *q, const uint32_t *d, size_t dlen, size_t n, size_t *out);

#endif
