#include "compresser.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define DEFAULT_TEST_DIR  "tests/compressed_size_test"
#define BENCH_MIN_SECONDS 0.3
#define BENCH_MIN_CALLS   5
#define TIMING_LEN        8192
#define TINY_LEN          1024

enum { IN_EMPTY, IN_ZEROS, IN_RANDOM, IN_A, IN_A_RENAMED, IN_A_MINIFIED, IN_B, IN_PADDED, IN_COUNT };

static const char *const input_names[IN_COUNT] = {
    "empty.bin", "zeros_16KiB.bin", "random_16KiB.bin", "code_a.js",
    "code_a_renamed.js", "code_a_minified.js", "code_b.js", "code_a_padded_128KiB.bin",
};

static int failures = 0;
#define CHECK(cond, ...) do { if (!(cond)) { failures++; printf("    FAIL: " __VA_ARGS__); printf("\n"); } } while (0)

/* A test input file held in memory. */
typedef struct {
    unsigned char *data;
    size_t len;
} test_input;

/* One compressor setting compared in the tuning experiments. */
typedef struct {
    const char *label;
    uint32_t preset;
    uint32_t dict_size;
    uint32_t lc;
} tuning_config;

/* One timed C(ab) call: compressed_size_pair() or compressed_size_given(), shared or new compressor. */
typedef struct {
    compressor *shared;
    const tuning_config *cfg;
    const unsigned char *a;
    size_t alen;
    const unsigned char *b;
    size_t blen;
    int given;
} bench_job;

/* One reference/chunk pair compared in the pair-versus-given section. */
typedef struct {
    const char *label;
    test_input x;
    test_input y;
} method_case;

static const tuning_config configs[] = {
    { "v1: 6, 1 MiB, lc3", COMPRESS_PRESET, COMPRESS_DICT_SIZE, COMPRESS_LC },
    { "6e, 1 MiB, lc3", 6u | LZMA_PRESET_EXTREME, 1u << 20, 3 },
    { "1, 1 MiB, lc3", 1u, 1u << 20, 3 },
    { "6, 256 KiB, lc3", 6u, 256u << 10, 3 },
    { "6, 64 KiB, lc3", 6u, 64u << 10, 3 },
    { "6, 1 MiB, lc0", 6u, 1u << 20, 0 },
    { "6, 1 MiB, lc4", 6u, 1u << 20, 4 },
};

/* Reads dir/name into memory. Returns 0 on success, -1 on failure. */
static int load_input(const char *dir, const char *name, test_input *in)
{
    char path[1024];
    snprintf(path, sizeof path, "%s/%s", dir, name);
    FILE *fp = fopen(path, "rb");
    if (fp == NULL)
        return -1;
    fseek(fp, 0, SEEK_END);
    long sz = ftell(fp);
    rewind(fp);
    in->len = sz > 0 ? (size_t)sz : 0;
    in->data = malloc(in->len + 1);
    size_t got = in->data != NULL ? fread(in->data, 1, in->len, fp) : 0;
    fclose(fp);
    return in->data != NULL && got == in->len ? 0 : -1;
}

/* Returns a new input holding a followed by b; its data is NULL when memory runs out. */
static test_input join(const test_input *a, const test_input *b)
{
    test_input out = { malloc(a->len + b->len + 1), a->len + b->len };
    if (out.data != NULL) {
        memcpy(out.data, a->data, a->len);
        memcpy(out.data + a->len, b->data, b->len);
    }
    return out;
}

/* Returns the current time in seconds. */
static double seconds_now(void)
{
    struct timespec ts;
    timespec_get(&ts, TIME_UTC);
    return (double)ts.tv_sec + (double)ts.tv_nsec / 1e9;
}

/*
 * Compresses in with liblzma's one-call buffer API, using the same filter
 * chain as c, then decompresses it again. Stores the compressed size in
 * *size and whether decompression gave back the exact input in *round_trip.
 * Returns 0 on success, -1 on failure.
 */
