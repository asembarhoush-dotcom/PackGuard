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
