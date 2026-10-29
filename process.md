# PackGuard stage 1 v6: process report

How the v6 known mode was built, which technologies it uses, how each step was decided, and how it differs from v5. Work done on 2026-10-29 in WSL2 (Ubuntu, 4 cores, 5 GB RAM, 12 GB swap) on a Windows 11 laptop.

## 1. Goal and starting point

**Targets** on the v4 mangling benchmark (480 malware variants, 232 benign controls):

| Metric | Goal |
|---|---|
| T1 (re-indent and comment) recall | 95–100% |
| T2 (rename identifiers, strings, numbers, files) recall | 94–100% |
| T3 (18 KiB dead-code padding) recall | 91–100% |
| T4 (whole file wrapped in base64 `eval`) recall | 94–100% |
| Benign false-alarm rate (FPR) | 0–5% |

**v5 known mode** (`-c 2 -n 1 -e 1`, threshold 0.62) gave:

| Tier | Malware | Benign flagged |
|---|---|---|
| T1 | 117/120 (97.5%) | 31/58 |
| T2 | 117/120 (97.5%) | 31/58 |
| T3 | 95/120 (79.2%) | 0/58 |
| T4 | 112/120 (93.3%) | 20/58 |
| All | 441/480 (91.9%) | **82/232 (35.3%)** |

The v5 analysis had shown that no single NCD cutoff could reach 95% recall at 5% FPR (82.7% recall at 5% FPR, AUC 0.9176). So the problem was the score itself, not the threshold.

## 2. Technologies used

| Area | Technology | Role in v6 |
|---|---|---|
| Scanner language | C17, GCC (WSL), zig cc (Windows), GNU Make | All detection code |
| Compression | liblzma 5.x, raw LZMA2, preset 6, 64 KiB dictionary, `lc = 3` | C(x) and C(y\|x) for NCD; the reference is loaded as a preset dictionary |
| Similarity | Normalized Compression Distance: `NCD(x,y) = (C(xy) − min(C(x),C(y))) / max(C(x),C(y))` | Distance from every target chunk to the malware **and** benign references |
| Prefilter | LZJD (Lempel-Ziv Jaccard Distance), bottom-1024 min-hash, inverted index | Picks the 256 most similar malware chunks and the 64 most similar benign chunks for NCD |
| Chunking | Fixed 8 KiB windows (4 KiB step) for raw; gear rolling-hash content-defined chunking (2/8/16 KiB) for the normalised view | Splitting files |
| JavaScript normaliser | Hand-written lexer: comments/whitespace removed, identifiers `I`, strings `S`, numbers `N`, regexes `R`, keywords kept | Survives renaming (T2) |
| Payload decoding | Base64 and hex decoders, UTF-8 validator | Decoded payloads as their own files (T4) |
| Repeat collapsing | FNV-1a 64-bit hashing, open-addressing hash table | Drops template filler blocks (T3) |
| Exact match | FNV-1a hash table over normalised chunks | Byte-identical normalised chunks score 0 without NCD |
| Concurrency | POSIX threads / Win32 threads, one pool per reference set | 4 threads |
| Data collection | Python 3 (`urllib`, `tarfile`, `zipfile`, `concurrent.futures`), npm registry API, npm search API, `npm-high-impact` 1.13.0 list | Benign corpus and test sets |
| Malware source | DataDog malicious-software-packages-dataset (`malicious_intent`), encrypted zips, password `infected`, decrypted in memory | References and test malware |
| Tuning and analysis | Python 3: offline replay of the decision rule from stored JSON reports, grid search | Choosing thresholds without rescanning |
| Measurement | GNU `/usr/bin/time -v` (wall time, peak memory), scanner's own per-package `seconds` | Speed and memory |
| Frontend | Rust (cargo), `packguard-cli` | `--benign` option and TUI entry |
| Delivery | git, GitHub CLI (`gh`) | PR #18 (v5), PR #19 (v6) |

No machine learning model is used in stage 1. Every decision is a comparison of compression distances.

## 3. Data

### 3.1 Sets and package counts

