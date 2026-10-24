#include "prefilter.h"

#include <stdlib.h>
#include <string.h>

#define FNV_OFFSET UINT64_C(14695981039346656037)
#define FNV_PRIME  UINT64_C(1099511628211)

/* MurmurHash3's 64-bit finaliser: spreads every input bit over the output. */
static uint64_t fmix64(uint64_t k)
{
    k ^= k >> 33;
    k *= UINT64_C(0xff51afd7ed558ccd);
    k ^= k >> 33;
    k *= UINT64_C(0xc4ceb9fe1a85ec53);
    k ^= k >> 33;
    return k;
}

void lzjd_builder_init(lzjd_builder *b)
{
    *b = (lzjd_builder){0};
}

void lzjd_builder_free(lzjd_builder *b)
{
    if (b == NULL)
        return;
    free(b->slots);
    free(b->used);
    free(b->hashes);
    *b = (lzjd_builder){0};
}

/*
 * Makes sure b can hold a set of up to n phrases at a load factor of at
 * most one half and a list of n hashes, then empties the set.
 * Returns 0 on success, -1 if memory runs out.
 */
static int reserve(lzjd_builder *b, size_t n)
{
    size_t cap = 64;
    while (cap < 2 * n + 2)
        cap *= 2;
    if (cap > b->cap) {
        uint32_t *slots = malloc(cap * sizeof *slots);
        unsigned char *used = malloc(cap);
        if (slots == NULL || used == NULL) {
            free(slots);
            free(used);
            return -1;
        }
        free(b->slots);
        free(b->used);
        b->slots = slots;
        b->used = used;
        b->cap = cap;
    }
    if (n > b->hashes_cap) {
        uint32_t *hashes = malloc((n ? n : 1) * sizeof *hashes);
        if (hashes == NULL)
            return -1;
        free(b->hashes);
        b->hashes = hashes;
        b->hashes_cap = n;
    }
    memset(b->used, 0, b->cap);
    return 0;
}

/*
 * Adds h to the open-addressing set in b unless it is already there.
 * Returns 1 if h was added, 0 if it was already present.
 */
static int set_add(lzjd_builder *b, uint32_t h)
{
    size_t mask = b->cap - 1;
    size_t i = (size_t)h & mask;
    while (b->used[i]) {
        if (b->slots[i] == h)
            return 0;
        i = (i + 1) & mask;
    }
    b->used[i] = 1;
    b->slots[i] = h;
    return 1;
}

/* qsort() comparator for uint32_t values in ascending order. */
static int compare_u32(const void *pa, const void *pb)
{
    uint32_t a = *(const uint32_t *)pa, b = *(const uint32_t *)pb;
    return a < b ? -1 : a > b;
}

long lzjd_digest(lzjd_builder *b, const unsigned char *data, size_t len, uint32_t *out)
{
    if (b == NULL || out == NULL || (data == NULL && len > 0))
        return -1;
    if (reserve(b, len) != 0)
        return -1;

    size_t count = 0;
    uint64_t state = FNV_OFFSET;
    for (size_t i = 0; i < len; i++) {
        state = (state ^ data[i]) * FNV_PRIME;
        uint32_t h = (uint32_t)fmix64(state);
        if (set_add(b, h)) {
            b->hashes[count++] = h;
            state = FNV_OFFSET;
        }
    }

    if (count > 1)
        qsort(b->hashes, count, sizeof *b->hashes, compare_u32);
    size_t n = count < LZJD_K ? count : LZJD_K;
    if (n > 0)
        memcpy(out, b->hashes, n * sizeof *out);
    return (long)n;
}

double lzjd_similarity(const uint32_t *a, size_t alen, const uint32_t *b, size_t blen)
{
    size_t i = 0, j = 0, both = 0;
    while (i < alen && j < blen) {
        if (a[i] == b[j]) {
            both++;
            i++;
            j++;
        } else if (a[i] < b[j]) {
            i++;
        } else {
            j++;
        }
    }
    size_t either = alen + blen - both;
    return either ? (double)both / (double)either : 0.0;
}
