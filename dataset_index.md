# Dataset index

Where the PackGuard datasets live.

## v1 malware set

| | |
|---|---|
| Location | `data/v1/malware_js_0.zip` to `malware_js_f.zip` in this repository: 16 zips, 123.8 MiB |
| Extract | Inside WSL only: `unzip -P infected data/v1/malware_js_0.zip -d <dir>`. On Windows, antivirus quarantines the files and many paths exceed 260 characters. |
| Layout | `<code-shape-id>/<package>@<version>/<file>.js`, in the zip named after the first character of `<code-shape-id>` |
| Size | 5,904 packages, 39,119 JavaScript files, about 708 MiB extracted |
| Built | 2026-10-23 |

### Source

- DataDog malicious-software-packages-dataset, `samples/npm/malicious_intent/`.
- Only sample zips of 1 MiB or less: 23,825 of 25,460. The 1,635 larger zips (about 21.6 GB) were skipped.

### Filtering (static ratios)

1. Packages whose JavaScript is identical to an already kept one, ignoring whitespace, are dropped (5,342).
2. At most 3 packages per code shape: the code with strings, numbers, comments and `_0x…` obfuscator names blanked out (5,089 dropped).
3. At most 3 versions per package name (3,632 dropped).
4. The earliest published samples are kept first.

Also dropped: 2,970 packages whose malware lives only in a `package.json` install script, 883 with no JavaScript, and 5 unreadable zips (`marked-cs`, `marked-ps`).

### Safety

- Only `.js`, `.cjs` and `.mjs` files are kept, outside `node_modules`.
- No `package.json` is kept, so npm lifecycle scripts cannot run.
- The zips are encrypted (ZipCrypto, password `infected`, the same convention as DataDog), so antivirus and accidental runs can't reach the files.
- No file has an execute bit, and git stores the zips byte for byte (`-text`).
- The files are real malware. Read them as text only and never run them with `node`, `npm` or Windows Script Host.

### Size profile

- Median package: about 2.9 KB of JavaScript.
- 4,538 packages (77%) have 16 KiB or less, 13.7 MiB in total. A few large packages hold most of the bytes.

### Kept packages by publish year

| Year | Packages |
|---|---|
| 2018–2022 | 11 |
| 2024 | 515 |
| 2025 | 3,371 |
| 2026 | 2,007 |

### Integrity

On 2026-10-24 an extracted copy in WSL (`~/packguard-data/v1/malware_js/`) was compared with the 16 zips by CRC-32 and size: all 39,119 files match, none missing or extra. The v1 detailed test below used that copy.

### Distinct chunks

Split into the v1 chunks (files over 16 KiB as 8 KiB windows every 4 KiB), the set has 190,939 chunks but only 69,249 distinct ones. The scanner scores each distinct chunk once.

## v1 detailed test set

Built 2026-10-24 to measure v1 stage 1 on malware and benign packages it has not memorised. Results and analysis: [`experiments/v1/`](experiments/v1/README.md).

| | |
|---|---|
| Location | WSL only, `~/pg-detailed/targets/<category>/<package>@<version>/`, not committed (live malware). Rebuild with the scripts in `experiments/v1/scripts/`. |
| Size cap | At most 32 KiB of JavaScript per package, so the benign packages match the malware's sizes (v1 median 2.9 KB) and the run fits in a few hours |
| Malware files | Only `.js`, `.cjs` and `.mjs`, no `package.json`, decrypted in memory, written read-only, named as in v1 |
| Seeds | Python `random.Random(20261024)` for malware, `20261025` for benign, `7` for the scan order |

| Category | Packages | How it was chosen | Dropped while collecting |
|---|---|---|---|
| `mal_known` | 50 | Random v1 packages of 32 KiB or less. Scored as is (trivial: they are in v1) and with their family left out (see the analysis). | none |
| `mal_newver` | 35 | For random v1 names at the 3-version cap, one DataDog version the cap dropped (zip of 200 KB or less) | 4 without JavaScript, 9 over 32 KiB |
| `mal_newname` | 35 | Random DataDog `malicious_intent` zips (200 KB or less) whose package name is not in v1: packages v1 dropped as code-shape or exact duplicates | 5 without JavaScript, 1 over 32 KiB |
| `ben_popular` | 50 | Latest version of well-known npm packages (the list is in `fetch_benign.py`), none in the DataDog manifest | 3 over 32 KiB |
| `ben_longtail` | 25 | npm search results for 42 generic keywords, at most 2,000 downloads a month, last published 2015-01-01 to 2024-06-30, not deprecated, none in the DataDog manifest | 5 without JavaScript, 15 over 32 KiB |

For every `mal_newver` and `mal_newname` file the manifest records whether it is identical to a v1 file once whitespace is ignored (the v1 duplicate rule), so the analysis can score only the files v1 has never seen.

The benign sets are labelled benign because they are on the registry, not deprecated and not in any DataDog list; they were not audited by hand. The long-tail set is small (25) because few search results met the filters within the size cap.

## v4 mangling benchmark

