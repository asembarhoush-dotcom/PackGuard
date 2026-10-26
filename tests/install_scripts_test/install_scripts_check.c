#include "chunker.h"
#include "manifest.h"

#include <stdio.h>
#include <stdlib.h>

/*
 * Writes the install-script text of the package.json at argv[1] to the
 * file argv[2]. Exits with 0 on success, 1 on failure.
 */
int main(int argc, char **argv)
{
    if (argc != 3) {
        fprintf(stderr, "usage: install_scripts_check <package.json> <out>\n");
        return 1;
    }
    size_t len = 0;
    unsigned char *json = read_file(argv[1], &len);
    if (json == NULL) {
        perror(argv[1]);
        return 1;
    }
    unsigned char *text;
    size_t text_len;
    int rc = install_scripts(json, len, &text, &text_len);
    free(json);
    if (rc != 0) {
        fprintf(stderr, "install_scripts failed\n");
        return 1;
    }
    FILE *fp = fopen(argv[2], "wb");
    if (fp == NULL || fwrite(text, 1, text_len, fp) != text_len || fclose(fp) != 0) {
        perror(argv[2]);
        free(text);
        return 1;
    }
    free(text);
    return 0;
}
