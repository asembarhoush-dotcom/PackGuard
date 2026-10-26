#include "manifest.h"

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define MAX_DEPTH  512
#define HOOK_COUNT 3

static const char *const hooks[HOOK_COUNT] = {"preinstall", "install", "postinstall"};

/* A growable byte buffer. */
typedef struct {
    unsigned char *data;
    size_t len;
    size_t cap;
} byte_buf;

/* Read position in the JSON text, and whether memory ran out. */
typedef struct {
    const unsigned char *p;
    const unsigned char *end;
    int oom;
} cursor;

/* Appends len bytes to b. Returns 0 on success, -1 if memory runs out. */
static int append(byte_buf *b, const void *data, size_t len)
{
    if (len > b->cap - b->len) {
        size_t cap = b->cap ? b->cap : 64;
        while (cap - b->len < len) {
            if (cap > SIZE_MAX / 2)
                return -1;
            cap *= 2;
        }
        unsigned char *bigger = realloc(b->data, cap);
        if (bigger == NULL)
            return -1;
        b->data = bigger;
        b->cap = cap;
    }
    memcpy(b->data + b->len, data, len);
    b->len += len;
    return 0;
}

/* Appends code point cp as UTF-8, surrogates included. Returns 0 or -1 on no memory. */
static int append_utf8(byte_buf *b, uint32_t cp)
{
    unsigned char u[4];
    size_t n;
    if (cp < 0x80) {
        u[0] = (unsigned char)cp;
        n = 1;
    } else if (cp < 0x800) {
        u[0] = (unsigned char)(0xC0 | (cp >> 6));
        u[1] = (unsigned char)(0x80 | (cp & 0x3F));
        n = 2;
    } else if (cp < 0x10000) {
        u[0] = (unsigned char)(0xE0 | (cp >> 12));
        u[1] = (unsigned char)(0x80 | ((cp >> 6) & 0x3F));
        u[2] = (unsigned char)(0x80 | (cp & 0x3F));
        n = 3;
    } else {
        u[0] = (unsigned char)(0xF0 | (cp >> 18));
        u[1] = (unsigned char)(0x80 | ((cp >> 12) & 0x3F));
        u[2] = (unsigned char)(0x80 | ((cp >> 6) & 0x3F));
        u[3] = (unsigned char)(0x80 | (cp & 0x3F));
        n = 4;
    }
    return append(b, u, n);
}

/* Moves c past JSON whitespace. */
static void skip_ws(cursor *c)
{
    while (c->p < c->end && (*c->p == ' ' || *c->p == '\t' || *c->p == '\n' || *c->p == '\r'))
        c->p++;
}

/*
 * Reads the 4 hex digits of a \u escape at c into *out.
 * Returns 0 on success, -1 if they are not 4 hex digits.
 */
static int read_hex4(cursor *c, uint32_t *out)
{
    if (c->end - c->p < 4)
        return -1;
    uint32_t v = 0;
    for (int i = 0; i < 4; i++) {
        unsigned char h = c->p[i];
        uint32_t d;
        if (h >= '0' && h <= '9')
            d = h - '0';
        else if (h >= 'a' && h <= 'f')
            d = h - 'a' + 10;
        else if (h >= 'A' && h <= 'F')
            d = h - 'A' + 10;
        else
            return -1;
        v = v * 16 + d;
    }
    c->p += 4;
    *out = v;
    return 0;
}

/*
 * Parses the JSON string at c and, when out is not NULL, appends its
 * decoded bytes to out. A high surrogate escape followed by a low one is
 * joined into one code point. Returns 0 on success, -1 if the string is
 * not valid JSON or memory runs out (then c->oom is set).
 */
