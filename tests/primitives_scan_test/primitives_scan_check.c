#include "primitives.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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
        fprintf(stderr, "usage: primitives_scan_check <dir>\n");
        return 1;
    }
    const char *dir = argv[1];
    static const struct {
        const char *name;
        int is_script;
        int want;
    } cases[] = {
        {"script_exfil.txt", 1, 1},
        {"script_benign.txt", 1, 0},
        {"script_curl.txt", 1, 1},
        {"js_host_net.js", 0, 1},
        {"js_webhook_exec.js", 0, 1},
        {"js_benign.js", 0, 0},
        {"js_env_only.js", 0, 0},
        {"js_eval_buffer.js", 0, 1},
        {"js_obfuscated_only.js", 0, 0},
        {"js_net_env_exec.js", 0, 1},
    };
    int fails = 0;
    char path[4096];
    for (size_t i = 0; i < sizeof cases / sizeof cases[0]; i++) {
        snprintf(path, sizeof path, "%s/%s", dir, cases[i].name);
        size_t len;
        unsigned char *buf = slurp(path, &len);
        primitive_hits hits = primitives_scan(buf, len);
        int got = primitives_flagged(hits, cases[i].is_script);
        printf("%s %s: want %d, got %d (score %u)\n", got == cases[i].want ? "PASS" : "FAIL",
               cases[i].name, cases[i].want, got, primitives_score(hits));
        fails += got != cases[i].want;
        free(buf);
    }
    snprintf(path, sizeof path, "%s/js_host_net.js", dir);
    size_t len;
    unsigned char *buf = slurp(path, &len);
    primitive_hits hits = primitives_scan(buf, len);
    int categories = hits.net && hits.host;
    printf("%s js_host_net categories: net %u host %u\n", categories ? "PASS" : "FAIL",
           hits.net, hits.host);
    fails += !categories;
    char labels[128];
    primitives_hits_string(hits, labels, sizeof labels);
    printf("%s js_host_net labels: %s\n", labels[0] != '\0' ? "PASS" : "FAIL", labels);
    fails += labels[0] == '\0';
    free(buf);
    printf("%s\n", fails ? "SOME FAILED" : "ALL PASS");
    return fails != 0;
}
