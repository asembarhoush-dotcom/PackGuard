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

#endif
