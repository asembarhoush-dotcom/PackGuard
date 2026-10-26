#ifndef _WIN32
#define _POSIX_C_SOURCE 200809L
#endif

#include "platform.h"

#include <errno.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#include <stdio.h>
#include <windows.h>
#else
#include <dirent.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>
#endif

/* qsort() comparator for an array of C strings, ordered by strcmp(). */
static int compare_names(const void *a, const void *b)
{
    return strcmp(*(char *const *)a, *(char *const *)b);
}

/*
 * Appends a copy of name to the growing array *names.
 * Returns 0 on success, -1 if memory runs out.
 */
static int push_name(char ***names, size_t *count, size_t *cap, const char *name)
{
    if (*count == *cap) {
        size_t bigger_cap = *cap ? *cap * 2 : 64;
        char **bigger = realloc(*names, bigger_cap * sizeof *bigger);
        if (bigger == NULL)
            return -1;
        *names = bigger;
        *cap = bigger_cap;
    }
    size_t len = strlen(name) + 1;
    char *copy = malloc(len);
    if (copy == NULL)
        return -1;
    memcpy(copy, name, len);
    (*names)[(*count)++] = copy;
    return 0;
}

void free_names(char **names, size_t count)
{
    for (size_t i = 0; i < count; i++)
        free(names[i]);
    free(names);
}

#ifdef _WIN32

size_t cpu_count(void)
{
    DWORD n = GetActiveProcessorCount(ALL_PROCESSOR_GROUPS);
    return n > 0 ? (size_t)n : 1;
}

double now_seconds(void)
{
    LARGE_INTEGER freq, now;
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&now);
    return (double)now.QuadPart / (double)freq.QuadPart;
}

/* CreateThread() entry point that runs the thread_handle's fn(arg). */
static DWORD WINAPI thread_trampoline(LPVOID param)
{
    thread_handle *t = param;
    t->fn(t->arg);
    return 0;
}

int thread_start(thread_handle *t, void *(*fn)(void *), void *arg)
{
    t->fn = fn;
    t->arg = arg;
    t->handle = CreateThread(NULL, 0, thread_trampoline, t, 0, NULL);
    return t->handle != NULL ? 0 : -1;
}

void thread_join(thread_handle *t)
{
    WaitForSingleObject(t->handle, INFINITE);
    CloseHandle(t->handle);
    t->handle = NULL;
}

typedef CRITICAL_SECTION pool_mutex;
typedef CONDITION_VARIABLE pool_cond;

/* Prepares a mutex and the two condition variables of a pool. */
static void sync_init(pool_mutex *m, pool_cond *a, pool_cond *b)
{
    InitializeCriticalSection(m);
    InitializeConditionVariable(a);
    InitializeConditionVariable(b);
}

/* Releases what sync_init() prepared. */
static void sync_free(pool_mutex *m, pool_cond *a, pool_cond *b)
{
    (void)a;
    (void)b;
    DeleteCriticalSection(m);
}

/* Locks m. */
static void mutex_lock(pool_mutex *m)
{
    EnterCriticalSection(m);
}

/* Unlocks m. */
static void mutex_unlock(pool_mutex *m)
{
    LeaveCriticalSection(m);
}

/* Unlocks m, sleeps until c is signalled and locks m again. */
static void cond_wait(pool_cond *c, pool_mutex *m)
{
    SleepConditionVariableCS(c, m, INFINITE);
}

/* Wakes every thread waiting on c. */
static void cond_wake_all(pool_cond *c)
{
    WakeAllConditionVariable(c);
}

path_kind path_type(const char *path)
{
    DWORD attr = GetFileAttributesA(path);
    if (attr == INVALID_FILE_ATTRIBUTES)
        return PATH_MISSING;
    if (attr & FILE_ATTRIBUTE_DIRECTORY)
        return PATH_DIR;
    if (attr & FILE_ATTRIBUTE_DEVICE)
        return PATH_OTHER;
    return PATH_FILE;
}

int list_dir(const char *path, char ***names, size_t *count)
{
    *names = NULL;
    *count = 0;
    size_t len = strlen(path);
    char *pattern = malloc(len + 3);
    if (pattern == NULL)
        return -1;
    memcpy(pattern, path, len);
    if (len > 0 && !is_path_sep(path[len - 1]))
        pattern[len++] = '\\';
    pattern[len++] = '*';
    pattern[len] = '\0';

    WIN32_FIND_DATAA data;
    HANDLE find = FindFirstFileExA(pattern, FindExInfoBasic, &data, FindExSearchNameMatch,
                                   NULL, FIND_FIRST_EX_LARGE_FETCH);
    free(pattern);
    if (find == INVALID_HANDLE_VALUE) {
        errno = GetLastError() == ERROR_PATH_NOT_FOUND ? ENOENT : EACCES;
        return -1;
    }

    size_t cap = 0;
    int rc = 0;
    do {
        const char *name = data.cFileName;
        if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0)
            continue;
        if (push_name(names, count, &cap, name) != 0) {
            rc = -1;
            break;
        }
    } while (FindNextFileA(find, &data));
    FindClose(find);

    if (rc != 0) {
        free_names(*names, *count);
        *names = NULL;
        *count = 0;
        errno = ENOMEM;
        return -1;
    }
    if (*count > 1)
        qsort(*names, *count, sizeof **names, compare_names);
    return 0;
}

int is_path_sep(char c)
{
    return c == '/' || c == '\\';
}

void stdout_binary(void)
{
    _setmode(_fileno(stdout), _O_BINARY);
}

#else

size_t cpu_count(void)
{
    long n = sysconf(_SC_NPROCESSORS_ONLN);
    return n > 0 ? (size_t)n : 1;
}

double now_seconds(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec + (double)ts.tv_nsec / 1e9;
}

