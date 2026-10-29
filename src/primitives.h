#ifndef PACKGUARD_PRIMITIVES_H
#define PACKGUARD_PRIMITIVES_H

#include <stddef.h>

/* Behavioural primitive categories found in one chunk. */
typedef struct {
    unsigned net;
    unsigned webhook;
    unsigned host;
    unsigned env;
    unsigned exec;
    unsigned encoding;
    unsigned sensitive;
    unsigned obfuscation;
    unsigned eval;
    unsigned decode;
} primitive_hits;

/*
 * Scans one chunk of package text for behavioural primitives: network use,
 * webhook or DNS endpoints, host and identity reads, environment reads, shell
 * execution, encoding, sensitive paths, obfuscation and dynamic evaluation.
 * The scan is case-insensitive and works on raw bytes.
 */
primitive_hits primitives_scan(const unsigned char *data, size_t len);

/*
 * Returns 1 when hits meet the new-campaign rule. Install scripts require a
 * network primitive plus a host, environment, execution, encoding or
 * sensitive-path primitive. JavaScript requires a network primitive plus a
 * host or sensitive-path primitive, a webhook plus execution, an
 * environment-plus-execution exfiltration pattern, or evaluation plus
 * decoding.
 */
int primitives_flagged(primitive_hits hits, int is_script);

/* Returns the union of a and b. */
primitive_hits primitives_union(primitive_hits a, primitive_hits b);

/* Returns how many distinct primitive categories are present. */
unsigned primitives_score(primitive_hits hits);

/*
 * Writes the present category names into out as a space-separated string.
 * out is always NUL-terminated when size is greater than 0.
 */
void primitives_hits_string(primitive_hits hits, char *out, size_t size);

#endif
