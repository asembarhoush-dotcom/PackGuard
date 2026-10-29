#ifndef PACKGUARD_NORMALISE_H
#define PACKGUARD_NORMALISE_H

#include <stddef.h>

#define PAYLOAD_MAX_COUNT 64u
#define PAYLOAD_MAX_DEPTH 2
#define COLLAPSE_MIN_BYTES 16u
#define COLLAPSE_MIN_COUNT 3u

/* Decoded payloads found in one JavaScript file, each a malloc'd buffer. */
typedef struct {
    unsigned char *data[PAYLOAD_MAX_COUNT];
    size_t len[PAYLOAD_MAX_COUNT];
    size_t count;
} payload_list;

/*
 * Returns a malloc'd normalised token stream of len bytes of JavaScript:
 * comments and whitespace are removed, string literals become S, numbers
 * become N, and identifiers become I except for language keywords. When
 * decode is nonzero, long base64 or hex string literals and whole-file
 * base64 or hex payloads are decoded and their normalised text is appended,
 * which lets an encoded variant match the code it hides. The caller frees
 * the result. Returns NULL with errno set on failure; an empty input returns
 * an empty buffer, not NULL.
 */
unsigned char *normalise_js(const unsigned char *data, size_t len, int decode, size_t *out_len);

/*
 * Finds the encoded payloads of len bytes of JavaScript and decodes them
 * into out: the whole file when it is one base64 or hex payload, and every
 * string literal of at least 16 bytes that is one, as long as the decoded
 * bytes are mostly printable text. Decoded payloads are searched again for
 * nested payloads, up to PAYLOAD_MAX_DEPTH levels; at most PAYLOAD_MAX_COUNT
 * payloads are kept, in the order they are found. Comments are skipped,
 * and a payload whose buffer cannot be allocated is left out. Free out with
 * free_payloads().
 */
void find_payloads(const unsigned char *data, size_t len, payload_list *out);

/* Frees every payload in list and resets it to empty. */
void free_payloads(payload_list *list);

/*
 * Removes repeated blocks from a normalised token stream in place and
 * returns its new length. The stream is cut into blocks after every '}'
 * and before every function keyword;
 * every block of at least COLLAPSE_MIN_BYTES bytes that occurs
 * COLLAPSE_MIN_COUNT or more times in the stream is dropped at each
 * occurrence, since template-generated filler such as inserted dead code
 * carries nothing specific to a family. When nothing would remain, the
 * stream is left unchanged.
 */
size_t collapse_repeats(unsigned char *data, size_t len);

#endif
