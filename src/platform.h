#ifndef PACKGUARD_PLATFORM_H
#define PACKGUARD_PLATFORM_H

#include <stddef.h>

#ifdef _WIN32
/* A worker thread started by thread_start(). */
typedef struct {
    void *handle;
    void *(*fn)(void *);
    void *arg;
} thread_handle;
#else
#include <pthread.h>
/* A worker thread started by thread_start(). */
typedef struct {
    pthread_t id;
} thread_handle;
#endif

/* What a path names on disk. */
typedef enum {
    PATH_MISSING,
    PATH_FILE,
    PATH_DIR,
    PATH_OTHER
} path_kind;

/*
 * Returns the number of logical processors this process may run on,
 * across all processor groups on Windows. Always at least 1.
 */
size_t cpu_count(void);

/* Returns a monotonic clock reading in seconds. */
double now_seconds(void);

/*
 * Starts fn(arg) on a new thread. On Windows t must stay at the same
 * address until thread_join() returns.
 *
 * Returns 0 on success, -1 on failure.
 */
int thread_start(thread_handle *t, void *(*fn)(void *), void *arg);

/* Waits for a thread started by thread_start() to finish and releases it. */
void thread_join(thread_handle *t);

/* Worker threads that are started once and then run one job after another. */
typedef struct thread_pool thread_pool;

/*
 * Starts nthreads (at least 1) worker threads that sleep until pool_run()
 * hands them a job. Release the pool with pool_free().
 *
 * Returns the pool, or NULL if memory runs out or a thread cannot start.
 */
thread_pool *pool_create(size_t nthreads);

/*
 * Runs fn(arg, i) on worker i for every i below the pool's thread count,
 * all at the same time, and returns once every call has finished. Jobs run
 * one at a time: pool_run() must not be called from two threads at once.
 */
void pool_run(thread_pool *pool, void (*fn)(void *arg, size_t worker), void *arg);

/* Wakes and joins every worker of pool and frees it. NULL is ignored. */
void pool_free(thread_pool *pool);

/* Returns what path names, following symbolic links. */
path_kind path_type(const char *path);

/*
 * Lists the entries of the directory at path, without "." and "..", sorted
 * by strcmp() so the order is the same on every platform. Release the
 * result with free_names().
 *
 * Returns 0 on success. On failure returns -1, sets errno and leaves
 * *names NULL and *count 0.
 */
int list_dir(const char *path, char ***names, size_t *count);

/* Frees a list returned by list_dir(). */
void free_names(char **names, size_t count);

/* Returns 1 if c separates path components on this platform, otherwise 0. */
int is_path_sep(char c);

/*
 * Switches stdout to binary mode so reports are byte-identical on every
 * platform (no "\r\n" on Windows). Does nothing elsewhere.
 */
void stdout_binary(void);

#endif