static int parse_string(cursor *c, byte_buf *out)
{
    if (c->p >= c->end || *c->p != '"')
        return -1;
    c->p++;
    for (;;) {
        const unsigned char *run = c->p;
        while (c->p < c->end && *c->p != '"' && *c->p != '\\' && *c->p >= 0x20)
            c->p++;
        if (out != NULL && c->p > run && append(out, run, (size_t)(c->p - run)) != 0) {
            c->oom = 1;
            return -1;
        }
        if (c->p >= c->end || *c->p < 0x20)
            return -1;
        if (*c->p == '"') {
            c->p++;
            return 0;
        }
        c->p++;
        if (c->p >= c->end)
            return -1;
        unsigned char e = *c->p++;
        uint32_t cp;
        switch (e) {
        case '"': cp = '"'; break;
        case '\\': cp = '\\'; break;
        case '/': cp = '/'; break;
        case 'b': cp = '\b'; break;
        case 'f': cp = '\f'; break;
        case 'n': cp = '\n'; break;
        case 'r': cp = '\r'; break;
        case 't': cp = '\t'; break;
        case 'u':
            if (read_hex4(c, &cp) != 0)
                return -1;
            if (cp >= 0xD800 && cp < 0xDC00 && c->end - c->p >= 6 && c->p[0] == '\\' && c->p[1] == 'u') {
                cursor look = {c->p + 2, c->end, 0};
                uint32_t low;
                if (read_hex4(&look, &low) == 0 && low >= 0xDC00 && low < 0xE000) {
                    cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
                    c->p = look.p;
                }
            }
            break;
        default:
            return -1;
        }
        if (out != NULL && append_utf8(out, cp) != 0) {
            c->oom = 1;
            return -1;
        }
    }
}

/* Parses a JSON number at c. Returns 0 on success, -1 if it is not one. */
static int parse_number(cursor *c)
{
    if (c->p < c->end && *c->p == '-')
        c->p++;
    if (c->p >= c->end)
        return -1;
    if (*c->p == '0') {
        c->p++;
    } else if (*c->p >= '1' && *c->p <= '9') {
        while (c->p < c->end && *c->p >= '0' && *c->p <= '9')
            c->p++;
    } else {
        return -1;
    }
    if (c->p < c->end && *c->p == '.') {
        c->p++;
        if (c->p >= c->end || *c->p < '0' || *c->p > '9')
            return -1;
        while (c->p < c->end && *c->p >= '0' && *c->p <= '9')
            c->p++;
    }
    if (c->p < c->end && (*c->p == 'e' || *c->p == 'E')) {
        c->p++;
        if (c->p < c->end && (*c->p == '+' || *c->p == '-'))
            c->p++;
        if (c->p >= c->end || *c->p < '0' || *c->p > '9')
            return -1;
        while (c->p < c->end && *c->p >= '0' && *c->p <= '9')
            c->p++;
    }
    return 0;
}

/* Parses the JSON value at c, keeping nothing. Returns 0 on success, -1 if invalid. */
static int skip_value(cursor *c, int depth)
{
    if (depth > MAX_DEPTH)
        return -1;
    skip_ws(c);
    if (c->p >= c->end)
        return -1;
    unsigned char ch = *c->p;
    if (ch == '"')
        return parse_string(c, NULL);
    if (ch == '{' || ch == '[') {
        unsigned char close = ch == '{' ? '}' : ']';
        c->p++;
        skip_ws(c);
        if (c->p < c->end && *c->p == close) {
            c->p++;
            return 0;
        }
        for (;;) {
            if (ch == '{') {
                skip_ws(c);
                if (parse_string(c, NULL) != 0)
                    return -1;
                skip_ws(c);
                if (c->p >= c->end || *c->p != ':')
                    return -1;
                c->p++;
            }
            if (skip_value(c, depth + 1) != 0)
                return -1;
            skip_ws(c);
            if (c->p >= c->end)
                return -1;
            if (*c->p == close) {
                c->p++;
                return 0;
            }
            if (*c->p != ',')
                return -1;
            c->p++;
        }
    }
    static const char *const words[] = {"true", "false", "null"};
    for (size_t i = 0; i < sizeof words / sizeof words[0]; i++) {
        size_t n = strlen(words[i]);
        if ((size_t)(c->end - c->p) >= n && memcmp(c->p, words[i], n) == 0) {
            c->p += n;
            return 0;
        }
    }
    return parse_number(c);
}

