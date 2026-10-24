#include "prefilter.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define NFILES 7

static unsigned char *slurp(const char *path, size_t *len)
{
    FILE *fp = fopen(path, "rb");
    if (!fp) { perror(path); exit(1); }
    fseek(fp, 0, SEEK_END);
    long n = ftell(fp);
    fseek(fp, 0, SEEK_SET);
    unsigned char *buf = malloc(n ? (size_t)n : 1);
    *len = fread(buf, 1, (size_t)n, fp);
    fclose(fp);
    return buf;
}

int main(int argc, char **argv)
{
    (void)argc;
    const char *dir = argv[1];
    const char *names[NFILES] = {"code_a.js", "code_a_renamed.js", "code_a_minified.js", "code_b.js",
                                 "random_16KiB.bin", "zeros_16KiB.bin", "empty.bin"};
    static uint32_t dig[NFILES][LZJD_K];
    long len[NFILES];
    lzjd_builder b;
    lzjd_builder_init(&b);
    char path[4096];
    for (int i = 0; i < NFILES; i++) {
        snprintf(path, sizeof path, "%s/%s", dir, names[i]);
        size_t n;
        unsigned char *data = slurp(path, &n);
        len[i] = lzjd_digest(&b, data, n, dig[i]);
        free(data);
    }
    uint32_t again[LZJD_K];
    snprintf(path, sizeof path, "%s/%s", dir, names[0]);
    size_t n0;
    unsigned char *d0 = slurp(path, &n0);
    long len_again = lzjd_digest(&b, d0, n0, again);
    free(d0);
    lzjd_builder_free(&b);

    snprintf(path, sizeof path, "%s/lzjd_results.txt", dir);
    FILE *out = fopen(path, "w");
    if (!out) { perror(path); return 1; }
    fprintf(out, "digest sizes (k = %u)\n", LZJD_K);
    for (int i = 0; i < NFILES; i++)
        fprintf(out, "  %-20s %4ld values%s\n", names[i], len[i], len[i] > 0 ? "" : " (empty)");
    fprintf(out, "\nsimilarity matrix\n%20s", "");
    for (int j = 0; j < NFILES; j++)
        fprintf(out, " %7.7s", names[j]);
    fputc('\n', out);
    double sim[NFILES][NFILES];
    for (int i = 0; i < NFILES; i++) {
        fprintf(out, "%-20s", names[i]);
        for (int j = 0; j < NFILES; j++) {
            sim[i][j] = lzjd_similarity(dig[i], (size_t)len[i], dig[j], (size_t)len[j]);
            fprintf(out, " %7.4f", sim[i][j]);
        }
        fputc('\n', out);
    }

    int fails = 0;
    fprintf(out, "\nchecks\n");
#define CHECK(cond, msg) do { int ok_ = (cond); fails += !ok_; fprintf(out, "  %s %s\n", ok_ ? "PASS" : "FAIL", msg); } while (0)
    CHECK(len_again == len[0] && memcmp(again, dig[0], (size_t)len[0] * sizeof *again) == 0,
          "same input gives the same digest when the builder is reused");
    CHECK(sim[0][0] == 1.0, "a digest is identical to itself");
    CHECK(len[6] == 0 && sim[6][6] == 0.0 && sim[0][6] == 0.0, "empty input: empty digest, similarity 0");
    int sym = 1, sorted = 1, range = 1;
    for (int i = 0; i < NFILES; i++) {
        for (int j = 0; j < NFILES; j++) {
            sym &= sim[i][j] == sim[j][i];
            range &= sim[i][j] >= 0.0 && sim[i][j] <= 1.0;
        }
        for (long k = 1; k < len[i]; k++)
            sorted &= dig[i][k - 1] < dig[i][k];
    }
    CHECK(sym, "similarity is symmetric");
    CHECK(range, "similarity is between 0 and 1");
    CHECK(sorted, "digests are strictly ascending (distinct values)");
    CHECK(len[4] == LZJD_K, "16 KiB of random bytes fills the whole digest");
    CHECK(len[5] > 150 && len[5] < 200, "16 KiB of zeros parses into about sqrt(2 * 16384) = 181 phrases");
    CHECK(sim[0][1] > sim[0][3], "renamed copy of code_a is closer than unrelated code_b");
    CHECK(sim[0][4] < 0.05 && sim[0][5] < 0.05, "code is not similar to random or zero bytes");
#undef CHECK
    fprintf(out, "\nfailures: %d\n", fails);
    fclose(out);
    printf("failures: %d\n", fails);
    return fails != 0;
}