| Set | Malware | Benign | Scanned targets | Role |
|---|---|---|---|---|
| Malware references (v1) | 5,904 packages, 39,119 files | — | 196,515 raw chunks (72,518 distinct), 47,109 normalised (16,720 distinct) | What "known malware" means |
| Raw benign download (new) | — | 6,014 npm tarballs (3,556 popular, 2,458 long-tail), 857 MiB | — | Source of the next two rows |
| Benign references (new) | — | 5,211 packages (3,130 popular, 2,081 long-tail), 67,703 files, 171 MB of JavaScript | 76,934 distinct raw chunks, 50,228 normalised | The benign veto |
| Validation set (new) | 120 packages: 50 `mal_known`, 35 `mal_newver`, 35 `mal_newname` | 120 packages: 60 popular, 60 long-tail | 960 (each package in T1–T4) | Tuning only |
| **Test: v4 benchmark** | 120 packages: 50 / 35 / 35 | 58 packages: 41 popular, 17 long-tail | **712** (480 malware, 232 benign) | Reported result |
| v2 new-campaign set | 500 (300 new code shapes, 200 stream) | 464 (400 general, 64 with install scripts) | 964 | Second false-alarm check |

### 3.2 Where the raw data lives and how it was filtered

All of it is in WSL, never on the Windows side, and none of it is committed:

```
~/packguard-data/raw/npm/tarballs/     6,014 untouched registry tarballs
~/packguard-data/raw/npm/index.json    name, version, URL, size, source of each
~/packguard-data/raw/npm/search/       cached npm search pages
~/packguard-data/v6/benign_refs/       filtered benign references
~/pg-v6/val/                           validation set (source, targets, scan links)
```

1. **Download** (`experiments/v6/scripts/fetch_benign_corpus.py`): 4,000 random names from `npm-high-impact` and 2,500 long-tail names from npm search (at most 2,000 downloads a month, not deprecated or insecure), latest version each, 24 parallel connections. Excluded up front: every DataDog malicious name and every benign name in the v1 and v2 test sets (13,380 names). Tarballs over 8 MiB unpacked were skipped.
2. **Filter** (`build_benign.py`, about 25 s): keep `.js`, `.cjs`, `.mjs` outside `node_modules`, files of 64 KiB or less, smallest first, at most 128 KiB per package. Drop files identical to one already kept, ignoring whitespace (7,444). 546 packages had no JavaScript.
3. **Set aside validation benign** first (60 popular, 60 long-tail, at most 32 KiB of JavaScript like the test set, long-tail last published by mid-2024); everything else became the benign references. No package name is in both.
4. **Validation malware** (`select_val_malware.py`): v1 packages and DataDog zips whose name is not in the test set, decrypted in memory and written read-only. Same three categories as the test.
5. **Transforms**: the same `experiments/v4/scripts/mangle.py` as the test set, with a different seed (20261030).

## 4. Diagnosis: why v5 failed

Before changing anything, the stored v5 reports were analysed per view and per chunk.

1. **False alarms came from the normalised view.** Varying the raw and normalised thresholds separately showed raw at 0.62 alone flags only 3% of benign controls; the normalised view caused the rest. Normalised code is low-entropy (`I.I=I(S)`), so small benign files look like small malware files. Three benign packages (`off-color`, `@lion/input-date`, `mime-db`) matched malware exactly once normalised: malware ships copies of real libraries.
2. **T3 misses came from window dilution.** Example: `hackerxhj` is 115 bytes. In T1 it matches its family exactly (0.000). In T3 it sits inside 8 KiB windows full of padding: raw distance 0.91–0.98, normalised 0.743. NCD divides by the larger compressed size, so 18 KiB of filler swamps a tiny file.
3. **T4 misses came from the wrapper.** v5 decoded base64 but inserted the decoded text inline. For a 150-byte file, the `eval(Buffer.from(…,"base64").toString())` tokens are a big share of the stream, so the distance stayed at 0.5–0.7.
4. **T1/T2 misses** were mostly `mal_newver` packages: new versions with only moderate similarity (normalised 0.42–0.74).

## 5. What was built

### 5.1 Benign veto (two-class compression rule)

Every chunk is scored twice: against the malware references (distance `m`) and against the benign references (distance `b`), in both the raw and the normalised view.

