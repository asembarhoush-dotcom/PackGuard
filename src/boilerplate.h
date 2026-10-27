#ifndef PACKGUARD_BOILERPLATE_H
#define PACKGUARD_BOILERPLATE_H

#include <stddef.h>

/*
 * Returns 1 when data holds only a compiled module stub: "use strict", a
 * TypeScript helper definition, an export marker, a re-export statement or a
 * source-map comment, and nothing else. Returns 0 otherwise.
 */
int is_boilerplate(const unsigned char *data, size_t len);

#endif