static int reference_check(const compressor *c, const test_input *in, size_t *size, int *round_trip)
{
    size_t cap = in->len + in->len / 2 + 4096;
    unsigned char *enc = malloc(cap);
    unsigned char *dec = malloc(in->len + 1);
    size_t enc_pos = 0, in_pos = 0, dec_pos = 0;
    int rc = -1;

    if (enc != NULL && dec != NULL
        && lzma_raw_buffer_encode(c->filters, NULL, in->data, in->len, enc, &enc_pos, cap) == LZMA_OK) {
        *size = enc_pos;
        *round_trip = lzma_raw_buffer_decode(c->filters, NULL, enc, &in_pos, enc_pos,
                                             dec, &dec_pos, in->len + 1) == LZMA_OK
                      && dec_pos == in->len && memcmp(dec, in->data, in->len) == 0;
        rc = 0;
    }
    free(enc);
    free(dec);
    return rc;
}

/*
 * Same as reference_check() but with dict loaded as the preset dictionary,
 * so it checks compressed_size_given() and that the output decompresses with
 * that dictionary. dict must fit in c's dictionary size.
 * Returns 0 on success, -1 on failure.
 */
static int reference_check_given(compressor *c, const test_input *dict, const test_input *in,
                                 size_t *size, int *round_trip)
{
    c->options.preset_dict = dict->len > 0 ? dict->data : NULL;
    c->options.preset_dict_size = (uint32_t)dict->len;
    int rc = reference_check(c, in, size, round_trip);
    c->options.preset_dict = NULL;
    c->options.preset_dict_size = 0;
    return rc;
}

/*
 * Computes NCD(x, y) with C(xy) replaced by C(x) + C(y|x), where C(y|x)
 * comes from compressed_size_given() with x as the preset dictionary.
 * Returns 0 on success, -1 on failure.
 */
static int ncd_given_of(compressor *c, const test_input *x, const test_input *y, double *out)
{
    size_t cx, cy, cyx;
    if (compressed_size(c, x->data, x->len, &cx) != 0
        || compressed_size(c, y->data, y->len, &cy) != 0
        || compressed_size_given(c, x->data, x->len, y->data, y->len, &cyx) != 0)
        return -1;
    size_t lo = cx < cy ? cx : cy;
    size_t hi = cx < cy ? cy : cx;
    *out = hi == 0 ? 0.0 : ((double)(cx + cyx) - (double)lo) / (double)hi;
    return 0;
}

/*
 * Computes NCD(x, y) = (C(xy) - min(C(x), C(y))) / max(C(x), C(y)) with c,
 * where C(xy) compresses x first and then y. Returns 0 on success, -1 on failure.
 */
static int ncd_of(compressor *c, const test_input *x, const test_input *y, double *out)
{
    size_t cx, cy, cxy;
    if (compressed_size(c, x->data, x->len, &cx) != 0
        || compressed_size(c, y->data, y->len, &cy) != 0
        || compressed_size_pair(c, x->data, x->len, y->data, y->len, &cxy) != 0)
        return -1;
    size_t lo = cx < cy ? cx : cy;
    size_t hi = cx < cy ? cy : cx;
    *out = hi == 0 ? 0.0 : ((double)cxy - (double)lo) / (double)hi;
    return 0;
}

/*
 * Runs job once: compressed_size_given() when job->given is set, otherwise
 * compressed_size_pair(), setting up and freeing a new compressor when
 * job->shared is NULL. Returns 0 on success.
 */
static int run_job(const bench_job *job)
{
    size_t size;
    if (job->shared != NULL && job->given)
        return compressed_size_given(job->shared, job->a, job->alen, job->b, job->blen, &size);
    if (job->shared != NULL)
        return compressed_size_pair(job->shared, job->a, job->alen, job->b, job->blen, &size);

    compressor fresh;
    if (compressor_init(&fresh, job->cfg->preset, job->cfg->dict_size, job->cfg->lc) != 0)
        return -1;
    int rc = compressed_size_pair(&fresh, job->a, job->alen, job->b, job->blen, &size);
    compressor_free(&fresh);
    return rc;
}

/* Repeats job for at least BENCH_MIN_SECONDS and returns microseconds per call, or -1 on failure. */
static double bench(const bench_job *job)
{
    size_t calls = 0;
    double start = seconds_now();
    double elapsed = 0.0;
    while (calls < BENCH_MIN_CALLS || elapsed < BENCH_MIN_SECONDS) {
        if (run_job(job) != 0)
            return -1.0;
        calls++;
        elapsed = seconds_now() - start;
    }
    return elapsed * 1e6 / (double)calls;
}

