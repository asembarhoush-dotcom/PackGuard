#include "normalise.h"

#include <errno.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* A growable byte buffer for the normalised token stream. */
typedef struct {
    unsigned char *data;
    size_t len;
    size_t cap;
    int failed;
} out_buffer;

/* Ensures that extra more bytes fit in b, growing it when needed. */
static int reserve(out_buffer *b, size_t extra)
{
    if (b->failed)
        return -1;
    if (extra > SIZE_MAX - b->len) {
        b->failed = 1;
        return -1;
    }
    size_t need = b->len + extra;
    if (need <= b->cap)
        return 0;
    size_t cap = b->cap ? b->cap : 256;
    while (cap < need) {
        if (cap > SIZE_MAX / 2) {
            b->failed = 1;
            return -1;
        }
        cap *= 2;
    }
    unsigned char *bigger = realloc(b->data, cap);
    if (bigger == NULL) {
        b->failed = 1;
        return -1;
    }
    b->data = bigger;
    b->cap = cap;
    return 0;
}

/* Appends one byte to b. */
static void push_byte(out_buffer *b, unsigned char c)
{
    if (reserve(b, 1) != 0)
        return;
    b->data[b->len++] = c;
}

/* Appends n bytes of s to b. */
static void push_text(out_buffer *b, const unsigned char *s, size_t n)
{
    if (reserve(b, n) != 0)
        return;
    memcpy(b->data + b->len, s, n);
    b->len += n;
}

/* Appends one token and a separator space to b. */
static void push_token(out_buffer *b, const unsigned char *s, size_t n)
{
    push_text(b, s, n);
    push_byte(b, ' ');
}

/* Returns 1 for a JavaScript whitespace byte, otherwise 0. */
static int is_space(unsigned char c)
{
    return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v';
}

/* Returns 1 for a byte that can start an identifier, otherwise 0. */
static int is_ident_start(unsigned char c)
{
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || c == '$';
}

/* Returns 1 for a byte that can continue an identifier, otherwise 0. */
static int is_ident_char(unsigned char c)
{
    return is_ident_start(c) || (c >= '0' && c <= '9');
}

/* Returns 1 for a decimal digit, otherwise 0. */
static int is_digit(unsigned char c)
{
    return c >= '0' && c <= '9';
}

/* Returns 1 for a hexadecimal digit, otherwise 0. */
static int is_hex(unsigned char c)
{
    return is_digit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

/*
 * Returns 1 when s holds a JavaScript keyword or a built-in name that the
 * normalised view keeps, otherwise 0.
 */
static int is_keyword(const unsigned char *s, size_t n)
{
    static const char *const words[] = {
        "async", "await", "break", "case", "catch", "class", "const", "continue",
        "debugger", "default", "delete", "do", "else", "export", "extends", "false",
        "finally", "for", "from", "function", "get", "if", "import", "in", "instanceof",
        "let", "new", "null", "of", "return", "set", "static", "super", "switch", "this",
        "throw", "true", "try", "typeof", "undefined", "var", "void", "while", "with",
        "yield", "require", "module", "exports", "process", "console", "Buffer", "global",
        "window", "document",
    };
    for (size_t i = 0; i < sizeof words / sizeof words[0]; i++) {
        size_t len = strlen(words[i]);
        if (len == n && memcmp(words[i], s, n) == 0)
            return 1;
    }
    return 0;
}

/* Returns 1 when at least 85% of n bytes are printable ASCII, otherwise 0. */
static int mostly_printable(const unsigned char *s, size_t n)
{
    if (n == 0)
        return 0;
    size_t printable = 0;
    for (size_t i = 0; i < n; i++)
        if (s[i] == '\t' || s[i] == '\n' || s[i] == '\r' || (s[i] >= 32 && s[i] < 127))
            printable++;
    return printable * 100 >= n * 85;
}

/* Returns the base64 value of c, or -1 when c is not a base64 character. */
static int base64_value(unsigned char c)
{
    if (c >= 'A' && c <= 'Z')
        return c - 'A';
    if (c >= 'a' && c <= 'z')
        return c - 'a' + 26;
    if (c >= '0' && c <= '9')
        return c - '0' + 52;
    if (c == '+')
        return 62;
    if (c == '/')
        return 63;
    return -1;
}

/* Returns 1 when s looks like a base64 payload of at least 64 bytes, otherwise 0. */
static int looks_base64(const unsigned char *s, size_t n)
{
    if (n < 16)
        return 0;
    size_t pad = 0;
    for (size_t i = 0; i < n; i++) {
        if (s[i] == '=') {
            pad++;
            if (pad > 2)
                return 0;
        } else if (pad > 0 || base64_value(s[i]) < 0) {
            return 0;
        }
    }
    return 1;
}

/* Decodes n bytes of base64 text into a malloc'd buffer; returns 0 on success. */
static int decode_base64(const unsigned char *s, size_t n, unsigned char **out, size_t *out_len)
{
    unsigned char *buf = malloc(n / 4 * 3 + 4);
    if (buf == NULL)
        return -1;
    uint32_t acc = 0;
    int bits = 0;
    size_t o = 0;
    for (size_t i = 0; i < n; i++) {
        if (s[i] == '=')
            break;
        int v = base64_value(s[i]);
        if (v < 0) {
            free(buf);
            return -1;
        }
        acc = (acc << 6) | (uint32_t)v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            buf[o++] = (unsigned char)((acc >> bits) & 0xff);
        }
    }
    if (o == 0) {
        free(buf);
        return -1;
    }
    *out = buf;
    *out_len = o;
    return 0;
}

