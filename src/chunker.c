#include "chunker.h"

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

/* Reads the whole stream into a malloc'd buffer. Returns NULL on failure. */
static unsigned char *read_all(FILE *fp, size_t *size_out)
{
    size_t cap = 64u * 1024u;
    size_t len = 0;
    unsigned char *buf = malloc(cap);
    if (buf == NULL)
        return NULL;

    for (;;) {
        if (len == cap) {
            if (cap > SIZE_MAX / 2) {
                free(buf);
                errno = EFBIG;
                return NULL;
            }
            unsigned char *bigger = realloc(buf, cap * 2);
            if (bigger == NULL) {
                free(buf);
                return NULL;
            }
            buf = bigger;
            cap *= 2;
        }

        size_t want = cap - len;
        size_t got = fread(buf + len, 1, want, fp);
        len += got;
        if (got < want) {
            if (ferror(fp)) {
                free(buf);
                errno = EIO;
                return NULL;
            }
            break;
        }
    }

    *size_out = len;
    return buf;
}

/*
 * Returns how many chunks a file of size bytes needs: 0 when empty, 1 when it
 * fits within SPLIT_THRESHOLD, otherwise enough steps for the last chunk to
 * reach the end of the file.
 */
static size_t chunk_count(size_t size)
{
    if (size == 0)
        return 0;
    if (size <= SPLIT_THRESHOLD)
        return 1;
    return (size - CHUNK_SIZE + CHUNK_STEP - 1) / CHUNK_STEP + 1;
}

unsigned char *read_file(const char *path, size_t *size_out)
{
    if (path == NULL || size_out == NULL) {
        errno = EINVAL;
        return NULL;
    }
    FILE *fp = fopen(path, "rb");
    if (fp == NULL)
        return NULL;

    size_t size = 0;
    unsigned char *buf = read_all(fp, &size);
    int saved_errno = errno;
    fclose(fp);
    if (buf == NULL) {
        errno = saved_errno;
        return NULL;
    }
    *size_out = size;
    return buf;
}

int split_file(const char *path, chunk_list *out)
{
    if (out == NULL) {
        errno = EINVAL;
        return -1;
    }
    *out = (chunk_list){0};

    size_t size = 0;
    unsigned char *buf = read_file(path, &size);
    if (buf == NULL)
        return -1;
    return split_buffer(buf, size, out);
}

int split_buffer(unsigned char *buf, size_t size, chunk_list *out)
{
    if (out == NULL) {
        free(buf);
        errno = EINVAL;
        return -1;
    }
    *out = (chunk_list){0};
    if (buf == NULL && size > 0) {
        errno = EINVAL;
        return -1;
    }

    size_t count = chunk_count(size);
    file_chunk *chunks = NULL;
    if (count > 0) {
        chunks = malloc(count * sizeof *chunks);
        if (chunks == NULL) {
            free(buf);
            return -1;
        }
    }

    size_t max_len = count == 1 ? size : CHUNK_SIZE;
    for (size_t i = 0; i < count; i++) {
        size_t start = i * CHUNK_STEP;
        size_t remaining = size - start;
        chunks[i].offset = start;
        chunks[i].length = remaining < max_len ? remaining : max_len;
        chunks[i].data = buf + start;
    }

    out->buffer = buf;
    out->file_size = size;
    out->chunks = chunks;
    out->count = count;
    return 0;
}

void free_chunks(chunk_list *list)
{
    if (list == NULL)
        return;
    free(list->chunks);
    free(list->buffer);
    *list = (chunk_list){0};
}
