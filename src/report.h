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
    const char *kind;
    size_t start;
    double ncd;
    double threshold;
    int has_threshold;
    int flagged;
    const char *match_file;
    const char *match_package;
    size_t match_start;
    const unsigned char *text;
    size_t text_len;
    const report_near *near;
    size_t near_count;
    int ignored;
    double benign_ncd;
    int has_benign;
    const char *benign_match;
} report_chunk;

/* One scored normalised-view chunk: where it is, its closest malware and benign references and its verdict. */
typedef struct {
    const char *file;
    size_t start;
    size_t length;
    double ncd;
    const char *match_file;
    double benign_ncd;
    int has_benign;
    const char *benign_match;
    double threshold;
    int has_threshold;
    int flagged;
} report_view_chunk;

/* Stage 1 result for one package, as written by write_report(). */
typedef struct {
    const char *package;
    const char *version;
    double score;
    int has_score;
    double score_raw;
    int has_score_raw;
    double score_normalized;
    int has_score_normalized;
    const char *score_view;
    const char *normalized_match_file;
    const char *normalized_match_package;
    size_t normalized_match_start;
    double normalized_match_ncd;
    size_t ignored_small_chunks;
    int low_confidence;
    double threshold;
    int has_threshold;
    int flagged;
    unsigned primitive_score;
    int has_primitive;
    int primitive_flagged;
    const char *primitive_hits;
    int has_benign;
    size_t benign_vetoed;
    double seconds;
    int has_seconds;
    const report_match *matched;
    size_t matched_count;
    const report_chunk *chunks;
    size_t count;
    const report_view_chunk *norm_chunks;
    size_t norm_count;
} package_report;

/*
 * Writes r to out as the JSON object stage 2 reads:
 * package, version, score (null when has_score is 0), ignored_small_chunks
 * (only when positive), low_confidence (only when set), threshold and flagged
 * (only when has_threshold is set; flagged is r->flagged, the OR of the
 * per-chunk rules and the primitive rule), primitive_score,
 * primitive_flagged and primitive_hits (only when has_primitive is set),
 * benign_vetoed (only when has_benign is set: how many chunks were within
 * their threshold but no closer to malware than to benign code by the
 * margin), seconds (scan time, only when has_seconds is set),
 * matched_packages (only when matched is not NULL: a list of {package,
 * group, ncd, chunks} in the given order), then one entry per chunk with
 * file, kind (when not NULL), start, ncd, threshold and flagged (each only
 * when has_threshold is set), ignored (only when set), match {file, package
 * (when match_package is not NULL), start}, benign_ncd and benign_match
 * (only when the chunk has_benign), near (only when the chunk has
 * near_count > 0: a list of {group, ncd}, closest first) and text; and,
 * when norm_chunks is not NULL, normalized_chunks: one entry per normalised
 * chunk with file, start, length, ncd, match, benign_ncd and benign_match
 * (when it has_benign), and threshold and flagged (when has_threshold).
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