/* Returns 1 when s looks like a hex payload of at least 64 bytes, otherwise 0. */
static int looks_hex(const unsigned char *s, size_t n)
{
    if (n < 16 || n % 2 != 0)
        return 0;
    for (size_t i = 0; i < n; i++)
        if (!is_hex(s[i]))
            return 0;
    return 1;
}

/* Decodes n bytes of hex text into a malloc'd buffer; returns 0 on success. */
static int decode_hex(const unsigned char *s, size_t n, unsigned char **out, size_t *out_len)
{
    unsigned char *buf = malloc(n / 2 + 1);
    if (buf == NULL)
        return -1;
    for (size_t i = 0; i < n; i += 2) {
        int hi = is_digit(s[i]) ? s[i] - '0' : (s[i] | 32) - 'a' + 10;
        int lo = is_digit(s[i + 1]) ? s[i + 1] - '0' : (s[i + 1] | 32) - 'a' + 10;
        buf[i / 2] = (unsigned char)((hi << 4) | lo);
    }
    *out = buf;
    *out_len = n / 2;
    return 0;
}

/*
 * Decodes s as base64 or hex when it looks encoded and the result is mostly
 * printable text. Returns 1 with a malloc'd *out on success, otherwise 0.
 */
static int decode_encoded(const unsigned char *s, size_t n, unsigned char **out, size_t *out_len)
{
    unsigned char *buf = NULL;
    size_t len = 0;
    if (looks_base64(s, n) && decode_base64(s, n, &buf, &len) == 0) {
        if (mostly_printable(buf, len)) {
            *out = buf;
            *out_len = len;
            return 1;
        }
        free(buf);
    }
    if (looks_hex(s, n) && decode_hex(s, n, &buf, &len) == 0) {
        if (mostly_printable(buf, len)) {
            *out = buf;
            *out_len = len;
            return 1;
        }
        free(buf);
    }
    return 0;
}

/*
 * Appends the normalised form of data to out. When decode is nonzero and
 * depth is zero, a whole file that is one base64 or hex payload is replaced
 * by the normalised decoded text. String literals are scanned for embedded
 * encoded payloads, whose decoded text is appended before the S marker.
 */
