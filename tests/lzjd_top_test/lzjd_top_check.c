#include "prefilter.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define REFS    3000
#define QUERIES 300

static const char *const words[] = {
    "function", "return", "const", "let", "var", "require", "module.exports", "process.env",
    "if", "else", "for", "while", "new", "this", "await", "async", "=>", "{", "}", "(", ")",
    ";", ",", ".", "=", "+", "http", "https", "child_process", "exec", "Buffer.from", "base64",
    "os.homedir()", "fs.readFileSync", "JSON.stringify", "token", "user", "data", "callback",
    "options", "\n", " ", "  ", "'use strict'", "0x1f", "42", "true", "false", "null"};

/* Advances the generator state and returns a pseudo-random 32-bit number (xorshift32). */
static unsigned next_random(unsigned *s)
{
    unsigned x = *s;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return *s = x;
}

/*
 * Writes JavaScript-like text of 100 to 4,000 bytes into buf from family
 * seed fam (texts of one family share most of their words) and variant
 * seed var, and returns its length.
 */
static size_t make_text(char *buf, unsigned fam, unsigned var)
{
    unsigned f = fam * 2654435761u + 1, v = var * 40503u + 7;
    size_t want = 100 + next_random(&f) % 3900, len = 0;
    while (len < want) {
        unsigned r = next_random(&v) % 10 < 7 ? next_random(&f) : next_random(&v);
        const char *w = words[r % (sizeof words / sizeof words[0])];
        size_t n = strlen(w);
        if (len + n > want)
            break;
        memcpy(buf + len, w, n);
        len += n;
    }
    return len;
}

/* Similarity of one reference used by the full-sort reference answer. */
typedef struct {
    double similarity;
    size_t ref;
} full_rank;

/* qsort() comparator: most similar first, lower reference index first on ties. */
static int compare_full(const void *pa, const void *pb)
{
    const full_rank *a = pa, *b = pb;
    if (a->similarity != b->similarity)
        return a->similarity > b->similarity ? -1 : 1;
    return a->ref < b->ref ? -1 : a->ref > b->ref;
}

/*
 * Builds an LZJD index over REFS generated texts and checks, for QUERIES
 * generated chunks and several candidate counts, that lzjd_top() returns
 * exactly the references a full sort by lzjd_similarity() puts first.
 * Prints a summary and exits with 0 when every list matches.
 */
int main(void)
{
    static char text[4096];
    static uint32_t one[LZJD_K];
    uint32_t *digests = malloc((size_t)REFS * LZJD_K * sizeof *digests);
    uint32_t *len = malloc(REFS * sizeof *len);
    size_t *first = malloc(REFS * sizeof *first);
    full_rank *full = malloc(REFS * sizeof *full);
    size_t *out = malloc(REFS * sizeof *out);
    lzjd_builder b;
    lzjd_builder_init(&b);

    size_t total = 0;
    for (size_t r = 0; r < REFS; r++) {
        size_t n = make_text(text, (unsigned)(r % 400), (unsigned)r);
        long k = lzjd_digest(&b, (const unsigned char *)text, n, digests + total);
        len[r] = (uint32_t)k;
        first[r] = total;
        total += (size_t)k;
    }
    lzjd_index ix;
    if (lzjd_index_values(&ix, digests, total, len, REFS) != 0)
        return 1;
    uint32_t *slots = malloc((total ? total : 1) * sizeof *slots);
    for (size_t i = 0; i < total; i++)
        slots[i] = lzjd_index_find(&ix, digests[i]);
    if (lzjd_index_fill(&ix, slots, first) != 0)
        return 1;
    lzjd_query q;
    if (lzjd_query_init(&q, REFS) != 0)
        return 1;

    static const size_t counts[] = {1, 16, 256, REFS - 1, REFS};
    size_t checked = 0, wrong = 0;
    for (unsigned t = 0; t < QUERIES; t++) {
        size_t n = make_text(text, t % 450, 100000 + t);
        long k = lzjd_digest(&b, (const unsigned char *)text, n, one);
        for (size_t r = 0; r < REFS; r++)
            full[r] = (full_rank){lzjd_similarity(one, (size_t)k, digests + first[r], len[r]), r};
        qsort(full, REFS, sizeof *full, compare_full);
        for (size_t c = 0; c < sizeof counts / sizeof counts[0]; c++) {
            lzjd_top(&ix, &q, one, (size_t)k, counts[c], out);
            checked++;
            for (size_t i = 0; i < counts[c]; i++) {
                if (out[i] != full[i].ref) {
                    wrong++;
                    break;
                }
            }
        }
    }
    printf("references %d, digest values %zu, distinct %zu\n", REFS, total, ix.value_count);
    printf("candidate lists checked %zu, different from the full sort %zu\n", checked, wrong);

    lzjd_query_free(&q);
    lzjd_index_free(&ix);
    lzjd_builder_free(&b);
    free(slots);
    free(out);
    free(full);
    free(first);
    free(len);
    free(digests);
    return wrong ? 1 : 0;
}
