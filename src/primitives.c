#include "primitives.h"

#include <ctype.h>
#include <stdio.h>
#include <string.h>

enum {
    HIT_NET,
    HIT_WEBHOOK,
    HIT_HOST,
    HIT_ENV,
    HIT_EXEC,
    HIT_ENCODING,
    HIT_SENSITIVE,
    HIT_OBFUSCATION,
    HIT_EVAL,
    HIT_DECODE
};

/* One text needle and the primitive category it marks. */
typedef struct {
    const char *needle;
    int category;
} primitive_needle;

static const primitive_needle needles[] = {
    {"http://", HIT_NET},
    {"https://", HIT_NET},
    {"fetch(", HIT_NET},
    {"xmlhttprequest", HIT_NET},
    {"websocket", HIT_NET},
    {"axios", HIT_NET},
    {"require('http", HIT_NET},
    {"require(\"http", HIT_NET},
    {"require('https", HIT_NET},
    {"require(\"https", HIT_NET},
    {"require('net", HIT_NET},
    {"require(\"net", HIT_NET},
    {"require('dns", HIT_NET},
    {"require(\"dns", HIT_NET},
    {"nslookup", HIT_NET},
    {"ipify", HIT_NET},
    {".oast", HIT_NET},
    {"webhook", HIT_WEBHOOK},
    {"telegram", HIT_WEBHOOK},
    {"discord", HIT_WEBHOOK},
    {"ipify", HIT_WEBHOOK},
    {".oast", HIT_WEBHOOK},
    {"hostname", HIT_HOST},
    {"userinfo", HIT_HOST},
    {"whoami", HIT_HOST},
    {"homedir", HIT_HOST},
    {"process.env", HIT_ENV},
    {"userdomain", HIT_ENV},
    {"child_process", HIT_EXEC},
    {"exec(", HIT_EXEC},
    {"execsync", HIT_EXEC},
    {"spawn(", HIT_EXEC},
    {"spawnsync", HIT_EXEC},
    {"bash -c", HIT_EXEC},
    {"sh -c", HIT_EXEC},
    {"powershell", HIT_EXEC},
    {"cmd.exe", HIT_EXEC},
    {"node -e", HIT_EXEC},
    {"curl ", HIT_EXEC},
    {"wget ", HIT_EXEC},
    {"| sh", HIT_EXEC},
    {"| bash", HIT_EXEC},
    {"| node", HIT_EXEC},
    {"base64", HIT_ENCODING},
    {"atob(", HIT_ENCODING},
    {"btoa(", HIT_ENCODING},
    {"buffer.from", HIT_ENCODING},
    {"fromcharcode", HIT_ENCODING},
    {"unescape(", HIT_ENCODING},
    {"decodeuricomponent", HIT_ENCODING},
    {".ssh", HIT_SENSITIVE},
    {".aws", HIT_SENSITIVE},
    {".npmrc", HIT_SENSITIVE},
    {".git-credentials", HIT_SENSITIVE},
    {"\".env\"", HIT_SENSITIVE},
    {"'.env'", HIT_SENSITIVE},
    {"/.env", HIT_SENSITIVE},
    {"wallet", HIT_SENSITIVE},
    {"privatekey", HIT_SENSITIVE},
    {"mnemonic", HIT_SENSITIVE},
    {"_0x", HIT_OBFUSCATION},
    {"eval(", HIT_EVAL},
    {"new function", HIT_EVAL},
    {"function(", HIT_EVAL},
    {"base64", HIT_DECODE},
    {"atob(", HIT_DECODE},
    {"btoa(", HIT_DECODE},
    {"buffer.from", HIT_DECODE},
};

/* Returns 1 when s[0..n) contains lit, ignoring ASCII case, otherwise 0. */
static int contains_ci(const unsigned char *s, size_t n, const char *lit)
{
    size_t len = strlen(lit);
    if (len == 0)
        return 1;
    if (n < len)
        return 0;
    for (size_t i = 0; i + len <= n; i++) {
        size_t j = 0;
        while (j < len && tolower(s[i + j]) == tolower((unsigned char)lit[j]))
            j++;
        if (j == len)
            return 1;
    }
    return 0;
}

/* Sets the category's flag in hits. */
static void set_hit(primitive_hits *hits, int category)
{
    switch (category) {
    case HIT_NET:
        hits->net = 1;
        break;
    case HIT_WEBHOOK:
        hits->webhook = 1;
        break;
    case HIT_HOST:
        hits->host = 1;
        break;
    case HIT_ENV:
        hits->env = 1;
        break;
    case HIT_EXEC:
        hits->exec = 1;
        break;
    case HIT_ENCODING:
        hits->encoding = 1;
        break;
    case HIT_SENSITIVE:
        hits->sensitive = 1;
        break;
    case HIT_OBFUSCATION:
        hits->obfuscation = 1;
        break;
    case HIT_EVAL:
        hits->eval = 1;
        break;
    case HIT_DECODE:
        hits->decode = 1;
        break;
    }
}

primitive_hits primitives_scan(const unsigned char *data, size_t len)
{
    primitive_hits hits = {0};
    if (data == NULL || len == 0)
        return hits;
    for (size_t i = 0; i < sizeof needles / sizeof needles[0]; i++)
        if (contains_ci(data, len, needles[i].needle))
            set_hit(&hits, needles[i].category);
    return hits;
}

int primitives_flagged(primitive_hits hits, int is_script)
{
    if (is_script)
        return hits.net && (hits.host || hits.env || hits.exec || hits.encoding || hits.sensitive);
    if (hits.net && (hits.host || hits.sensitive))
        return 1;
    if (hits.webhook && hits.exec)
        return 1;
    if (hits.net && hits.env && hits.exec)
        return 1;
    if (hits.eval && hits.decode)
        return 1;
    return 0;
}

primitive_hits primitives_union(primitive_hits a, primitive_hits b)
{
    return (primitive_hits){
        .net = a.net || b.net,
        .webhook = a.webhook || b.webhook,
        .host = a.host || b.host,
        .env = a.env || b.env,
        .exec = a.exec || b.exec,
        .encoding = a.encoding || b.encoding,
        .sensitive = a.sensitive || b.sensitive,
        .obfuscation = a.obfuscation || b.obfuscation,
        .eval = a.eval || b.eval,
        .decode = a.decode || b.decode,
    };
}

unsigned primitives_score(primitive_hits hits)
{
    return (unsigned)(hits.net + hits.webhook + hits.host + hits.env + hits.exec
                      + hits.encoding + hits.sensitive + hits.obfuscation
                      + hits.eval + hits.decode);
}

void primitives_hits_string(primitive_hits hits, char *out, size_t size)
{
    if (out == NULL || size == 0)
        return;
    const struct {
        unsigned value;
        const char *name;
    } labels[] = {
        {hits.net, "net"}, {hits.webhook, "webhook"}, {hits.host, "host"},
        {hits.env, "env"}, {hits.exec, "exec"}, {hits.encoding, "encoding"},
        {hits.sensitive, "sensitive"}, {hits.obfuscation, "obfuscation"},
        {hits.eval, "eval"}, {hits.decode, "decode"},
    };
    size_t used = 0;
    out[0] = '\0';
    for (size_t i = 0; i < sizeof labels / sizeof labels[0]; i++) {
        if (!labels[i].value)
            continue;
        int n = snprintf(out + used, size - used, "%s%s", used ? " " : "", labels[i].name);
        if (n < 0 || (size_t)n >= size - used) {
            out[size - 1] = '\0';
            return;
        }
        used += (size_t)n;
    }
}