static void normalise_core(out_buffer *out, const unsigned char *data, size_t len, int decode, int depth)
{
    if (decode && depth == 0) {
        size_t start = 0;
        size_t end = len;
        while (start < end && is_space(data[start]))
            start++;
        while (end > start && is_space(data[end - 1]))
            end--;
        unsigned char *decoded = NULL;
        size_t decoded_len = 0;
        if (decode_encoded(data + start, end - start, &decoded, &decoded_len)) {
            normalise_core(out, decoded, decoded_len, 0, depth + 1);
            free(decoded);
            return;
        }
    }

    size_t i = 0;
    int regex_ok = 1;
    while (i < len && !out->failed) {
        unsigned char c = data[i];
        if (is_space(c)) {
            i++;
            continue;
        }
        if (c == '/' && i + 1 < len && data[i + 1] == '/') {
            i += 2;
            while (i < len && data[i] != '\n')
                i++;
            continue;
        }
        if (c == '/' && i + 1 < len && data[i + 1] == '*') {
            i += 2;
            while (i + 1 < len && !(data[i] == '*' && data[i + 1] == '/'))
                i++;
            i = i + 1 < len ? i + 2 : len;
            continue;
        }
        if (c == '\'' || c == '"' || c == '`') {
            unsigned char quote = c;
            size_t j = i + 1;
            while (j < len) {
                if (data[j] == '\\') {
                    j += 2;
                    continue;
                }
                if (data[j] == quote)
                    break;
                j++;
            }
            size_t content_len = j < len ? j - (i + 1) : len - (i + 1);
            if (decode && content_len >= 16) {
                unsigned char *decoded = NULL;
                size_t decoded_len = 0;
                if (decode_encoded(data + i + 1, content_len, &decoded, &decoded_len)) {
                    normalise_core(out, decoded, decoded_len, 0, depth + 1);
                    push_byte(out, ' ');
                    free(decoded);
                }
            }
            push_token(out, (const unsigned char *)"S", 1);
            i = j < len ? j + 1 : len;
            regex_ok = 0;
            continue;
        }
        if (is_digit(c)) {
            size_t j = i + 1;
            while (j < len) {
                unsigned char d = data[j];
                if (is_ident_char(d) || d == '.' || d == '_') {
                    j++;
                    continue;
                }
                if ((d == '+' || d == '-') && j > i && (data[j - 1] == 'e' || data[j - 1] == 'E')) {
                    j++;
                    continue;
                }
                break;
            }
            push_token(out, (const unsigned char *)"N", 1);
            i = j;
            regex_ok = 0;
            continue;
        }
        if (is_ident_start(c)) {
            size_t j = i + 1;
            while (j < len && is_ident_char(data[j]))
                j++;
            if (is_keyword(data + i, j - i))
                push_token(out, data + i, j - i);
            else
                push_token(out, (const unsigned char *)"I", 1);
            i = j;
            regex_ok = 0;
            continue;
        }
        if (c == '/' && regex_ok) {
            size_t j = i + 1;
            int in_class = 0;
            while (j < len) {
                if (data[j] == '\\') {
                    j += 2;
                    continue;
                }
                if (data[j] == '[')
                    in_class = 1;
                else if (data[j] == ']')
                    in_class = 0;
                else if (data[j] == '/' && !in_class)
                    break;
                j++;
            }
            if (j < len) {
                push_token(out, (const unsigned char *)"R", 1);
                i = j + 1;
                regex_ok = 0;
                continue;
            }
        }
        if (c == ';') {
            i++;
            regex_ok = 1;
            continue;
        }
        if (c >= 32 && c < 127)
            push_byte(out, c);
        if (c == ')' || c == ']' || c == '}' || c == '.') {
            regex_ok = 0;
        } else if (c == '(' || c == '=' || c == ':' || c == ',' || c == '[' || c == '!'
                   || c == '&' || c == '|' || c == '?' || c == '{' || c == ';' || c == '+'
                   || c == '-' || c == '*' || c == '%' || c == '<' || c == '>' || c == '~'
                   || c == '^') {
            regex_ok = 1;
        }
        i++;
    }
}

unsigned char *normalise_js(const unsigned char *data, size_t len, int decode, size_t *out_len)
{
    if ((data == NULL && len > 0) || out_len == NULL) {
        errno = EINVAL;
        return NULL;
    }
    out_buffer out = {0};
    normalise_core(&out, data, len, decode, 0);
    if (out.failed) {
        free(out.data);
        errno = ENOMEM;
        return NULL;
    }
    if (out.data == NULL) {
        out.data = malloc(1);
        if (out.data == NULL) {
            errno = ENOMEM;
            return NULL;
        }
    }
    *out_len = out.len;
    return out.data;
}
