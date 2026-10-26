# Memory safety and ownership

The scanner is C, but it follows Rust's ownership and borrowing rules by convention: every allocation has exactly one owner, borrows never outlive their owner, and no memory is mutated by one thread while another can see it. This page records the model and how it was checked.

## Ownership model

| Owner | Owns | Borrows handed out | Released by |
|---|---|---|---|
| `chunk_list` | the file buffer and the `file_chunk` array | `file_chunk.data` points into the buffer | `free_chunks()` |
| `loaded_file` / `file_list` | the path string and its `chunk_list`; the item array | | `free_files()` |
| `reference_set` | `files`, `refs`, `group_names`, `package_names`, `file_package`, `extra_groups`, `digest_len`, the LZJD `index`, the thread `pool`, and `workers` (each worker owns its `compressor`, `group_best`, `lzjd_builder`, `lzjd_query` and candidate `subset`) | `ref_chunk.chunk` borrows from `files`; the index borrows `digest_len`; group and package names are lent to reports | `free_references()`, which stops the pool first |
| `thread_pool` | its threads, mutex and condition variables | each job borrows its argument until `pool_run()` returns | `pool_free()` |
| `lzjd_index` | the distinct values, the posting offsets and the posting lists | `digest_len` is borrowed from its owner | `lzjd_index_free()` |
| `lzjd_builder` | the phrase hash set and hash list, grown on demand and reused | | `lzjd_builder_free()` |
| `compressor` | the liblzma encoder state | `compressed_size_given()` borrows `dict` only for the call and clears `preset_dict` before returning | `compressor_free()` |
| `list_dir()` caller | the returned name array | | `free_names()` |
| `scan_batch()` | the batch's target files, chunk pointers, scores, timings, group rows, near lists | `write_package()` builds report rows and the matched-package list that borrow target text, paths, group and package names | rows freed in `write_package()`, the rest before the targets they borrow from |
| `package_report` | nothing | everything, for the duration of `write_report()` | |

Rules the code keeps:

