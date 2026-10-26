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

/* One reference's LZJD similarity to the query digest. */
struct lzjd_rank {
    double similarity;
    uint32_t ref;
};

/* Returns 1 if a ranks before b: more similar, or as similar with a lower reference index. */
static int rank_before(const struct lzjd_rank *a, const struct lzjd_rank *b)
{
    return a->similarity > b->similarity || (a->similarity == b->similarity && a->ref < b->ref);
}

/* qsort() comparator that orders lzjd_ranks by rank_before(). */
static int compare_rank(const void *pa, const void *pb)
{
    const struct lzjd_rank *a = pa, *b = pb;
    return rank_before(a, b) ? -1 : rank_before(b, a);
}

/*
 * Reorders r[0..m) so that the n entries that rank first (n < m) come
 * before all the others, in no particular order (quickselect).
 */
static void select_best(struct lzjd_rank *r, size_t m, size_t n)
{
    size_t lo = 0, hi = m;
    while (hi - lo > 1) {
        size_t mid = lo + (hi - lo) / 2;
        struct lzjd_rank pivot = r[mid];
        r[mid] = r[hi - 1];
        r[hi - 1] = pivot;
        size_t store = lo;
        for (size_t i = lo; i < hi - 1; i++) {
            if (rank_before(&r[i], &pivot)) {
                struct lzjd_rank t = r[i];
                r[i] = r[store];
                r[store++] = t;
            }
        }
        r[hi - 1] = r[store];
        r[store] = pivot;
        if (store == n || store + 1 == n)
            return;
        if (store < n)
            lo = store + 1;
        else
            hi = store;
    }
}

/* Sorts a[0..n) ascending with two 16-bit radix passes through tmp. Returns 0, or -1 if memory runs out. */
static int radix_sort(uint32_t *a, uint32_t *tmp, size_t n)
{
    size_t *count = malloc(65536 * sizeof *count);
    if (count == NULL)
        return -1;
    for (unsigned shift = 0; shift < 32; shift += 16) {
        memset(count, 0, 65536 * sizeof *count);
        for (size_t i = 0; i < n; i++)
            count[(a[i] >> shift) & 0xFFFFu]++;
        size_t pos = 0;
        for (size_t b = 0; b < 65536; b++) {
            size_t c = count[b];
            count[b] = pos;
            pos += c;
        }
        for (size_t i = 0; i < n; i++)
            tmp[count[(a[i] >> shift) & 0xFFFFu]++] = a[i];
        memcpy(a, tmp, n * sizeof *a);
    }
    free(count);
    return 0;
}

int lzjd_index_values(lzjd_index *ix, const uint32_t *digests, size_t total,
                      const uint32_t *digest_len, size_t ref_count)
{
    *ix = (lzjd_index){0};
    if (ref_count >= UINT32_MAX || (digests == NULL && total > 0))
        return -1;
    uint32_t *a = malloc((total ? total : 1) * sizeof *a);
    uint32_t *tmp = malloc((total ? total : 1) * sizeof *tmp);
    if (a == NULL || tmp == NULL) {
        free(a);
        free(tmp);
        return -1;
    }
    memcpy(a, digests, total * sizeof *a);
    int rc = radix_sort(a, tmp, total);
    free(tmp);
    if (rc != 0) {
        free(a);
        return -1;
    }
    size_t d = 0;
    for (size_t i = 0; i < total; i++)
        if (d == 0 || a[i] != a[d - 1])
            a[d++] = a[i];
    uint32_t *shrunk = realloc(a, (d ? d : 1) * sizeof *a);
    ix->values = shrunk ? shrunk : a;
    ix->value_count = d;
    ix->digest_len = digest_len;
    ix->ref_count = ref_count;
    return 0;
}

uint32_t lzjd_index_find(const lzjd_index *ix, uint32_t value)
{
    size_t lo = 0, hi = ix->value_count;
    while (lo < hi) {
        size_t mid = lo + (hi - lo) / 2;
        if (ix->values[mid] < value)
            lo = mid + 1;
        else
            hi = mid;
    }
    return (uint32_t)lo;
}

int lzjd_index_fill(lzjd_index *ix, const uint32_t *slot, const size_t *digest_first)
{
    size_t total = 0;
    for (size_t r = 0; r < ix->ref_count; r++)
        total += ix->digest_len[r];
    ix->first = calloc(ix->value_count + 1, sizeof *ix->first);
    ix->refs = malloc((total ? total : 1) * sizeof *ix->refs);
    size_t *cursor = malloc((ix->value_count ? ix->value_count : 1) * sizeof *cursor);
    if (ix->first == NULL || ix->refs == NULL || cursor == NULL) {
        free(cursor);
        return -1;
    }
    for (size_t i = 0; i < total; i++)
        ix->first[slot[i] + 1]++;
    for (size_t v = 0; v < ix->value_count; v++) {
        ix->first[v + 1] += ix->first[v];
        cursor[v] = ix->first[v];
    }
    for (size_t r = 0; r < ix->ref_count; r++)
        for (size_t j = 0; j < ix->digest_len[r]; j++)
            ix->refs[cursor[slot[digest_first[r] + j]]++] = (uint32_t)r;
    free(cursor);
    return 0;
}

void lzjd_index_free(lzjd_index *ix)
{
    if (ix == NULL)
        return;
    free(ix->values);
    free(ix->first);
    free(ix->refs);
    *ix = (lzjd_index){0};
}

int lzjd_query_init(lzjd_query *q, size_t ref_count)
{
    size_t n = ref_count ? ref_count : 1;
    q->hits = calloc(n, sizeof *q->hits);
    q->touched = malloc(n * sizeof *q->touched);
    q->ranks = malloc(n * sizeof *q->ranks);
    if (q->hits == NULL || q->touched == NULL || q->ranks == NULL) {
        lzjd_query_free(q);
        return -1;
    }
    return 0;
}

void lzjd_query_free(lzjd_query *q)
{
    if (q == NULL)
        return;
    free(q->hits);
    free(q->touched);
    free(q->ranks);
    *q = (lzjd_query){0};
}

void lzjd_top(const lzjd_index *ix, lzjd_query *q, const uint32_t *d, size_t dlen, size_t n, size_t *out)
{
    size_t t = 0;
    for (size_t j = 0; j < dlen; j++) {
        uint32_t v = lzjd_index_find(ix, d[j]);
        if (v == ix->value_count || ix->values[v] != d[j])
            continue;
        for (size_t p = ix->first[v]; p < ix->first[v + 1]; p++) {
            uint32_t r = ix->refs[p];
            if (q->hits[r]++ == 0)
                q->touched[t++] = r;
        }
    }
    for (size_t i = 0; i < t; i++) {
        uint32_t r = q->touched[i];
        size_t both = q->hits[r];
        size_t either = dlen + ix->digest_len[r] - both;
        q->ranks[i] = (struct lzjd_rank){either ? (double)both / (double)either : 0.0, r};
    }
    size_t m = t < n ? t : n;
    if (t > n)
        select_best(q->ranks, t, n);
    qsort(q->ranks, m, sizeof *q->ranks, compare_rank);
    for (size_t i = 0; i < m; i++)
        out[i] = q->ranks[i].ref;
    for (size_t r = 0; m < n && r < ix->ref_count; r++)
        if (q->hits[r] == 0)
            out[m++] = r;
    for (size_t i = 0; i < t; i++)
        q->hits[q->touched[i]] = 0;
}
