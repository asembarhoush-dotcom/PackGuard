#include "boilerplate.h"

#include <stdio.h>
#include <stdlib.h>

static unsigned char *slurp(const char *path, size_t *len)
{
    FILE *fp = fopen(path, "rb");
    if (fp == NULL) {
        perror(path);
        exit(1);
    }
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
    if (argc != 2) {
        fprintf(stderr, "usage: is_boilerplate_check <dir>\n");
        return 1;
    }
    const char *dir = argv[1];
    static const struct {
        const char *name;
        int want;
    } cases[] = {
        {"reexport_openai.js", 1}, {"reexport_sqs.js", 1}, {"stub_marker.js", 1},
        {"minified_reexport.js", 1}, {"esm_reexport.js", 1}, {"helper_then_code.js", 0},
        {"real_code.js", 0}, {"esm_code.js", 0}, {"string_mention.js", 0},
        {"source_map_only.js", 0}, {"strict_only.js", 0},
    };
    int fails = 0;
    char path[4096];
    for (size_t i = 0; i < sizeof cases / sizeof cases[0]; i++) {
        snprintf(path, sizeof path, "%s/%s", dir, cases[i].name);
        size_t len;
        unsigned char *buf = slurp(path, &len);
        int got = is_boilerplate(buf, len);
        printf("%s %s: want %d, got %d\n", got == cases[i].want ? "PASS" : "FAIL",
               cases[i].name, cases[i].want, got);
        fails += got != cases[i].want;
        free(buf);
    }
    printf("%s\n", fails ? "SOME FAILED" : "ALL PASS");
    return fails != 0;
}
