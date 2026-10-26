#include "boilerplate.h"

#include <ctype.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>

/* Returns 1 if c is a JavaScript identifier character, otherwise 0. */
static int ident_char(unsigned char c)
{
    return isalnum(c) || c == '_' || c == '$';
}

/*
 * Copies begin..end into out with whitespace and comments removed, keeping
 * string and template literals intact, and returns the bytes written.
 */
static size_t normalize(const unsigned char *begin, const unsigned char *end, char *out)
{
    size_t n = 0;
    const unsigned char *p = begin;
    while (p < end) {
        unsigned char c = *p;
        if (c == '"' || c == '\'' || c == '`') {
            out[n++] = (char)*p++;
            while (p < end) {
                out[n++] = (char)*p;
                if (*p == '\\' && p + 1 < end) {
                    out[n++] = (char)p[1];
                    p += 2;
                    continue;
                }
                if (*p == c) {
                    p++;
                    break;
                }
                p++;
            }
        } else if (c == '/' && p + 1 < end && p[1] == '/') {
            while (p < end && *p != '\n')
                p++;
        } else if (c == '/' && p + 1 < end && p[1] == '*') {
            p += 2;
            while (p + 1 < end && !(p[0] == '*' && p[1] == '/'))
                p++;
            if (p + 1 < end)
                p += 2;
        } else if (isspace(c)) {
            p++;
        } else {
            out[n++] = (char)*p++;
        }
    }
    return n;
}

/*
 * Returns the first position after the top-level semicolon that ends the
 * statement at p, or end when the statement runs to the end.
 */
static const char *statement_end(const char *p, const char *end)
{
    int depth = 0;
    char quote = '\0';
    for (; p < end; p++) {
        char c = *p;
        if (quote != '\0') {
            if (c == '\\' && p + 1 < end) {
                p++;
                continue;
            }
            if (c == quote)
                quote = '\0';
            continue;
        }
        if (c == '"' || c == '\'' || c == '`') {
            quote = c;
        } else if (c == '(' || c == '[' || c == '{') {
            depth++;
        } else if (c == ')' || c == ']' || c == '}') {
            if (depth > 0)
                depth--;
        } else if (c == ';' && depth == 0) {
            return p + 1;
        }
    }
    return end;
}

/* Returns 1 when s[0..n) is exactly lit, otherwise 0. */
static int same(const char *s, size_t n, const char *lit)
{
    size_t len = strlen(lit);
    return n == len && memcmp(s, lit, len) == 0;
}

/* Returns 1 when s[0..n) starts with lit, otherwise 0. */
static int starts(const char *s, size_t n, const char *lit)
{
    size_t len = strlen(lit);
    return n >= len && memcmp(s, lit, len) == 0;
}

/* Returns 1 when s[0..n) ends with lit, otherwise 0. */
static int ends(const char *s, size_t n, const char *lit)
{
    size_t len = strlen(lit);
    return n >= len && memcmp(s + n - len, lit, len) == 0;
}

/* Returns 1 when s[0..n) contains lit, otherwise 0. */
static int contains(const char *s, size_t n, const char *lit)
{
    size_t len = strlen(lit);
    if (len == 0)
        return 1;
    for (size_t i = 0; i + len <= n; i++)
        if (memcmp(s + i, lit, len) == 0)
            return 1;
    return 0;
}

/* Returns 1 when name is a TypeScript helper emitted by the compiler, otherwise 0. */
static int helper_name(const char *name, size_t n)
{
    static const char *const names[] = {
        "__assign", "__asyncGenerator", "__asyncValues", "__await", "__awaiter",
        "__classPrivateFieldGet", "__classPrivateFieldIn", "__classPrivateFieldSet",
        "__createBinding", "__decorate", "__esDecorate", "__exportStar", "__extends",
        "__generator", "__importDefault", "__importStar", "__init", "__metadata",
        "__param", "__propKey", "__read", "__rest", "__runInitializers", "__setFunctionName",
        "__setModuleDefault", "__spreadArray", "__spreadArrays", "__values",
    };
    for (size_t i = 0; i < sizeof names / sizeof names[0]; i++)
        if (strlen(names[i]) == n && memcmp(name, names[i], n) == 0)
            return 1;
    return 0;
}

