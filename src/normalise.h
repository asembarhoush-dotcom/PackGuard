#ifndef PACKGUARD_NORMALISE_H
#define PACKGUARD_NORMALISE_H

#include <stddef.h>

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

#endif