- **Moves leave an empty value.** Every `free_*()` resets its struct to `{0}`, like `Option::take()`, so a second free or a use after free finds an empty value instead of a dangling pointer. Failed constructors (`split_file()`, `load_references()`, `list_dir()`) leave their output empty.
- **Ownership transfers are explicit.** `add_file()` moves the path copy and the `chunk_list` into the list. `drop_repeats()` hands its `extra_groups` array to the reference set through an out-parameter and clears its local pointer before the shared cleanup.
- **Pinned values.** `compressor` points into itself (`filters[0].options == &options`) and Win32 `thread_handle` is passed to `CreateThread()` by address, so neither may be moved after it is initialised. Both live in a heap array that is never reallocated while in use (the workers, and the pool's thread array). This is documented on `compressor_init()` and `thread_start()`.
- **No mutable globals.** The de-duplication sort used to pass data to its `qsort()` comparator through a file-scope pointer (a `static mut`). Each sort key now carries a borrowed pointer to its chunk instead.
- **Borrows end with their owner.** Each pool thread clears its worker's pointer to the stack-allocated `pass` as soon as its part of the job ends (`run_body()`), and `pool_run()` returns only after every thread has done so. No struct holds a reference that outlives its referent.

## Threads

The threads are started once, in `load_references()`, and kept in a pool until `free_references()`. Every job is still a scoped spawn: `pool_run()` posts the job, wakes all threads and returns only after each has finished it, so every borrow a thread takes ends before `pool_run()` returns. There are two kinds of job:

- **A pass over the references** (`run_pass()`): caching C(x), building digests, finding each digest value's slot in the index, or scoring one target chunk's candidates. Threads claim blocks with an atomic `fetch_add`: 64 references, or 16 candidates when scoring.
- **A batch of target chunks** (`score_chunks()`): each thread claims whole chunks with an atomic `fetch_add` and ranks and scores each one alone with its own worker.

Rules:

- **Shared, read-only:** the reference chunks and their C(x), `extra_groups`, the LZJD index and `digest_len`, the target chunks, the pass or batch settings, and during a pass the lead worker's candidate `subset`.
- **Exclusive per thread (`&mut`):** the worker's own `compressor`, `lzjd_builder`, `lzjd_query`, `subset`, `best` and `group_best`. Pool thread `i` only ever uses worker `i`.
- **Disjoint writes:** each slot is written only by the thread that claimed it: `refs[i].csize` while C(x) is cached, a reference's digest block and `digest_len[i]` while digests are built, the reference's slots while the index is built, and `out[i]`, `seconds[i]` and group row `i` for a chunk of a batch. This is the `chunks_mut()` pattern. Packing the digests, sorting the distinct values and filling the posting lists happen on the main thread between passes.
- **Synchronisation:** the pool's mutex and two condition variables, which order each job's writes before `pool_run()` returns, plus `atomic_size_t next` and `atomic_int failed` inside a job.
- **Determinism:** ties keep the reference that comes first, inside a thread and when the threads' results are merged. The index returns the same candidates in the same order as a full sort. A chunk scored alone and a chunk split across threads give the same result, so reports are identical for any thread count and batch size.

## Checks run

All runs use the benign npm test corpus (8 reference packages, 8 target packages including broken UTF-8, an empty file and a non-ASCII path), every error path of the command line, and a v1 subset with cross-group duplicates.

| Tool | Build | Result |
|---|---|---|
| AddressSanitizer + UndefinedBehaviorSanitizer (Linux, GCC 15.2) | `-O1 -g -fsanitize=address,undefined -fno-sanitize-recover=all` with leak detection | 0 reports across 31 command lines (normal, edge and error cases, prefilter on and off, `-p 1` to more candidates than references) plus a `-k 256` run on the v1 subset; the LZJD and report test harnesses also run under both |
| ThreadSanitizer | `-fsanitize=thread`, 4 and 8 threads | 0 data races |
| Valgrind memcheck 3.26 | `-O0 -g`, `--leak-check=full --errors-for-leak-kinds=all --track-origins=yes` | 0 errors, 0 bytes leaked (not even still-reachable), also on the failure path |
| Valgrind Helgrind and DRD | 4 threads | 0 reports |
| UBSan, Windows (zig/clang) | `-fsanitize=undefined -fsanitize-trap=undefined` | no traps across the corpus and edge cases |
| GCC `-fanalyzer` | static | 2 distinct reports, both false positives (below) |
| cppcheck 2.19 | `--enable=warning,style,performance,portability --inconclusive` | 2 false positives (below); one valid style finding fixed |
| Strict warnings | `-Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wcast-qual -Wformat=2 -Wnull-dereference` | 0 warnings |
| Output identity | release vs ASan build; Linux 1 vs 4 threads vs Windows 8 threads, with the prefilter on and off | byte-identical reports |
| De-duplication exactness | the same v1 subset with and without de-duplication, `-k 256` | all 1,536 per-group minimums equal |

### Rerun after the thread pool and the inverted LZJD index (2026-10-26)

The pool, the batch scoring and the index changed how threads share memory, so the dynamic checks were run again on the new code. The runs used the test corpus, every `install_scripts_test` JSON edge case, and 80 v1 detailed-test packages against a v1 subset (code-shape groups starting with `0`: 4,553 distinct chunks). They covered batch mode (`-j 4 -k 8`), split mode (`-j 8`, one package), `-p 1`, `-p 0`, `-p 1000000`, a missing package and a missing reference folder.

| Tool | Result |
|---|---|
| AddressSanitizer + UndefinedBehaviorSanitizer with leak detection (GCC, `-O1 -g`) | 0 reports in 11 runs |
| ThreadSanitizer, 2 to 8 threads | 0 data races in 11 runs |
| Valgrind Helgrind, 4 threads, `-O0 -g` | 0 errors |
| Valgrind memcheck, `--leak-check=full --errors-for-leak-kinds=all` | 0 errors, 0 bytes leaked |
| Strict warnings `-Wall -Wextra -Wpedantic -Wshadow` (GCC) and the zig Windows build | 0 warnings |
| Output identity: batch mode against split mode, 195 v1 detailed-test packages, `-k 5` | 195 of 195 reports identical apart from `seconds` |
| Output identity: new build against the 1 MiB, thread-per-pass, full-comparison build, 195 packages, `-k 32` | 195 of 195 reports identical apart from `seconds` |

### Bugs the tools found and that were fixed

- `list_dir()` called `qsort(NULL, 0, ...)` on an empty directory, which is undefined behaviour (UBSan). It now sorts only when there are at least two entries. `lzjd_digest()` had the same path on empty input; it was caught in review before its first run.
- The comparator global and the dangling `pass` pointer described above (found in the ownership review).
- De-duplication first dropped repeated chunks without remembering which other groups held them, which made `-k` group minimums too high. Each kept chunk now records every group that held a copy, and the exactness check above proves it.

### Reviewed false positives

- `-fanalyzer`, `load_references()`: "leak of `malloc(group_count * 8)`". The array is stored in `set->workers[i].group_best` and freed by `free_references()`; Valgrind confirms no leak.
- `-fanalyzer`, `load_references()`: "use of uninitialized value" for `file_group[i]`. `assign_names()` writes `file_id[i]` for every file before that line, and when it fails `load_references()` returns before reaching it; the analyser does not follow the function-pointer call. Valgrind's `--track-origins` reports nothing.
- cppcheck, `add_file()`: "memory leak: copy". The string is moved into `list->items[...]` and freed by `free_files()`.
- cppcheck, `compresser.c`: "undefined function-like macro `UINT32_C`". cppcheck was not given the system headers; the code compiles cleanly with every compiler.