/* Returns 1 when the statement is a TypeScript helper definition, otherwise 0. */
static int statement_is_helper(const char *s, size_t n)
{
    if (!starts(s, n, "var__") || n < 7)
        return 0;
    size_t start = 3;
    size_t stop = start;
    while (stop < n && ident_char((unsigned char)s[stop]))
        stop++;
    return stop < n && s[stop] == '=' && helper_name(s + start, stop - start);
}

/* Returns 1 when the statement is a CommonJS or TypeScript export marker, otherwise 0. */
static int statement_is_marker(const char *s, size_t n)
{
    return same(s, n, "Object.defineProperty(exports,\"__esModule\",{value:true});")
           || same(s, n, "Object.defineProperty(exports,'__esModule',{value:true});")
           || same(s, n, "exports.__esModule=true;");
}

/* Returns 1 when the statement is a void export marker, otherwise 0. */
static int statement_is_void_export(const char *s, size_t n)
{
    if (!starts(s, n, "exports.") || !ends(s, n, "=void0;"))
        return 0;
    return !contains(s, n, "(") && !contains(s, n, "require");
}

/* Returns 1 when the statement is __exportStar(require(...), exports);, otherwise 0. */
static int statement_is_export_star(const char *s, size_t n)
{
    return starts(s, n, "__exportStar(require(") && ends(s, n, "),exports);");
}

/* Returns 1 when the statement is var x = require("...");, otherwise 0. */
static int statement_is_require_binding(const char *s, size_t n)
{
    if (!starts(s, n, "var") || starts(s, n, "var__"))
        return 0;
    size_t eq = 3;
    while (eq < n && ident_char((unsigned char)s[eq]))
        eq++;
    if (eq == 3 || eq >= n || s[eq] != '=')
        return 0;
    const char *rest = s + eq + 1;
    size_t left = n - eq - 1;
    if (!starts(rest, left, "require"))
        return 0;
    return (ends(rest, left, "\");") || ends(rest, left, "');"));
}

/* Returns 1 when the statement re-exports one name from a require, otherwise 0. */
static int statement_is_reexport_getter(const char *s, size_t n)
{
    return starts(s, n, "Object.defineProperty(exports,")
           && contains(s, n, "{enumerable:true,get:function(){return")
           && ends(s, n, ";");
}

/* Returns 1 when the statement is an ES module re-export, otherwise 0. */
static int statement_is_esm_reexport(const char *s, size_t n)
{
    if (!starts(s, n, "export"))
        return 0;
    return starts(s, n, "export*from")
           || (starts(s, n, "export{") && contains(s, n, "}from"))
           || same(s, n, "export{};");
}

/*
 * Returns 1 when data is only a compiled module stub, otherwise 0. The chunk
 * must contain at least one helper, export or re-export statement, and every
 * statement must be one itself.
 */
int is_boilerplate(const unsigned char *data, size_t len)
{
    if (data == NULL || len == 0)
        return 0;
    char *buf = malloc(len);
    if (buf == NULL)
        return 0;
    size_t n = normalize(data, data + len, buf);
    const char *p = buf;
    const char *end = buf + n;
    int marker = 0;
    int statements = 0;
    while (p < end) {
        if (*p == ';') {
            p++;
            continue;
        }
        const char *next = statement_end(p, end);
        size_t sn = (size_t)(next - p);
        if (same(p, sn, "\"use strict\";") || same(p, sn, "'use strict';")) {
        } else if (statement_is_helper(p, sn) || statement_is_marker(p, sn)
                   || statement_is_export_star(p, sn) || statement_is_require_binding(p, sn)
                   || statement_is_reexport_getter(p, sn) || statement_is_esm_reexport(p, sn)) {
            marker = 1;
        } else if (statement_is_void_export(p, sn)) {
            marker = 1;
        } else {
            free(buf);
            return 0;
        }
        statements++;
        p = next;
    }
    free(buf);
    return marker && statements > 0;
}