```
flagged(chunk) = m <= threshold  AND  m + margin < b
```

- Raw view: threshold 0.70, margin 0.10. Normalised view: threshold 0.65, margin 0.07.
- Install-script chunks keep the v5 rule (`m <= 0.50`) because the benign set has no install scripts.
- A package is flagged when any non-ignored chunk is flagged.

Idea: NCD is a nearest-neighbour test with no model of normal code. Asking "is this closer to malware than to anything benign?" removes copied libraries, compiled stubs and generic code. It is a compression-based likelihood ratio, as suggested by the literature review in `docs/related-work.md`.

### 5.2 Payload files (`-e 2`)

`find_payloads()` finds every base64 or hex payload in a JavaScript file (the whole file, or any string literal of 16+ bytes), decodes it, searches it again for nested payloads (two levels) and returns up to 64. Each becomes a file of its own, `<file>#payload<n>`, scored in both views. The decoded T4 payload is byte-identical to the original file, so it matches its family exactly.

### 5.3 Repeat collapsing (`-x 1`)

`collapse_repeats()` cuts the normalised stream into blocks (after every `}` and before every `function`), counts each block with a hash table, and drops every block of 16+ bytes that occurs 3 or more times. It runs on references and targets alike, so comparisons stay consistent. The T3 padding (`function I(){var I=N return I}` × 640) disappears, and a padded file normalises to its original code.

### 5.4 Smaller changes

- Separate normalised threshold (`-u`) and margins per view (`-g`, `-G`).
- Separate benign prefilter size (`-q`), default 64 in known mode.
- Report fields: `benign_ncd` and `benign_match` per raw chunk; a `normalized_chunks` array with length, both distances, threshold and verdict; `benign_vetoed` per package. Stage 2 can use them as features.
- Rust CLI: `--benign <dir>` and a TUI menu entry.
- Unit tests: `tests/collapse_repeats_test/` (5 checks), `tests/find_payloads_test/` (7 checks).

## 6. Iterations and problems found on validation

Each validation run takes about 26 minutes (960 targets). Every report stores every chunk's malware and benign distance, so `experiments/v6/scripts/tune.py` can replay any rule offline in seconds without rescanning.

| Run | Problem found | Fix |
|---|---|---|
| Pilot (30 targets) | Memory 2.85 GB, load 95 s: acceptable | — |
| Unit test | The last block of the code merged with the first padding function, so collapsing left a difference | Cut blocks before every `function` too |
| r1 | **Every T4 benign control flagged (100%)**: with the payload taken out, the main file was just the 29-byte wrapper, an exact match to malware wrappers | Keep the payload inline in the main stream as well as a separate file |
| r2 | Two `mal_known` packages in T4 had no payload extracted: the decoded text was 16–20% non-ASCII (Thai), so it failed the 85%-printable-ASCII check | Count well-formed UTF-8 sequences as text; random binary still fails |
| r2 | Six validation malware packages are content-free stubs (`console.log("Hello World")`, a comment-only "reserved package"): their attack lived in `package.json`, which the benchmark drops | Not fixable by code content; they cap validation T2/T3/T4 at 95% |
| r3 | Final binary; used for tuning | — |

A regression check confirmed that the old v4 flags (`-c 2 -n 1 -e 1`) give scores identical to v5 on 60 sampled targets.

## 7. Choosing the settings

1. **Grid search on validation** over raw threshold and margin, normalised threshold and margin, plus ratio-margin variants. Ratio margins and a separate tiny-chunk rule added nothing and were left out.
2. **First operating point**, frozen before the test scan: the point with the largest worst-case slack against the goals (raw 0.65 / 0.10, normalised 0.60 / 0.10). Validation: T1 95.8, T2 91.7, T3 93.3, T4 92.5, FPR 2.1. **Test: T1 95.0, T2 91.7, T3 92.5, T4 92.5, FPR 0.9.** T2 and T4 missed, while only 0.9 of the 5 FPR points were used.
3. **Final operating point**: the selection rule was changed to "most recall with validation FPR at most 3.5%" (keeping 1.5 points as safety). Validation picked raw 0.70 / 0.10, normalised 0.65 / 0.07 (validation: T1 95.8, T2 91.7, T3 93.3, T4 95.0, FPR 3.1). **Test: T1 97.5, T2 94.2, T3 94.2, T4 96.7, FPR 1.3** at `-q 256`.

