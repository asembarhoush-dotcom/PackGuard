# CLAUDE.md

Rules for working in the PackGuard repository.

## Comments in code

The only comments allowed are purpose comments placed directly above:

- a **function** declaration or definition: may span multiple lines;
- a **struct**: exactly one line.

No other comments of any kind:

- no trailing comments on fields, macros, array entries or statements;
- no comments inside function bodies;
- no file header comments;
- no `#endif` labels;
- no comments in config files such as `.dockerignore` or `Makefile`.

For public functions, put the comment on the declaration in the header. If information from a removed comment is still needed, move it into the function's comment.

```c
/*
 * Splits a file into overlapping chunks.
 * Returns 0 on success, -1 on failure.
 */
int foo(const char *path, chunk_list *out);

/* One window of a file. */
typedef struct {
    size_t offset;
    size_t length;
} file_chunk;
```

## Test files

- Test inputs for a function go in `tests/<functionname>_test/`, using the exact C function name plus `_test`. For example, `split_file()` uses `tests/split_file_test/`.
- Keep the original files and the generated ones in that folder. Don't delete them after a test run, and don't add them to `.gitignore`.

## Dataset

- `dataset_index.md` records where every dataset lives, how it was filtered and what is still missing; update it whenever a dataset changes.
- The v1 malware set is committed as 16 encrypted zips, `data/v1/malware_js_0.zip` to `malware_js_f.zip` (password `infected`), split by the first hex character of each code-shape folder. Inside are 5,904 DataDog npm `malicious_intent` packages as plain `.js` files with no `package.json`. These are live malware.
- Never commit extracted samples, only encrypted zips under GitHub's 100 MB file limit. Extract them only inside WSL: on Windows, antivirus quarantines the files and many paths exceed 260 characters.
- `data/` is stored byte for byte (`-text` in `.gitattributes`) so line-ending conversion never changes NCD results.
- v1 uses static ratios: at most 3 packages per code shape and at most 3 versions per package name, earliest published first. Only sample zips of 1 MiB or less were used.
- v1 goes for speed with the fewest features and static ratios; selectors and tuned ratios come in later versions, judged on accuracy vs time.
- Handle malware only inside WSL, decrypt archives in memory, and never run `node`, `npm` or Windows Script Host on a sample.
- Download DataDog samples as individual files from `raw.githubusercontent.com` with parallel connections; a git clone of that repository runs at about 180 KiB/s.
- v2 candidates: `compromised_lib` samples (need a diff against the clean version), zips over 1 MiB, install-script-only packages, Backstabber's Knife Collection and MalwareBench (access on request), and benign npm packages.

## Commits and pull requests

- Never credit Claude:
  - no `Co-Authored-By: Claude ...` trailer in commit messages;
  - no "Generated with Claude Code" line in PR descriptions;
  - no other mention of Claude as author, opener or contributor.
- Commits use the repository owner's git identity only.
