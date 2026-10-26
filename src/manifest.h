#ifndef PACKGUARD_MANIFEST_H
#define PACKGUARD_MANIFEST_H

#include <stddef.h>

/*
 * Builds the install-script text of a package.json held in json[0..len):
 * the commands of the "preinstall", "install" and "postinstall" members of
 * its top-level "scripts" object, in that order, each followed by '\n'.
 * These are the lifecycle scripts npm runs when the package is installed
 * from the registry. Members that are missing, empty or not strings are
 * left out, and when a key repeats the last one wins, as in JSON.parse.
 * Escapes are decoded to UTF-8 (a lone surrogate becomes its 3-byte form)
 * and other bytes are copied as they are. A leading UTF-8 byte order mark
 * is skipped. JSON that is not valid, or nested deeper than 512 levels,
 * gives no scripts, since npm would not install such a package.
 *
 * On success stores a malloc'd buffer in *out (NULL when there are no
 * scripts) and its length in *out_len, and returns 0. Returns -1 if memory
 * runs out.
 */
int install_scripts(const unsigned char *json, size_t len, unsigned char **out, size_t *out_len);

#endif