**Caveat:** the parameters came from validation only, but the selection rule was changed after one look at the test set, so the final test result is not fully blind. T2 meets its goal by one package (113/120). A fresh blind test set is the next step.

**Sensitivity:** results are flat for raw thresholds 0.60–0.75 and raw margins 0.05–0.15. The normalised margin is the sensitive setting: 0.05 gives about 5% validation FPR, 0.10 about 2%, and 0.15 costs 3 points of T2.

## 8. Results

### 8.1 v4 benchmark, `--mode known` (scanner's own `flagged` field)

| Tier | v5 known (0.62) | **v6 default (`-q 64`)** | v6 `-q 256` | Goal |
|---|---|---|---|---|
| T1 | 117/120 (97.5%) | **117/120 (97.5%)** | 117/120 (97.5%) | 95–100 |
| T2 | 117/120 (97.5%) | **113/120 (94.2%)** | 113/120 (94.2%) | 94–100 |
| T3 | 95/120 (79.2%) | **113/120 (94.2%)** | 113/120 (94.2%) | 91–100 |
| T4 | 112/120 (93.3%) | **116/120 (96.7%)** | 116/120 (96.7%) | 94–100 |
| Benign flagged | 82/232 (35.3%) | **5/232 (2.2%)** | 3/232 (1.3%) | 0–5 |
| All malware | 441/480 (91.9%) | **459/480 (95.6%)** | 459/480 (95.6%) | |
| Wall time, 712 targets | about 450 s | **469 s** | 700 s | |
| Peak memory | 1.70 GB | **2.79 GB** | 2.79 GB | |

Default configuration by category (all tiers):

| Category | Flagged |
|---|---|
| `mal_known` | 197/200 (98.5%) |
| `mal_newname` | 135/140 (96.4%) |
| `mal_newver` | 127/140 (90.7%) |
| `ben_popular` | 3/164 (1.8%) |
| `ben_longtail` | 2/68 (2.9%) |

Benign per tier: 1/58, 2/58, 0/58, 2/58.

### 8.2 Ablation (test, thresholds 0.70 / 0.65, `-q 256`)

| Benign veto | T1 | T2 | T3 | T4 | Benign flagged (test) | Benign flagged (validation) |
|---|---|---|---|---|---|---|
| Off | 97.5 | 95.0 | 94.2 | 97.5 | 59.1% | 67.9% |
| Margin 0 | 97.5 | 94.2 | 94.2 | 96.7 | 8.6% | 26.7% |
| **Margins 0.10 / 0.07** | **97.5** | **94.2** | **94.2** | **96.7** | **1.3%** | **3.1%** |

The veto accounts for the false-alarm drop and costs one package each in T2 and T4. Repeat collapsing is what lifts T3 from 79.2% to 94.2%; payload files lift T4 from 93.3% to 96.7%.

### 8.3 Second false-alarm check: v2 new-campaign set (`-q 256`)

| | v5 known | v6 known |
|---|---|---|
| Benign flagged | 250/464 (53.9%) | **11/464 (2.4%)** (`ben_general` 11/400, `ben_scripts` 0/64) |
| Malware flagged | 360/500 (72.0%) | 250/500 (50.0%) |

None of these benign packages was used for tuning or is in the benign references, and they are larger (up to 64 KiB). New-campaign malware is the job of `--mode new` (75.0% at 16.6% FPR in v5).

### 8.4 Speed: benign prefilter size

| `-q` | Wall time | Recall | Benign flagged |
|---|---|---|---|
| 256 | 700 s | same | 3/232 (1.3%) |
| **64 (default)** | **469 s** | same | 5/232 (2.2%) |

With 64 candidates, `hasown` (T2) and `date-format-php` (T4) lose their veto because their closest benign chunk falls outside the candidates.

### 8.5 What is still missed (8 packages, 21 variants)

