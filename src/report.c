#include "report.h"

#include <errno.h>
#include <math.h>
#include <string.h>

/*
 * Returns the length of the well-formed UTF-8 sequence that starts at s,
 * or 0 if the bytes there are not one (overlong forms, surrogates, code
 * points above U+10FFFF and sequences cut off by the end are rejected).
 */
static size_t utf8_sequence(const unsigned char *s, size_t len)
{
    unsigned char c = s[0];
    if (c < 0x80)
        return 1;

    size_t need;
    unsigned char lo = 0x80, hi = 0xBF;
    if (c >= 0xC2 && c <= 0xDF) {
        need = 2;
    } else if (c >= 0xE0 && c <= 0xEF) {
        need = 3;
        if (c == 0xE0)
            lo = 0xA0;
        else if (c == 0xED)
            hi = 0x9F;
    } else if (c >= 0xF0 && c <= 0xF4) {
        need = 4;
        if (c == 0xF0)
            lo = 0x90;
        else if (c == 0xF4)
            hi = 0x8F;
    } else {
        return 0;
    }

    if (len < need || s[1] < lo || s[1] > hi)
        return 0;
    for (size_t i = 2; i < need; i++)
        if (s[i] < 0x80 || s[i] > 0xBF)
            return 0;
    return need;
}

/* Writes len bytes of s to out as the body of a JSON string. */
static void json_escape(FILE *out, const unsigned char *s, size_t len)
{
    size_t i = 0;
    while (i < len) {
        unsigned char c = s[i];
        if (c == '"' || c == '\\') {
            fputc('\\', out);
            fputc(c, out);
            i++;
        } else if (c == '\n') {
            fputs("\\n", out);
            i++;
        } else if (c == '\r') {
            fputs("\\r", out);
            i++;
        } else if (c == '\t') {
            fputs("\\t", out);
            i++;
        } else if (c < 0x20 || c == 0x7F) {
            fprintf(out, "\\u%04x", c);
            i++;
        } else {
            size_t n = utf8_sequence(s + i, len - i);
            if (n == 0) {
                fputs("\\ufffd", out);
                i++;
            } else {
                fwrite(s + i, 1, n, out);
                i += n;
            }
        }
    }
}

/* Writes the NUL-terminated string s to out as a quoted JSON string; NULL becomes "". */
static void json_string(FILE *out, const char *s)
{
    fputc('"', out);
    if (s != NULL)
        json_escape(out, (const unsigned char *)s, strlen(s));
    fputc('"', out);
}

/* Writes x to out with four decimals, or null when it is not finite. */
static void json_number(FILE *out, double x)
{
    if (isfinite(x))
        fprintf(out, "%.4f", x);
    else
        fputs("null", out);
}