int thread_start(thread_handle *t, void *(*fn)(void *), void *arg)
{
    return pthread_create(&t->id, NULL, fn, arg) == 0 ? 0 : -1;
}

void thread_join(thread_handle *t)
{
    pthread_join(t->id, NULL);
}

typedef pthread_mutex_t pool_mutex;
typedef pthread_cond_t pool_cond;

/* Prepares a mutex and the two condition variables of a pool. */
static void sync_init(pool_mutex *m, pool_cond *a, pool_cond *b)
{
    pthread_mutex_init(m, NULL);
    pthread_cond_init(a, NULL);
    pthread_cond_init(b, NULL);
}

/* Releases what sync_init() prepared. */
static void sync_free(pool_mutex *m, pool_cond *a, pool_cond *b)
{
    pthread_cond_destroy(a);
    pthread_cond_destroy(b);
    pthread_mutex_destroy(m);
}

/* Locks m. */
static void mutex_lock(pool_mutex *m)
{
    pthread_mutex_lock(m);
}

/* Unlocks m. */
static void mutex_unlock(pool_mutex *m)
{
    pthread_mutex_unlock(m);
}

/* Unlocks m, sleeps until c is signalled and locks m again. */
static void cond_wait(pool_cond *c, pool_mutex *m)
{
    pthread_cond_wait(c, m);
}

/* Wakes every thread waiting on c. */
static void cond_wake_all(pool_cond *c)
{
    pthread_cond_broadcast(c);
}

path_kind path_type(const char *path)
{
    struct stat st;
    if (stat(path, &st) != 0)
        return PATH_MISSING;
    if (S_ISREG(st.st_mode))
        return PATH_FILE;
    if (S_ISDIR(st.st_mode))
        return PATH_DIR;
    return PATH_OTHER;
}

int list_dir(const char *path, char ***names, size_t *count)
{
    *names = NULL;
    *count = 0;
    DIR *dir = opendir(path);
    if (dir == NULL)
        return -1;

    size_t cap = 0;
    int rc = 0;
    for (;;) {
        errno = 0;
        const struct dirent *entry = readdir(dir);
        if (entry == NULL)
            break;
        const char *name = entry->d_name;
        if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0)
            continue;
        if (push_name(names, count, &cap, name) != 0) {
            rc = -1;
            break;
        }
    }
    int saved_errno = errno;
    closedir(dir);

    if (rc != 0 || saved_errno != 0) {
        free_names(*names, *count);
        *names = NULL;
        *count = 0;
        errno = saved_errno ? saved_errno : ENOMEM;
        return -1;
    }
    if (*count > 1)
        qsort(*names, *count, sizeof **names, compare_names);
    return 0;
}

int is_path_sep(char c)
{
    return c == '/';
}

void stdout_binary(void)
{
}

#endif

/* One pool thread: its handle, its index and the pool it serves. */
typedef struct {
    thread_handle thread;
    thread_pool *pool;
    size_t index;
} pool_thread;

/* Worker threads plus the current job and the counters that hand it out. */
struct thread_pool {
    pool_mutex lock;
    pool_cond wake;
    pool_cond idle;
    pool_thread *threads;
    size_t count;
    size_t started;
    unsigned long generation;
    size_t busy;
    int stop;
    void (*fn)(void *, size_t);
    void *arg;
};

/*
 * Body of every pool thread: sleeps until a new job generation is posted,
 * runs the job once with its own index, reports that it is done, and repeats
 * until the pool stops.
 */
static void *pool_main(void *param)
{
    pool_thread *t = param;
    thread_pool *p = t->pool;
    unsigned long seen = 0;
    mutex_lock(&p->lock);
    for (;;) {
        while (!p->stop && p->generation == seen)
            cond_wait(&p->wake, &p->lock);
        if (p->stop)
            break;
        seen = p->generation;
        void (*fn)(void *, size_t) = p->fn;
        void *arg = p->arg;
        mutex_unlock(&p->lock);
        fn(arg, t->index);
        mutex_lock(&p->lock);
        if (--p->busy == 0)
            cond_wake_all(&p->idle);
    }
    mutex_unlock(&p->lock);
    return NULL;
}

thread_pool *pool_create(size_t nthreads)
{
    if (nthreads == 0)
        return NULL;
    thread_pool *p = calloc(1, sizeof *p);
    if (p == NULL)
        return NULL;
    p->threads = calloc(nthreads, sizeof *p->threads);
    if (p->threads == NULL) {
        free(p);
        return NULL;
    }
    sync_init(&p->lock, &p->wake, &p->idle);
    p->count = nthreads;
    for (; p->started < nthreads; p->started++) {
        pool_thread *t = &p->threads[p->started];
        t->pool = p;
        t->index = p->started;
        if (thread_start(&t->thread, pool_main, t) != 0) {
            pool_free(p);
            return NULL;
        }
    }
    return p;
}

void pool_run(thread_pool *pool, void (*fn)(void *arg, size_t worker), void *arg)
{
    mutex_lock(&pool->lock);
    pool->fn = fn;
    pool->arg = arg;
    pool->busy = pool->count;
    pool->generation++;
    cond_wake_all(&pool->wake);
    while (pool->busy > 0)
        cond_wait(&pool->idle, &pool->lock);
    mutex_unlock(&pool->lock);
}

void pool_free(thread_pool *pool)
{
    if (pool == NULL)
        return;
    mutex_lock(&pool->lock);
    pool->stop = 1;
    cond_wake_all(&pool->wake);
    mutex_unlock(&pool->lock);
    for (size_t i = 0; i < pool->started; i++)
        thread_join(&pool->threads[i].thread);
    sync_free(&pool->lock, &pool->wake, &pool->idle);
    free(pool->threads);
    free(pool);
}
