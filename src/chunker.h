#ifndef PACKGUARD_CHUNKER_H
#define PACKGUARD_CHUNKER_H

#include <stddef.h>

#define SPLIT_THRESHOLD (16u * 1024u)
#define CHUNK_SIZE      (8u * 1024u)
#define CHUNK_OVERLAP   (4u * 1024u)
#define CHUNK_STEP      (CHUNK_SIZE - CHUNK_OVERLAP)
#define CDC_MIN_SIZE    (2u * 1024u)
#define CDC_MAX_SIZE    (16u * 1024u)
#define CDC_MASK        (8u * 1024u - 1u)

/* One window of a file: its start offset, its length and a pointer into the shared file buffer. */
typedef struct {
    size_t offset;
    size_t length;
    const unsigned char *data;
} file_chunk;

/* Result of split_file(): the whole file buffer, its size and its chunks in file order. */
typedef struct {
    unsigned char *buffer;
    size_t file_size;
    file_chunk *chunks;
    size_t count;
} chunk_list;

/*
 * Reads the file at path into one buffer and describes it as chunks.
 * A file of SPLIT_THRESHOLD bytes or less becomes a single chunk holding the
 * whole file; an empty file has no chunks. A larger file is split into
 * CHUNK_SIZE windows that start every CHUNK_STEP bytes, so each chunk repeats
 * the last CHUNK_OVERLAP bytes of the one before it, and the last chunk is
 * shorter when the file doesn't end on a step. Chunk data points into the
 * buffer and is not a copy. Release the result with free_chunks().
 *
 * Returns 0 on success. On failure returns -1, sets errno and leaves out empty.
 */
int split_file(const char *path, chunk_list *out);

/*
 * Describes size bytes in buf as chunks, exactly as split_file() does for a
 * file with that content. Takes ownership of buf, which must come from
 * malloc() (or be NULL when size is 0), and frees it on failure.
 *
 * Returns 0 on success. On failure returns -1, sets errno and leaves out empty.
 */
int split_buffer(unsigned char *buf, size_t size, chunk_list *out);

/*
 * Describes size bytes in buf as content-defined chunks, taking ownership
 * of buf. A file of SPLIT_THRESHOLD bytes or less becomes one chunk, as in
 * split_buffer(). A larger file is cut at points chosen by a rolling hash of
 * the content, with chunks between CDC_MIN_SIZE and CDC_MAX_SIZE bytes; an
 * unchanged region keeps its boundaries when bytes are inserted, deleted or
 * moved elsewhere in the file. Only the last chunk can be shorter than
 * CDC_MIN_SIZE.
 *
 * Returns 0 on success. On failure returns -1, sets errno and leaves out empty.
 */
int split_buffer_cdc(unsigned char *buf, size_t size, chunk_list *out);

/*
 * Reads the file at path and describes it as content-defined chunks, exactly
 * as split_buffer_cdc() does for a buffer with that content.
 *
 * Returns 0 on success. On failure returns -1, sets errno and leaves out empty.
 */
int split_file_cdc(const char *path, chunk_list *out);

/*
 * Reads the whole file at path into a malloc'd buffer and stores its size
 * in *size_out. The caller frees the buffer.
 *
 * Returns the buffer, or NULL with errno set on failure.
 */
unsigned char *read_file(const char *path, size_t *size_out);

/* Frees everything split_file() or split_buffer() allocated and resets list to empty. */
void free_chunks(chunk_list *list);

#endif