int write_report(FILE *out, const package_report *r)
{
    if (out == NULL || r == NULL || (r->chunks == NULL && r->count > 0)
        || (r->matched == NULL && r->matched_count > 0))
        return -1;

    fputs("{\n  \"package\": ", out);
    json_string(out, r->package);
    fputs(",\n  \"version\": ", out);
    json_string(out, r->version);
    fputs(",\n  \"score\": ", out);
    if (r->has_score)
        json_number(out, r->score);
    else
        fputs("null", out);
    if (r->has_score_raw) {
        fputs(",\n  \"score_raw\": ", out);
        json_number(out, r->score_raw);
    }
    if (r->has_score_normalized) {
        fputs(",\n  \"score_normalized\": ", out);
        json_number(out, r->score_normalized);
    }
    if (r->score_view != NULL) {
        fputs(",\n  \"score_view\": ", out);
        json_string(out, r->score_view);
    }
    if (r->normalized_match_file != NULL) {
        fputs(",\n  \"normalized_match\": { \"file\": ", out);
        json_string(out, r->normalized_match_file);
        fputs(", \"package\": ", out);
        json_string(out, r->normalized_match_package);
        fprintf(out, ", \"start\": %zu, \"ncd\": ", r->normalized_match_start);
        json_number(out, r->normalized_match_ncd);
        fputs(" }", out);
    }
    if (r->ignored_small_chunks > 0)
        fprintf(out, ",\n  \"ignored_small_chunks\": %zu", r->ignored_small_chunks);
    if (r->low_confidence)
        fputs(",\n  \"low_confidence\": true", out);
    if (r->has_threshold) {
        fputs(",\n  \"threshold\": ", out);
        json_number(out, r->threshold);
        fprintf(out, ",\n  \"flagged\": %s", r->flagged ? "true" : "false");
    }
    if (r->has_primitive) {
        fprintf(out, ",\n  \"primitive_score\": %u", r->primitive_score);
        fprintf(out, ",\n  \"primitive_flagged\": %s", r->primitive_flagged ? "true" : "false");
        if (r->primitive_hits != NULL) {
            fputs(",\n  \"primitive_hits\": ", out);
            json_string(out, r->primitive_hits);
        }
    }
    if (r->has_seconds) {
        fputs(",\n  \"seconds\": ", out);
        json_number(out, r->seconds);
    }
    if (r->matched != NULL) {
        fputs(",\n  \"matched_packages\": [", out);
        for (size_t i = 0; i < r->matched_count; i++) {
            const report_match *m = &r->matched[i];
            fputs(i ? ",\n    { \"package\": " : "\n    { \"package\": ", out);
            json_string(out, m->package);
            fputs(", \"group\": ", out);
            json_string(out, m->group);
            fputs(", \"ncd\": ", out);
            json_number(out, m->ncd);
            fprintf(out, ", \"chunks\": %zu }", m->chunks);
        }
        fputs(r->matched_count ? "\n  ]" : "]", out);
    }
    fputs(",\n  \"chunks\": [", out);
    for (size_t i = 0; i < r->count; i++) {
        const report_chunk *c = &r->chunks[i];
        fprintf(out, "%s\n    { \"file\": ", i ? "," : "");
        json_string(out, c->file);
        if (c->kind != NULL) {
            fputs(", \"kind\": ", out);
            json_string(out, c->kind);
        }
        fprintf(out, ", \"start\": %zu, \"ncd\": ", c->start);
        json_number(out, c->ncd);
        if (c->has_threshold) {
            fputs(", \"threshold\": ", out);
            json_number(out, c->threshold);
            fprintf(out, ", \"flagged\": %s", c->flagged ? "true" : "false");
        }
        if (c->ignored)
            fputs(", \"ignored\": true", out);
        fputs(", \"match\": { \"file\": ", out);
        json_string(out, c->match_file);
        if (c->match_package != NULL) {
            fputs(", \"package\": ", out);
            json_string(out, c->match_package);
        }
        fprintf(out, ", \"start\": %zu }", c->match_start);
        if (c->near != NULL && c->near_count > 0) {
            fputs(", \"near\": [", out);
            for (size_t k = 0; k < c->near_count; k++) {
                fputs(k ? ", { \"group\": " : "{ \"group\": ", out);
                json_string(out, c->near[k].group);
                fputs(", \"ncd\": ", out);
                json_number(out, c->near[k].ncd);
                fputs(" }", out);
            }
            fputc(']', out);
        }
        fputs(", \"text\": \"", out);
        if (c->text != NULL)
            json_escape(out, c->text, c->text_len);
        fputs("\" }", out);
    }
    fputs(r->count ? "\n  ]\n}\n" : "]\n}\n", out);

    return ferror(out) ? -1 : 0;
}

int write_report_file(const char *path, const package_report *r)
{
    if (path == NULL) {
        errno = EINVAL;
        return -1;
    }
    FILE *fp = fopen(path, "wb");
    if (fp == NULL)
        return -1;
    int rc = write_report(fp, r);
    int saved_errno = errno;
    if (fclose(fp) != 0 && rc == 0) {
        saved_errno = errno;
        rc = -1;
    }
    if (rc != 0 && saved_errno == 0)
        saved_errno = EIO;
    errno = saved_errno;
    return rc;
}
