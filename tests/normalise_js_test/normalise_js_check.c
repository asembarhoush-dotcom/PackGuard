#include "normalise.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int failures;

/*
 * Normalises text with the requested decoding and returns a malloc'd copy.
 */
static unsigned char *norm(const char *text, int decode, size_t *len)
{
    return normalise_js((const unsigned char *)text, strlen(text), decode, len);
}

/*
 * Returns 1 when the first len bytes of data contain text, otherwise 0.
 */
static int has(const unsigned char *data, size_t len, const char *text)
{
    size_t n = strlen(text);
    if (n == 0)
        return 1;
    for (size_t i = 0; i + n <= len; i++)
        if (memcmp(data + i, text, n) == 0)
            return 1;
    return 0;
}

/*
 * Returns 1 when a and b normalise to the same bytes, otherwise 0.
 */
static int same(const char *a, const char *b, int decode)
{
    size_t alen, blen;
    unsigned char *an = norm(a, decode, &alen);
    unsigned char *bn = norm(b, decode, &blen);
    int equal = an != NULL && bn != NULL && alen == blen && memcmp(an, bn, alen) == 0;
    free(an);
    free(bn);
    return equal;
}

/*
 * Prints one PASS or FAIL line and counts a failure.
 */
static void check(const char *name, int ok)
{
    printf("%s %s\n", ok ? "PASS" : "FAIL", name);
    if (!ok)
        failures++;
}

int main(void)
{
    const char *code =
        "function add(first, second) { return first + second; }\n"
        "console.log(add(1, 2));\n";
    const char *renamed =
        "function _0x9f(a, b) { return a + b; }\n"
        "console.log(_0x9f(3, 4));\n";
    const char *minified =
        "/* a comment */ function add(x,y){return x+y} console.log(add(2,3))";
    const char *different =
        "function read(path) { return require('fs').readFileSync(path); }\n";
    const char *with_strings =
        "function add(first, second) { return first + second; }\n"
        "console.log(add('one', 'two'));\n";
    const char *other_strings =
        "function add(first, second) { return first + second; }\n"
        "console.log(add('three', 'four'));\n";
    const char *with_comments =
        "// header\nfunction add(first, second) { /* sum */ return first + second; }\n"
        "console.log(add(1, 2)); // tail\n";

    check("renamed identifiers normalise equally", same(code, renamed, 0));
    check("minified and commented code normalises equally", same(code, minified, 0));
    check("changed string literals normalise equally", same(with_strings, other_strings, 0));
    check("changed comments normalise equally", same(code, with_comments, 0));
    check("different code stays different", !same(code, different, 0));

    size_t len;
    unsigned char *out = norm(code, 0, &len);
    check("normalised output is not empty", out != NULL && len > 0);
    check("keywords are kept", out != NULL && has(out, len, "function"));
    check("numbers become N", out != NULL && has(out, len, "N"));
    check("identifiers become I", out != NULL && has(out, len, "I"));
    check("comments are removed", out != NULL && !has(out, len, "/*"));
    free(out);

    out = norm(with_strings, 0, &len);
    check("strings become S", out != NULL && has(out, len, "S"));
    free(out);

    const char *b64 = "eval(\"Y29uc29sZS5sb2coImhpIik=\")";
    const char *hex = "eval(\"636f6e736f6c652e6c6f67283129\")";
    size_t plain_len, decoded_len;
    unsigned char *plain = norm(b64, 0, &plain_len);
    unsigned char *decoded = norm(b64, 1, &decoded_len);
    check("base64 string is decoded when asked",
          decoded != NULL && decoded_len > plain_len
          && has(decoded, decoded_len, "console"));
    free(plain);
    free(decoded);

    plain = norm(hex, 0, &plain_len);
    decoded = norm(hex, 1, &decoded_len);
    check("hex string is decoded when asked",
          decoded != NULL && decoded_len > plain_len
          && has(decoded, decoded_len, "console"));
    free(plain);
    free(decoded);

    const char *whole = "Y29uc29sZS5sb2coImhpIik=";
    plain = norm(whole, 0, &plain_len);
    decoded = norm(whole, 1, &decoded_len);
    check("whole-file base64 is decoded when asked",
          decoded != NULL && decoded_len > 0
          && has(decoded, decoded_len, "console"));
    free(plain);
    free(decoded);

    out = norm("", 0, &len);
    check("empty input gives an empty buffer", out != NULL && len == 0);
    free(out);

    printf("%s\n", failures ? "SOME FAILED" : "ALL PASS");
    return failures != 0;
}
