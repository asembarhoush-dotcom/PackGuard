# Memory safety and ownership

The scanner is C, but it follows Rust's ownership and borrowing rules by convention: every allocation has exactly one owner, borrows never outlive their owner, and no memory is mutated by one thread while another can see it. This page records the model and how it was checked.

## Ownership model

| Owner | Owns | Borrows handed out | Released by |
|---|---|---|---|
| `chunk_list` | the file buffer and the `file_chunk` array | `file_chunk.data` points into the buffer | `free_chunks()` |
| `loaded_file` / `file_list` | the path string and its `chunk_list`; the item array | | `free_files()` |
| `reference_set` | `files`, `refs`, `group_names`, `package_names`, `file_package`, `extra_groups`, the LZJD `digests` with `digest_first`/`digest_len`, the ranking buffers `ranks` and `subset`, and `workers` (each worker owns its `compressor`, `group_best` and `lzjd_builder`) | `ref_chunk.chunk` borrows from `files`; group and package names are lent to reports | `free_references()` |
| `lzjd_builder` | the phrase hash set and hash list, grown on demand and reused | | `lzjd_builder_free()` |
| `compressor` | the liblzma encoder state | `compressed_size_given()` borrows `dict` only for the call and clears `preset_dict` before returning | `compressor_free()` |
| `list_dir()` caller | the returned name array | | `free_names()` |
| `scan_package()` | target files, scores, report rows, near lists, matched-package list | report rows borrow target text, paths, group and package names | freed before the targets they borrow from |
| `package_report` | nothing | everything, for the duration of `write_report()` | |

Rules the code keeps:

- **Moves leave an empty value.** Every `free_*()` resets its struct to `{0}`, like `Option::take()`, so a second free or a use after free finds an empty value instead of a dangling pointer. Failed constructors (`split_file()`, `load_references()`, `list_dir()`) leave their output empty.
- **Ownership transfers are explicit.** `add_file()` moves the path copy and the `chunk_list` into the list. `drop_repeats()` hands its `extra_groups` array to the reference set through an out-parameter and clears its local pointer before the shared cleanup.
- **Pinned values.** `compressor` points into itself (`filters[0].options == &options`) and Win32 `thread_handle` is passed to `CreateThread()` by address, so neither may be moved after it is initialised. Both live in a heap array that is never reallocated while in use. This is documented on `compressor_init()` and `thread_start()`.
- **No mutable globals.** The de-duplication sort used to pass data to its `qsort()` comparator through a file-scope pointer (a `static mut`). Each sort key now carries a borrowed pointer to its chunk instead.
- **Borrows end with their owner.** `run_pass()` clears every worker's pointer to the stack-allocated `pass` once the threads are joined, so no struct holds a reference that outlives its referent.

## Threads

A scoring pass is a scoped thread spawn: `run_pass()` starts one thread per worker and joins them all before returning, so every borrow a thread takes ends at the join.

- **Shared, read-only:** the reference chunks, the target chunk and its digest, `extra_groups`, the LZJD digests during ranking, the candidate `subset` during scoring, the pass settings.
- **Exclusive per thread (`&mut`):** the worker's own `compressor`, `lzjd_builder`, `best` and `group_best`. No two threads ever touch the same worker.
- **Disjoint writes:** threads claim blocks of 64 references with an atomic `fetch_add`, and each per-reference slot is written by exactly the thread that claimed it: `refs[i].csize` while C(x) is cached, `digests[i * 1024 ...]` and `digest_len[i]` while digests are built, `ranks[i]` while references are ranked. This is the `chunks_mut()` pattern. Packing the digests, sorting `ranks` and filling `subset` happen on the main thread between passes.
- **Synchronisation:** only `atomic_size_t next` and `atomic_int failed`. Results are read by the main thread after `join`, which orders them.
- **Determinism:** ties keep the reference that comes first, both inside a thread and when the threads' results are merged, so reports are identical for any thread count.

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

### Bugs the tools found and that were fixed

- `list_dir()` called `qsort(NULL, 0, ...)` on an empty directory, which is undefined behaviour (UBSan). It now sorts only when there are at least two entries. `lzjd_digest()` had the same path on empty input; it was caught in review before its first run.
- The comparator global and the dangling `pass` pointer described above (found in the ownership review).
- De-duplication first dropped repeated chunks without remembering which other groups held them, which made `-k` group minimums too high. Each kept chunk now records every group that held a copy, and the exactness check above proves it.

### Reviewed false positives

- `-fanalyzer`, `load_references()`: "leak of `malloc(group_count * 8)`". The array is stored in `set->workers[i].group_best` and freed by `free_references()`; Valgrind confirms no leak.
- `-fanalyzer`, `load_references()`: "use of uninitialized value" for `file_group[i]`. `assign_names()` writes `file_id[i]` for every file before that line, and when it fails `load_references()` returns before reaching it; the analyser does not follow the function-pointer call. Valgrind's `--track-origins` reports nothing.- cppcheck, `add_file()`: "memory leak: copy". The string is moved into `list->items[...]` and freed by `free_files()`.
- cppcheck, `compresser.c`: "undefined function-like macro `UINT32_C`". cppcheck was not given the system headers; the code compiles cleanly with every compiler.
