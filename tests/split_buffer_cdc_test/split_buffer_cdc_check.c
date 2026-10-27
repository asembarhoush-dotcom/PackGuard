#include "chunker.h"

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int failures;

/*
 * Returns the splitmix64 mix of x, used to fill deterministic test buffers.
 */
static uint64_t mix64(uint64_t x)
{
    x += UINT64_C(0x9e3779b97f4a7c15);
    x = (x ^ (x >> 30)) * UINT64_C(0xbf58476d1ce4e5b9);
    x = (x ^ (x >> 27)) * UINT64_C(0x94d049bb133111eb);
    return x ^ (x >> 31);
}

/*
 * Fills n bytes of buf with a deterministic pseudo-random sequence from seed.
 */
static void fill(unsigned char *buf, size_t n, uint64_t seed)
{
    size_t i = 0;
    while (i < n) {
        uint64_t x = mix64(seed++);
        for (size_t j = 0; j < 8 && i < n; j++, i++)
            buf[i] = (unsigned char)(x >> (8 * j));
    }
}

/*
 * Stores the end offset of every chunk of list in ends and returns how many
 * were written; cap must be at least list->count.
 */
static size_t collect_ends(const chunk_list *list, size_t *ends, size_t cap)
{
    size_t n = list->count < cap ? list->count : cap;
    for (size_t i = 0; i < n; i++)
        ends[i] = list->chunks[i].offset + list->chunks[i].length;
    return n;
}

/*
 * Returns 1 when value occurs among the n entries of values, otherwise 0.
 */
static int contains(const size_t *values, size_t n, size_t value)
{
    for (size_t i = 0; i < n; i++)
        if (values[i] == value)
            return 1;
    return 0;
}

/*
 * Checks that list covers size bytes exactly, with chunks in order, no chunk
 * longer than CDC_MAX_SIZE and every chunk except the last at least
 * CDC_MIN_SIZE. Prints one line per problem and counts failures.
 */
static void check_cover(const char *name, const chunk_list *list, size_t size)
{
    size_t expected = 0;
    if (list->file_size != size) {
        printf("FAIL %s: file_size %zu, want %zu\n", name, list->file_size, size);
        failures++;
    }
    for (size_t i = 0; i < list->count; i++) {
        const file_chunk *c = &list->chunks[i];
        int bad = c->offset != expected || c->length == 0 || c->length > CDC_MAX_SIZE
                  || (i + 1 < list->count && c->length < CDC_MIN_SIZE);
        if (bad) {
            printf("FAIL %s: chunk %zu offset %zu length %zu\n", name, i, c->offset, c->length);
            failures++;
        }
        expected += c->length;
    }
    if (expected != size) {
        printf("FAIL %s: chunks cover %zu bytes, want %zu\n", name, expected, size);
        failures++;
    }
    if (failures == 0)
        printf("PASS %s: %zu chunks cover %zu bytes\n", name, list->count, size);
}

int main(void)
{
    chunk_list list;

    if (split_buffer_cdc(NULL, 0, &list) != 0 || list.count != 0 || list.file_size != 0) {
        printf("FAIL empty: count %zu, size %zu\n", list.count, list.file_size);
        failures++;
    } else {
        printf("PASS empty: no chunks\n");
    }
    free_chunks(&list);

    size_t threshold = SPLIT_THRESHOLD;
    unsigned char *one = malloc(threshold);
    fill(one, threshold, 1);
    if (split_buffer_cdc(one, threshold, &list) != 0 || list.count != 1 || list.chunks[0].length != threshold) {
        printf("FAIL threshold: count %zu\n", list.count);
        failures++;
    } else {
        printf("PASS threshold: one chunk\n");
    }
    free_chunks(&list);

    size_t over = SPLIT_THRESHOLD + 1;
    unsigned char *above = malloc(over);
    fill(above, over, 2);
    if (split_buffer_cdc(above, over, &list) != 0) {
        printf("FAIL threshold+1: split failed\n");
        failures++;
    } else {
        check_cover("threshold+1", &list, over);
    }
    free_chunks(&list);

    size_t big = 256u * 1024u;
    unsigned char *data = malloc(big);
    fill(data, big, 3);
    if (split_buffer_cdc(data, big, &list) != 0) {
        printf("FAIL 256KiB: split failed\n");
        failures++;
    } else {
        check_cover("256KiB", &list, big);
        if (list.count < 2) {
            printf("FAIL 256KiB: only %zu chunk\n", list.count);
            failures++;
        }
    }
    size_t base_count = list.count;
    size_t *base_ends = malloc(base_count * sizeof *base_ends);
    size_t base_n = collect_ends(&list, base_ends, base_count);
    free_chunks(&list);

    unsigned char *copy = malloc(big);
    fill(copy, big, 3);
    if (split_buffer_cdc(copy, big, &list) != 0) {
        printf("FAIL determinism: split failed\n");
        failures++;
    } else {
        int same = list.count == base_n;
        for (size_t i = 0; same && i < list.count; i++)
            same = list.chunks[i].offset == (i ? base_ends[i - 1] : 0)
                   && list.chunks[i].length == base_ends[i] - (i ? base_ends[i - 1] : 0);
        printf("%s determinism: %zu chunks\n", same ? "PASS" : "FAIL", list.count);
        failures += !same;
    }
    free_chunks(&list);

    size_t at = 40u * 1024u;
    size_t insert = 64;
    size_t modified_size = big + insert;
    unsigned char *modified = malloc(modified_size);
    unsigned char *original = malloc(big);
    fill(original, big, 3);
    memcpy(modified, original, at);
    fill(modified + at, insert, 99);
    memcpy(modified + at + insert, original + at, big - at);
    free(original);
    if (split_buffer_cdc(modified, modified_size, &list) != 0) {
        printf("FAIL insertion: split failed\n");
        failures++;
    } else {
        check_cover("insertion", &list, modified_size);
        size_t *mod_ends = malloc(list.count * sizeof *mod_ends);
        size_t mod_n = collect_ends(&list, mod_ends, list.count);
        size_t matched_before = 0;
        size_t matched_after = 0;
        for (size_t i = 0; i < base_n; i++) {
            size_t want = base_ends[i] <= at ? base_ends[i] : base_ends[i] + insert;
            if (contains(mod_ends, mod_n, want)) {
                if (base_ends[i] <= at)
                    matched_before++;
                else
                    matched_after++;
            }
        }
        printf("%s insertion: %zu/%zu boundaries before, %zu/%zu after\n",
               matched_before > 0 && matched_after >= 2 ? "PASS" : "FAIL",
               matched_before, base_n, matched_after, base_n);
        if (matched_before == 0 || matched_after < 2)
            failures++;
        free(mod_ends);
    }
    free_chunks(&list);
    free(base_ends);

    printf("%s\n", failures ? "SOME FAILED" : "ALL PASS");
    return failures != 0;
}