| | |
|---|---|
| Location | WSL only, `~/pg-v4/targets/`, `~/pg-v4/scan/` and `~/pg-v4/reports/`; not committed (live malware) |
| Source | v1 detailed test set: 120 malware (50 `mal_known`, 35 `mal_newver`, 35 `mal_newname`) and 58 benign packages with JavaScript (41 `ben_popular`, 17 `ben_longtail`) |
| Transforms | T1 format, T2 rename identifiers/strings/numbers/files, T3 18 KiB dead-code padding, T4 whole-file base64 |
| Size | 712 targets: 480 malware variants and 232 benign controls across the four tiers |
| Built | 2026-10-27 by `experiments/v4/scripts/mangle.py` (committed) |
| Results | [`experiments/v4/`](experiments/v4/README.md) |

The original sample stays in the v1 reference set and only the transformed copy is scored, so this measures known-family robustness, not an unseen family or a new campaign. Some source packages have no JavaScript, which is why the benign set is 58 packages rather than 75. No encrypted dataset zip changed.

## v2 malware set

| | |
|---|---|
| Location | `data/v2/malware_js_0.zip` to `malware_js_f.zip` in this repository: 16 zips, 123 MiB (5.4–10.6 MiB each) |
| Extract | Inside WSL only: `unzip -P infected data/v2/malware_js_0.zip -d <dir>` |
| Layout | `<code-shape-id>/<package>@<version>/<file>`, in the zip named after the first character of `<code-shape-id>`. Files are `.js`, `.cjs`, `.mjs` and `install_scripts.txt` |
| Size | 6,500 packages in 6,500 code shapes, 38,623 files, 654 MiB of content (807 MiB on disk extracted) |
| Built | 2026-10-26 by `experiments/v2/scripts/build_dataset.py` (committed, unlike the v1 builder) |

### Source

- DataDog malicious-software-packages-dataset, `samples/npm/malicious_intent/`, downloaded 2026-10-25 by `fetch_datadog.py`: all 23,825 zips of 1 MiB or less (1.1 GiB). DataDog had added nothing since v1 was built.
- 22,907 are usable: every zip opened (v1 lost 5), and 918 hold neither JavaScript nor install scripts.

### What is new compared with v1

- **Install scripts.** Each package's root `package.json` is reduced to its `preinstall`, `install` and `postinstall` commands, one per line, stored as `install_scripts.txt`, never as `package.json`. That is the same text the scanner extracts from a target's `package.json`. Commands that only launch a local `.js` file (`node index.js`, with optional redirects, `|| true` or `exit 0`) are left out, since the file itself is kept and the command alone matches benign packages. 1,991 packages keep install scripts, and 952 of them have no JavaScript at all: v1 had to drop such packages.
- **Tuned ratio instead of v1's static one.** At most **1 package per code shape** and **3 versions per package name**, **newest published first**. This was chosen by the ratio experiment in [`experiments/v2/`](experiments/v2/README.md): more examples per shape added no detection, and newest-first raised AUC at the lowest cost.
- **Code shape** (`js_shape()` and `script_shape()`): per JavaScript file, strings, numbers, comments and `_0x…` names are blanked and whitespace is removed. Per install-script text, words longer than 10 letters or holding digits become `#`. The package shape is the hash of its sorted file shapes. This rule is finer than v1's (9,583 shapes over the usable packages), so v2's shape ids differ from v1's folder names.

### Filtering

1. Packages whose stored files are identical to an already kept one, ignoring whitespace, are dropped (8,689 of 22,907).
2. In order of publication date, newest first, a package is kept while its code shape has no kept package and its name has fewer than 3. 6,500 are kept.

### Kept packages by publish year

| Year | Packages |
|---|---|
| 2024 | 469 |
| 2025 | 3,900 |
| 2026 | 2,131 |

### Integrity

On 2026-10-26 all 16 zips passed `unzip -t` (CRC) with the password, and they hold 38,623 files, the same as the extracted copy in WSL (`~/packguard-data/v2/malware_js/`). No file is named `package.json` and none has an execute bit.

## v2 ratio test set

Built 2026-10-25 to choose the v2 ratio and to measure install scripts. Results: [`experiments/v2/`](experiments/v2/README.md).

| | |
|---|---|
| Location | WSL only, `~/pg-v2/targets/<category>/<package>@<version>/`, not committed. Rebuild with `experiments/v2/scripts/`. |
| Time split | References from malware published before 2026-04-01 (19,872 usable packages); malware tests published on or after it (3,035) |
| `mal_shape` | 300 packages: one random package from each of 300 random code shapes, at most 64 KiB stored (seed 20261025). Only 9 share a code shape with older malware. |
| `mal_stream` | 200 random packages after the cutoff, clones included (seed 20261025) |
| `ben_general` | 400 packages from the `npm-high-impact` 1.13.0 list (none in DataDog `malicious_intent`, latest version not deprecated and not a DataDog `compromised_lib` version), at most 64 KiB of JavaScript, with their `package.json`. 203 were too big and 58 had no JavaScript. |
| `ben_scripts` | 64 of 5,612 probed popular packages whose latest version has install scripts (`package.json` only) |

## Not yet collected

- DataDog `compromised_lib` samples: real libraries with injected code, need a diff against the clean version.
- The 1,635 DataDog zips over 1 MiB.
- Backstabber's Knife Collection and MalwareBench: access on request.
- MalOSS: the repository has package-name lists only; samples come from the authors.
- OpenSSF malicious-packages: reports only, used to confirm live-scan detections.
- A large benign set from the npm registry, including packages over 32 KiB. The 75 benign packages in the v1 detailed test are only enough to estimate false alarms roughly.