/* Returns the index of the hook named by key, or -1 if key names none. */
static int hook_index(const byte_buf *key)
{
    for (int i = 0; i < HOOK_COUNT; i++)
        if (key->len == strlen(hooks[i]) && memcmp(key->data, hooks[i], key->len) == 0)
            return i;
    return -1;
}

/*
 * Parses the object at c (depth levels deep) member by member. With
 * scripts set it is the "scripts" object: string members named after a
 * hook are decoded into value[hook] and set[hook] says whether the last one
 * was a string. Otherwise it is the top-level object, and each "scripts"
 * member clears the hooks and, if it is an object, is parsed with scripts
 * set. key is scratch space. Returns 0 on success, -1 if invalid or out of
 * memory (then c->oom is set).
 */
static int parse_object(cursor *c, int depth, int scripts, byte_buf *value, int *set, byte_buf *key)
{
    skip_ws(c);
    if (c->p >= c->end || *c->p != '{')
        return -1;
    c->p++;
    skip_ws(c);
    if (c->p < c->end && *c->p == '}') {
        c->p++;
        return 0;
    }
    for (;;) {
        skip_ws(c);
        key->len = 0;
        if (parse_string(c, key) != 0)
            return -1;
        skip_ws(c);
        if (c->p >= c->end || *c->p != ':')
            return -1;
        c->p++;
        skip_ws(c);

        int hook = scripts ? hook_index(key) : -1;
        int is_scripts = !scripts && key->len == 7 && memcmp(key->data, "scripts", 7) == 0;
        if (hook >= 0) {
            set[hook] = 0;
            if (c->p < c->end && *c->p == '"') {
                value[hook].len = 0;
                if (parse_string(c, &value[hook]) != 0)
                    return -1;
                set[hook] = 1;
            } else if (skip_value(c, depth + 1) != 0) {
                return -1;
            }
        } else if (is_scripts) {
            for (int i = 0; i < HOOK_COUNT; i++)
                set[i] = 0;
            if (c->p < c->end && *c->p == '{') {
                if (depth + 1 > MAX_DEPTH || parse_object(c, depth + 1, 1, value, set, key) != 0)
                    return -1;
            } else if (skip_value(c, depth + 1) != 0) {
                return -1;
            }
        } else if (skip_value(c, depth + 1) != 0) {
            return -1;
        }

        skip_ws(c);
        if (c->p >= c->end)
            return -1;
        if (*c->p == '}') {
            c->p++;
            return 0;
        }
        if (*c->p != ',')
            return -1;
        c->p++;
    }
}

int install_scripts(const unsigned char *json, size_t len, unsigned char **out, size_t *out_len)
{
    if (out == NULL || out_len == NULL || (json == NULL && len > 0))
        return -1;
    *out = NULL;
    *out_len = 0;

    cursor c = {json, json + len, 0};
    if (len >= 3 && json[0] == 0xEF && json[1] == 0xBB && json[2] == 0xBF)
        c.p += 3;
    byte_buf value[HOOK_COUNT] = {{0}};
    int set[HOOK_COUNT] = {0};
    byte_buf key = {0};
    byte_buf text = {0};
    int rc = 0;

    int valid = parse_object(&c, 1, 0, value, set, &key) == 0;
    if (c.oom) {
        rc = -1;
        goto done;
    }
    skip_ws(&c);
    if (!valid || c.p != c.end)
        goto done;
    for (int i = 0; i < HOOK_COUNT; i++) {
        if (!set[i] || value[i].len == 0)
            continue;
        if (append(&text, value[i].data, value[i].len) != 0 || append(&text, "\n", 1) != 0) {
            rc = -1;
            goto done;
        }
    }
    *out = text.data;
    *out_len = text.len;
    text.data = NULL;

done:
    free(text.data);
    free(key.data);
    for (int i = 0; i < HOOK_COUNT; i++)
        free(value[i].data);
    return rc;
}
