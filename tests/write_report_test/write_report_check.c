#include "report.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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
    const char *names[] = {"escapes.txt", "utf8_valid.txt", "utf8_cut_end.txt", "utf8_invalid.txt"};
    report_chunk rows[4];
    char path[4096];
    for (int i = 0; i < 4; i++) {
        snprintf(path, sizeof path, "%s/%s", dir, names[i]);
        size_t len;
        unsigned char *buf = slurp(path, &len);
        rows[i] = (report_chunk){.file = names[i], .kind = i == 0 ? "install_script" : "js",
                                 .start = (size_t)i * 4096, .ncd = 0.25 * i,
                                 .threshold = i == 0 ? 0.45 : 0.5, .has_threshold = 1, .flagged = i == 0,
                                 .match_file = "ref\"dir\\x.js", .match_package = i < 3 ? "pkg@1.0.0" : NULL,
                                 .match_start = 8192, .text = buf, .text_len = len, .ignored = i == 3};
    }
    int fails = 0;

    report_match matched[2] = {{"boby_parser@2.2.0", "be8164d46ffb", 0.3187, 7}, {"x\"y", "g", NAN, 1}};
    package_report all = {.package = "@scope/pkg\"q", .version = "1.0.0", .score = 0.0, .has_score = 1,
                          .ignored_small_chunks = 2, .low_confidence = 1,
                          .threshold = 0.5, .has_threshold = 1, .flagged = 1,
                          .seconds = 1.5, .has_seconds = 1,
                          .matched = matched, .matched_count = 2, .chunks = rows, .count = 4};
    snprintf(path, sizeof path, "%s/all_chunks.json", dir);
    fails += write_report_file(path, &all) != 0;

    package_report empty = {.package = "empty-pkg", .version = "", .threshold = 0.3, .has_threshold = 1,
                            .matched = matched, .matched_count = 0};
    snprintf(path, sizeof path, "%s/no_chunks.json", dir);
    fails += write_report_file(path, &empty) != 0;

    report_chunk bad = {.file = "nan.js", .ncd = NAN, .match_file = "r.js"};
    package_report nonfinite = {.package = "nan-pkg", .version = "2.0.0", .score = INFINITY, .has_score = 1,
                                .seconds = NAN, .has_seconds = 1, .chunks = &bad, .count = 1};
    snprintf(path, sizeof path, "%s/non_finite.json", dir);
    fails += write_report_file(path, &nonfinite) != 0;

    package_report unflagged = {.package = "far-pkg", .version = "0.1.0", .score = 0.9, .has_score = 1,
                                .threshold = 0.5, .has_threshold = 1, .chunks = rows + 1, .count = 1};
    snprintf(path, sizeof path, "%s/not_flagged.json", dir);
    fails += write_report_file(path, &unflagged) != 0;

    fails += write_report(NULL, &all) != -1;
    fails += write_report(stdout, NULL) != -1;
    package_report broken = {.package = "x", .version = "y", .count = 3};
    fails += write_report(stdout, &broken) != -1;
    package_report broken_matched = {.package = "x", .version = "y", .matched_count = 1};
    fails += write_report(stdout, &broken_matched) != -1;
    snprintf(path, sizeof path, "%s/no_such_dir/out.json", dir);
    fails += write_report_file(path, &all) != -1;

    for (int i = 0; i < 4; i++)
        free((void *)rows[i].text);
    printf("c-side failures: %d\n", fails);
    return fails != 0;
}
