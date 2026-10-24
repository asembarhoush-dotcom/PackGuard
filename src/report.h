#ifndef PACKGUARD_REPORT_H
#define PACKGUARD_REPORT_H

#include <stddef.h>
#include <stdio.h>

/* One nearby reference group and the lowest NCD to it. */
typedef struct {
    const char *group;
    double ncd;
} report_near;

/* One reference package that was the closest match of at least one chunk. */
typedef struct {
    const char *package;
    const char *group;
    double ncd;
    size_t chunks;
} report_match;

/* One scored chunk of the package and the reference chunk closest to it. */
typedef struct {
    const char *file;
    size_t start;
    double ncd;
    const char *match_file;
    const char *match_package;
    size_t match_start;
    const unsigned char *text;
    size_t text_len;
    const report_near *near;
    size_t near_count;
} report_chunk;

/* Stage 1 result for one package, as written by write_report(). */
typedef struct {
    const char *package;
    const char *version;
    double score;
    int has_score;
    double threshold;
    int has_threshold;
    double seconds;
    int has_seconds;
    const report_match *matched;
    size_t matched_count;
    const report_chunk *chunks;
    size_t count;
} package_report;

/*
 * Writes r to out as the JSON object stage 2 reads:
 * package, version, score (null when has_score is 0), threshold and flagged
 * (only when has_threshold is set; flagged means score <= threshold),
 * seconds (scan time, only when has_seconds is set), matched_packages
 * (only when matched is not NULL: a list of {package, group, ncd, chunks}
 * in the given order), then one entry per chunk with file, start, ncd,
 * match {file, package (when match_package is not NULL), start}, near
 * (only when the chunk has near_count > 0: a list of {group, ncd}, closest
 * first) and text.
 * r and everything it points to are only borrowed for the call.
 * Strings are escaped per RFC 8259. Chunk text is raw file bytes cut at
 * fixed offsets, so any byte that is not part of a valid UTF-8 sequence is
 * written as � to keep the output valid UTF-8. A non-finite number is
 * written as null.
 *
 * Returns 0 on success, -1 if r is invalid or writing to out fails.
 */
int write_report(FILE *out, const package_report *r);

/*
 * Writes r to a new file at path with write_report(), replacing any file
 * already there.
 *
 * Returns 0 on success, -1 on failure with errno set.
 */
int write_report_file(const char *path, const package_report *r);

#endif