/*
 * Test program for the compresser module. Run it from the repo root, or pass
 * the test folder as argv[1]. It reads every input in tests/compressed_size_test/
 * (code_a.js and code_b.js are hand-written originals; the renamed, minified
 * and padded files are generated from code_a.js; empty, zeros and random are
 * edge cases) and runs four parts:
 * 1. Correctness: compressed_size() must match liblzma's one-call buffer API
 *    with the same settings, repeat exactly, and decompress back to the input;
 *    compressed_size_pair() must match compressing the joined buffer;
 *    compressed_size_given() must match the buffer API with the same preset
 *    dictionary, decompress with it, and use only the last dict_size bytes of
 *    an oversize dictionary; invalid settings and NULL arguments must fail
 *    without breaking the compressor.
 * 2. NCD at the README v1 settings for related and unrelated inputs, both
 *    orders, plus NCD with C(xy) replaced by C(x) + C(y|x).
 * 3. Tuning: NCD and speed for other presets, dictionary sizes and lc values.
 * 4. Tuning: a reused compressor versus a new one set up for every call.
 * 5. Tuning: C(xy) by compressing both versus cached C(x) + C(y|x).
 * Returns 0 when every check passes, 1 otherwise.
 */
int main(int argc, char **argv)
{
    const char *dir = argc > 1 ? argv[1] : DEFAULT_TEST_DIR;
    test_input in[IN_COUNT] = { { NULL, 0 } };
    for (int i = 0; i < IN_COUNT; i++) {
        if (load_input(dir, input_names[i], &in[i]) != 0) {
            printf("cannot read %s/%s\n", dir, input_names[i]);
            return 1;
        }
    }

    printf("liblzma %s (static)\n", lzma_version_string());

    compressor c;
    if (compressor_init(&c, COMPRESS_PRESET, COMPRESS_DICT_SIZE, COMPRESS_LC) != 0) {
        printf("FAIL: compressor_init with the v1 settings\n");
        return 1;
    }

    printf("\n== 1. Correctness (v1: preset 6, 1 MiB dictionary, lc 3) ==\n");
    printf("    %-26s %7s %7s %6s  %-10s %-10s %s\n",
           "file", "size", "C(x)", "ratio", "buffer API", "repeatable", "round trip");
    for (int i = 0; i < IN_COUNT; i++) {
        size_t got = 0, again = 0, ref = 0;
        int round_trip = 0;
        CHECK(compressed_size(&c, in[i].data, in[i].len, &got) == 0, "%s: compressed_size failed", input_names[i]);
        CHECK(compressed_size(&c, in[i].data, in[i].len, &again) == 0, "%s: second call failed", input_names[i]);
        CHECK(reference_check(&c, &in[i], &ref, &round_trip) == 0, "%s: buffer API failed", input_names[i]);
        CHECK(got == ref, "%s: %zu != buffer API %zu", input_names[i], got, ref);
        CHECK(got == again, "%s: %zu then %zu", input_names[i], got, again);
        CHECK(round_trip, "%s: round trip mismatch", input_names[i]);
        printf("    %-26s %7zu %7zu %6.3f  %-10s %-10s %s\n", input_names[i], in[i].len, got,
               in[i].len ? (double)got / (double)in[i].len : 0.0,
               got == ref ? "same" : "DIFFERENT", got == again ? "yes" : "NO", round_trip ? "ok" : "BROKEN");
    }

    static const int pairs[][2] = {
        { IN_EMPTY, IN_A }, { IN_A, IN_EMPTY }, { IN_A, IN_B }, { IN_B, IN_A },
        { IN_RANDOM, IN_ZEROS }, { IN_PADDED, IN_A_RENAMED },
    };
    printf("\n    %-26s   %-20s %9s %9s\n", "a", "b", "pair(a,b)", "joined");
    for (size_t p = 0; p < sizeof pairs / sizeof pairs[0]; p++) {
        const test_input *a = &in[pairs[p][0]], *b = &in[pairs[p][1]];
        test_input joined = join(a, b);
        size_t pair_size = 0, joined_size = 0;
        CHECK(joined.data != NULL, "out of memory");
        CHECK(compressed_size_pair(&c, a->data, a->len, b->data, b->len, &pair_size) == 0, "pair failed");
        CHECK(compressed_size(&c, joined.data, joined.len, &joined_size) == 0, "joined failed");
        CHECK(pair_size == joined_size, "pair %zu != joined %zu", pair_size, joined_size);
        printf("    %-26s + %-20s %9zu %9zu\n", input_names[pairs[p][0]], input_names[pairs[p][1]],
               pair_size, joined_size);
        free(joined.data);
    }

    static const int given_pairs[][2] = {
        { IN_EMPTY, IN_A }, { IN_A, IN_A_RENAMED }, { IN_A, IN_A_MINIFIED }, { IN_A, IN_B }, { IN_B, IN_RANDOM },
    };
    printf("\n    %-26s   %-20s %9s %10s %s\n", "dict", "data", "given", "buffer API", "round trip");
    for (size_t p = 0; p < sizeof given_pairs / sizeof given_pairs[0]; p++) {
        const test_input *d = &in[given_pairs[p][0]], *x = &in[given_pairs[p][1]];
        size_t given = 0, ref = 0, plain = 0;
        int round_trip = 0;
        CHECK(compressed_size_given(&c, d->data, d->len, x->data, x->len, &given) == 0, "given failed");
        CHECK(reference_check_given(&c, d, x, &ref, &round_trip) == 0, "buffer API with preset dict failed");
        CHECK(given == ref, "given %zu != buffer API %zu", given, ref);
        CHECK(round_trip, "round trip with preset dict mismatch");
        if (d->len == 0) {
            CHECK(compressed_size(&c, x->data, x->len, &plain) == 0 && plain == given,
                  "empty dict should equal compressed_size (%zu vs %zu)", given, plain);
        }
        printf("    %-26s + %-20s %9zu %10s %s\n", input_names[given_pairs[p][0]], input_names[given_pairs[p][1]],
               given, given == ref ? "same" : "DIFFERENT", round_trip ? "ok" : "BROKEN");
    }

    compressor small;
    size_t tail_full = 0, tail_cut = 0;
    CHECK(compressor_init(&small, COMPRESS_PRESET, 64u << 10, COMPRESS_LC) == 0, "64 KiB compressor");
    const test_input *pad = &in[IN_PADDED];
    CHECK(compressed_size_given(&small, pad->data, pad->len, in[IN_A_RENAMED].data, in[IN_A_RENAMED].len,
                                &tail_full) == 0, "given with oversize dict");
    CHECK(compressed_size_given(&small, pad->data + pad->len - (64u << 10), 64u << 10, in[IN_A_RENAMED].data,
                                in[IN_A_RENAMED].len, &tail_cut) == 0, "given with last 64 KiB");
    CHECK(tail_full == tail_cut, "oversize dict should use only its last 64 KiB (%zu vs %zu)", tail_full, tail_cut);
    compressor_free(&small);
    printf("    oversize dict: 133 KiB dict on a 64 KiB compressor gives %zu, same as its last 64 KiB: %s\n",
           tail_full, tail_full == tail_cut ? "yes" : "NO");

    compressor bad;
    size_t dummy = 0, before = 0, after = 0;
    compressed_size(&c, in[IN_A].data, in[IN_A].len, &before);
    CHECK(compressor_init(&bad, COMPRESS_PRESET, COMPRESS_DICT_SIZE, 5) == -1, "lc = 5 should be rejected");
    CHECK(compressor_init(&bad, COMPRESS_PRESET, 1024, COMPRESS_LC) == -1, "1 KiB dictionary should be rejected");
    CHECK(compressor_init(&bad, 99, COMPRESS_DICT_SIZE, COMPRESS_LC) == -1, "preset 99 should be rejected");
    CHECK(compressor_init(NULL, COMPRESS_PRESET, COMPRESS_DICT_SIZE, COMPRESS_LC) == -1, "NULL compressor");
    CHECK(compressed_size(NULL, in[IN_A].data, in[IN_A].len, &dummy) == -1, "NULL compressor in compressed_size");
    CHECK(compressed_size(&c, NULL, 10, &dummy) == -1, "NULL data with length 10");
    CHECK(compressed_size(&c, in[IN_A].data, in[IN_A].len, NULL) == -1, "NULL out");
    CHECK(compressed_size_pair(&c, in[IN_A].data, in[IN_A].len, NULL, 10, &dummy) == -1, "NULL b with length 10");
    CHECK(compressed_size_given(&c, NULL, 10, in[IN_A].data, in[IN_A].len, &dummy) == -1, "NULL dict with length 10");
    CHECK(compressed_size_given(NULL, in[IN_B].data, in[IN_B].len, in[IN_A].data, in[IN_A].len, &dummy) == -1,
          "NULL compressor in compressed_size_given");
    CHECK(compressed_size(&c, in[IN_A].data, in[IN_A].len, &after) == 0 && after == before,
          "compressor changed after rejected calls (%zu -> %zu)", before, after);
    printf("\n    error paths: invalid lc/dictionary/preset and NULL arguments rejected; compressor still gives %zu after them\n",
           after);

    static const int ncd_pairs[][2] = {
        { IN_A, IN_A }, { IN_A, IN_A_RENAMED }, { IN_A, IN_A_MINIFIED }, { IN_A, IN_B },
        { IN_A, IN_RANDOM }, { IN_ZEROS, IN_RANDOM }, { IN_PADDED, IN_A_RENAMED },
    };
    printf("\n== 2. NCD at v1 settings (lower = more similar) ==\n");
    printf("    %-26s %-20s %6s %6s %7s %7s %7s %8s\n",
           "x", "y", "C(x)", "C(y)", "C(xy)", "NCD x,y", "NCD y,x", "NCD dict");
    for (size_t p = 0; p < sizeof ncd_pairs / sizeof ncd_pairs[0]; p++) {
        const test_input *x = &in[ncd_pairs[p][0]], *y = &in[ncd_pairs[p][1]];
        size_t cx = 0, cy = 0, cxy = 0;
        double nxy = 0.0, nyx = 0.0, ngiven = 0.0;
        CHECK(compressed_size(&c, x->data, x->len, &cx) == 0, "C(x)");
        CHECK(compressed_size(&c, y->data, y->len, &cy) == 0, "C(y)");
        CHECK(compressed_size_pair(&c, x->data, x->len, y->data, y->len, &cxy) == 0, "C(xy)");
        CHECK(ncd_of(&c, x, y, &nxy) == 0 && ncd_of(&c, y, x, &nyx) == 0, "ncd");
        CHECK(ncd_given_of(&c, x, y, &ngiven) == 0, "ncd given");
        printf("    %-26s %-20s %6zu %6zu %7zu %7.3f %7.3f %8.3f\n", input_names[ncd_pairs[p][0]],
               input_names[ncd_pairs[p][1]], cx, cy, cxy, nxy, nyx, ngiven);
    }

    test_input ab = join(&in[IN_A], &in[IN_B]);
    test_input br = join(&in[IN_B], &in[IN_A_RENAMED]);
    CHECK(ab.data != NULL && br.data != NULL && ab.len >= TIMING_LEN && br.len >= TIMING_LEN, "timing inputs");

    size_t c_renamed = 0;
    CHECK(compressed_size(&c, in[IN_A_RENAMED].data, in[IN_A_RENAMED].len, &c_renamed) == 0, "C(renamed)");
    printf("\n== 3. Tuning: settings compared ==\n");
    printf("    NCD of code_a.js vs renamed / minified / code_b; separation = code_b - worst related;\n");
    printf("    padded: NCD and extra bytes C(xy) - C(x) for x = 128 KiB-padded code_a, y = renamed (C(y) alone = %zu);\n",
           c_renamed);
    printf("    time = one C(xy) of two %u-byte or two %u-byte code chunks\n", TINY_LEN, TIMING_LEN);
    printf("    %-18s %7s %8s %7s %6s %7s %6s %8s %8s\n",
           "settings", "renamed", "minified", "code_b", "separ.", "padded", "extra", "us 1K", "us 8K");
    for (size_t k = 0; k < sizeof configs / sizeof configs[0]; k++) {
        compressor t;
        double renamed = 0.0, minified = 0.0, other = 0.0, padded = 0.0;
        size_t cx = 0, cxy = 0;
        if (compressor_init(&t, configs[k].preset, configs[k].dict_size, configs[k].lc) != 0) {
            CHECK(0, "%s: compressor_init failed", configs[k].label);
            continue;
        }
        CHECK(ncd_of(&t, &in[IN_A], &in[IN_A_RENAMED], &renamed) == 0, "ncd renamed");
        CHECK(ncd_of(&t, &in[IN_A], &in[IN_A_MINIFIED], &minified) == 0, "ncd minified");
        CHECK(ncd_of(&t, &in[IN_A], &in[IN_B], &other) == 0, "ncd other");
        CHECK(ncd_of(&t, &in[IN_PADDED], &in[IN_A_RENAMED], &padded) == 0, "ncd padded");
        CHECK(compressed_size(&t, in[IN_PADDED].data, in[IN_PADDED].len, &cx) == 0
              && compressed_size_pair(&t, in[IN_PADDED].data, in[IN_PADDED].len,
                                      in[IN_A_RENAMED].data, in[IN_A_RENAMED].len, &cxy) == 0, "padded sizes");
        bench_job tiny = { &t, &configs[k], ab.data, TINY_LEN, br.data, TINY_LEN, 0 };
        bench_job full = { &t, &configs[k], ab.data, TIMING_LEN, br.data, TIMING_LEN, 0 };
        double us_tiny = bench(&tiny), us_full = bench(&full);
        CHECK(us_tiny >= 0.0 && us_full >= 0.0, "%s: bench failed", configs[k].label);
        double worst_related = renamed > minified ? renamed : minified;
        printf("    %-18s %7.3f %8.3f %7.3f %6.3f %7.3f %6zu %8.0f %8.0f\n", configs[k].label,
               renamed, minified, other, other - worst_related, padded, cxy - cx, us_tiny, us_full);
        compressor_free(&t);
    }

    printf("\n== 4. Tuning: reused compressor vs new compressor per call (v1 settings) ==\n");
    printf("    %-24s %12s %12s %8s\n", "input", "reused us", "new us", "speedup");
    static const size_t lens[] = { TINY_LEN, TIMING_LEN };
    for (size_t k = 0; k < sizeof lens / sizeof lens[0]; k++) {
        bench_job reused = { &c, &configs[0], ab.data, lens[k], br.data, lens[k], 0 };
        bench_job fresh = { NULL, &configs[0], ab.data, lens[k], br.data, lens[k], 0 };
        double r = bench(&reused), f = bench(&fresh);
        CHECK(r > 0.0 && f > 0.0, "bench failed");
        char label[64];
        snprintf(label, sizeof label, "C(xy), %zu + %zu bytes", lens[k], lens[k]);
        printf("    %-24s %12.0f %12.0f %7.1fx\n", label, r, f, f / r);
    }

    const method_case cases[] = {
        { "ref code_a, chunk renamed", in[IN_A], in[IN_A_RENAMED] },
        { "ref code_a, chunk minified", in[IN_A], in[IN_A_MINIFIED] },
        { "ref code_a, chunk code_b", in[IN_A], in[IN_B] },
        { "ref 1 KiB, chunk 1 KiB", { ab.data, TINY_LEN }, { br.data, TINY_LEN } },
        { "ref 8 KiB, chunk 8 KiB", { ab.data, TIMING_LEN }, { br.data, TIMING_LEN } },
        { "ref padded 133 KiB, chunk renamed", in[IN_PADDED], in[IN_A_RENAMED] },
    };
    printf("\n== 5. Tuning: C(xy) by compressing both (pair) vs C(x) cached + C(y|x) (given), v1 settings ==\n");
    printf("    %-34s %10s %7s %6s %9s %9s %7s\n", "case", "C(xy)-C(x)", "C(y|x)", "diff", "pair us", "given us",
           "speedup");
    for (size_t k = 0; k < sizeof cases / sizeof cases[0]; k++) {
        const method_case *m = &cases[k];
        size_t cx = 0, cxy = 0, cyx = 0;
        CHECK(compressed_size(&c, m->x.data, m->x.len, &cx) == 0
              && compressed_size_pair(&c, m->x.data, m->x.len, m->y.data, m->y.len, &cxy) == 0
              && compressed_size_given(&c, m->x.data, m->x.len, m->y.data, m->y.len, &cyx) == 0, "%s", m->label);
        bench_job pair = { &c, &configs[0], m->x.data, m->x.len, m->y.data, m->y.len, 0 };
        bench_job given = { &c, &configs[0], m->x.data, m->x.len, m->y.data, m->y.len, 1 };
        double us_pair = bench(&pair), us_given = bench(&given);
        CHECK(us_pair > 0.0 && us_given > 0.0, "%s: bench failed", m->label);
        printf("    %-34s %10zu %7zu %+6ld %9.0f %9.0f %6.1fx\n", m->label, cxy - cx, cyx,
               (long)cyx - (long)(cxy - cx), us_pair, us_given, us_pair / us_given);
    }

    free(ab.data);
    free(br.data);
    compressor_free(&c);
    for (int i = 0; i < IN_COUNT; i++)
        free(in[i].data);

    printf("\n%s: %d failure(s)\n", failures ? "FAILED" : "ALL CHECKS PASSED", failures);
    return failures ? 1 : 0;
}