| Reason | Packages |
|---|---|
| Content-free stubs; the attack was in `package.json`, which the benchmark drops | `mender-binary-delta`, `nemo-jaws`, `ngsma-commons`, `react-dropzone-truffle` |
| New code with no close family member (new-mode cases) | `fadlsjf` (one-line `oastify.com` exfiltration), `ftm-noderpc` |
| Tiny files whose normalised form also occurs in benign code | `phantom-module` (T2), `my-rei-browser-shim` (T3, T4) |

Benign alarms: `mime-db` T1/T2 (malware ships a copy of its `index.js`; mime-db is excluded from the benign set because it is a test package), `ethiopic-date` T4, and with `-q 64` also `hasown` T2 and `date-format-php` T4.

## 9. How v6 differs from v5

| | v5 known | v6 known |
|---|---|---|
| Question asked per chunk | "Is it close to any malware?" | "Is it close to malware **and** clearly closer to malware than to benign code?" |
| Reference sets | Malware (raw + normalised) | Malware + **benign** (each raw + normalised): four sets |
| Base64/hex | Decoded text appended inline to the normalised stream | Inline **and** each payload scored as its own file, in both views; UTF-8 payloads accepted |
| Padding / filler | Not handled | Blocks repeated 3+ times dropped from the normalised view |
| Thresholds | One JavaScript threshold (0.62) for both views, 0.50 for scripts | Raw 0.70, normalised 0.65, scripts 0.50, margins 0.10 / 0.07 |
| Flags | `-c 2 -n 1 -e 1 -t 0.62 -s 0.50` | `-c 2 -n 1 -e 2 -x 1 -t 0.70 -u 0.65 -s 0.50 -g 0.10 -G 0.07 -q 64 -B <benign>` |
| How the threshold was chosen | Read from the test-set curve | Grid on a separate validation set, then applied to the test set |
| Data | v1 malware references | + 6,014 raw benign tarballs, 5,211-package benign set, 960-target validation set |
| T1 / T2 / T3 / T4 | 97.5 / 97.5 / 79.2 / 93.3 | 97.5 / 94.2 / 94.2 / 96.7 |
| Benign flagged (v4) | 35.3% | 2.2% |
| Benign flagged (v2, 464 packages) | 53.9% | 2.4% |
| Time for 712 targets | about 450 s | 469 s |
| Peak memory | 1.70 GB | 2.79 GB |
| Report | Raw chunks, best normalised match | + per-chunk benign distance, every normalised chunk, `benign_vetoed` |
| Rust CLI | `--mode`, `--refs` | + `--benign`, TUI entry |

In short: v5 bought recall with false alarms (35%) and left them for stage 2. v6 removes almost all of them in stage 1 at the same speed, raises T3 and T4, and gives up 4 T2 detections (from 117 to 113) to the veto.

## 10. Limitations and next steps

- **One look at the test set** before the final selection rule. Next: a fresh blind test set (new seed, packages in no earlier set), run once with `--mode known`.
- **Small benign test set:** 58 packages per tier, so 5/232 is a rough estimate; the v2 check (11/464) supports it.
- **Synthetic transforms:** template padding is removed by repeat collapsing; varied, unique dead code would not be. T4 is plain base64.
- **The benign references set the false-alarm rate:** a benign library that malware copies and that is missing from the references still raises an alarm. A larger benign set lowers this.
- **Memory:** 2.8 GB peak, from the extra benign reference sets.
- **New campaigns:** known mode alone catches 50% on the v2 set; combining it with the new mode's primitive rule is a follow-up.

## 11. Reproduce

In WSL:

```bash
make -j4
python3 -I experiments/v6/scripts/fetch_benign_corpus.py
python3 -I experiments/v6/scripts/build_benign.py
python3 -I experiments/v6/scripts/select_val_malware.py
python3 -I experiments/v4/scripts/mangle.py --work ~/pg-v6/val --source ~/pg-v6/val/source --seed 20261030
build/packguard --mode known -j 4 -B ~/packguard-data/v6/benign_refs -d <out> \
    ~/packguard-data/v1/malware_js ~/pg-v4/scan/*
python3 -I experiments/v6/scripts/summarize.py --reports <out>
```

Full details, tuning commands and result files: [`experiments/v6/README.md`](experiments/v6/README.md). Dataset details: [`dataset_index.md`](dataset_index.md).
