# Handoff — PackGuard v5 session (2026-10-28)

## TL;DR

v5 is now a two-mode stage-1 scanner with a Rust CLI/TUI wrapper:

- **`--mode known`**: v4c2 views/chunking at JavaScript threshold **0.62**, install-script threshold **0.50**.
- **`--mode new`**: raw NCD + behavioural primitives, no normalised view, threshold **0.50**.
- Stage 2 is built and committed on `main`; stage 1 runs aggressively and stage 2 clears false alarms.
- Known-mode v4 result at 0.62: **441/480 (91.9%)** all known variants, **195/200 (97.5%)** `mal_known`, **82/232 (35.3%)** benign.
- New-mode new-campaign result at 0.50: **375/500 (75.0%)**, **77/464 (16.6%)** benign.
- The NCD-only curve is below the 95/5 target: **82.7% all-known at 5% FPR** (89.5% `mal_known`), AUC 0.9176.
- Nothing is committed. Branch: `feature/v5-stage1`.

## Branch and working tree

```
branch: feature/v5-stage1
modified: .gitignore, README.md, src/main.c, src/report.c, src/report.h, src/scanner.h
new:      src/primitives.c, src/primitives.h, tests/primitives_scan_test/,
          frontend/, experiments/v5/, docs/v4-suggestions.md,
          docs/related-work.md, docs/v5-plan.md
```

`frontend/target/` is ignored by `.gitignore`. `frontend/Cargo.lock` exists but is untracked. No commit was made.

## What was implemented

### C scanner

- `--mode known|new` presets in `src/main.c`.
  - known: `-c 2 -n 1 -e 1 -b 1`, JS threshold 0.62, script threshold 0.50, primitives off.
  - new: `-c 0 -n 0 -e 0 -b 1`, threshold 0.50, primitives on.
- `src/primitives.c/.h`: behavioural primitives for network/webhook, host/identity, environment, execution, encoding, sensitive paths, obfuscation, `eval` and decoding.
- Primitive reporting: `primitive_score`, `primitive_flagged`, `primitive_hits` in the JSON report when `--mode new` is used; package `flagged` is the OR of the NCD and primitive rules.
- Primitive tests: `tests/primitives_scan_test/` (12/12 pass).
- The reference-stub filters (content filter and size/frequency gate) were measured and **rejected** because they lost recall. Known mode keeps every normalised reference.

### Rust CLI/TUI

- `frontend/` package, binary `packguard-cli` (`frontend/target/release/packguard-cli.exe` on Windows).
- Runs the C scanner with `--mode`, reads the JSON reports, prints a ranked table.
- Options: `--mode`, `--refs`, `--scan-dir`, `--package`, `--packguard`, `--threads`, `--reports`, `--tui`.
- `--reports` keeps the stage-1 JSON for stage 2.
- `--tui` is a line-based ANSI menu (mode, refs, scan dir, scanner path, run).
- `cargo test`: 5/5; CLI integration in known/new modes and `--scan-dir` verified; TUI opens/quits.

### Build

- Linux/WSL: `make -j4` produces `build/packguard`.
- Windows: `scripts/build-windows.ps1` produces `build/packguard.exe`. In Git Bash, run it with Windows `tar` first:
  ```bash
  PATH="/c/Windows/System32:$PATH" powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows.ps1
  ```
  The xz build is cached under `build/windows/`.
- Rust: `cd frontend && cargo build --release`.

## Results

### Known/mangled mode, v4 benchmark (480 malware / 232 benign)

| Threshold | All known recall | Benign flagged | `mal_known` recall |
|---|---|---|---|
| 0.50 | 412/480 (85.8%) | 26/232 (11.2%) | 182/200 (91.0%) |
| **0.62 (current)** | **441/480 (91.9%)** | **82/232 (35.3%)** | **195/200 (97.5%)** |
| 0.70 | 454/480 (94.6%) | 129/232 (55.6%) | 195/200 (97.5%) |
| 0.72 | 457/480 (95.2%) | 137/232 (59.1%) | 195/200 (97.5%) |
| 0.75 | 469/480 (97.7%) | 174/232 (75.0%) | 198/200 (99.0%) |
| 0.80 | 478/480 (99.6%) | 220/232 (94.8%) | 200/200 (100%) |

At 0.62 per tier: T1 117/120, T2 117/120, T3 95/120, T4 112/120; benign T1 31/58, T2 31/58, T3 0/58, T4 20/58. Precision 84.3%, stage-1 accuracy 83.0%.

### Known/mangled mode on new campaigns

- At 0.62/0.50: **360/500 (72.0%)**, **250/464 (53.9%)** benign.
- At 0.50: 278/500 (55.6%), 175/464 (37.7%).

### New-campaign mode on new campaigns (0.50)

| Category | Recall | Benign |
|---|---|---|
| `mal_shape` | 231/300 (77.0%) | — |
| `mal_stream` | 144/200 (72.0%) | — |
| `ben_general` | — | 77/400 (19.3%) |
| `ben_scripts` | — | 0/64 |
| **All** | **375/500 (75.0%)** | **77/464 (16.6%)** |

Primitive channel flags 353/500 malware; `ben_scripts` has 0 false alarms.

### New mode on the v4 benchmark (cross-check, 0.50)

- T1 112/120, T2 5/120, T3 100/120, T4 120/120.
- T4 benign 58/58; the `eval` + `decode` primitive fires on every base64 wrapper.
- The new mode is not a replacement for known mode; T2 needs the normalised view.

### Fixed-FPR ceiling (current NCD-only score)

| Target FPR | All known TPR | `mal_known` TPR |
|---|---|---|
| 5% | 82.7% | 89.5% |
| 10% | 85.4% | 91.0% |
| 20% | 89.2% | 94.0% |

AUC 0.9176. At 95% recall the FPR is 59.1%. Six benign exact-zero matches set a 2.6% FPR floor. **95% recall at 5% FPR is not reachable by moving the NCD cutoff.**

### Ratio view

`Ratio` = recall% / benign%. `Marginal` = Δrecall points / Δbenign points from the previous row.

| Threshold | All known recall | Benign | Ratio | Marginal | `mal_known` ratio |
|---|---|---|---|---|---|
| 0.19 | 64.8% | 2.6% | 25.05 | — | 26.87 |
| 0.30 | 75.2% | 3.4% | 21.81 | 12.08 | 23.35 |
| 0.50 | 85.8% | 11.2% | 7.66 | 1.37 | 8.12 |
| 0.60 | 91.5% | 32.3% | 2.83 | 0.27 | 2.99 |
| **0.62** | **91.9%** | **35.3%** | **2.60** | **0.14** | **2.76** |
| 0.70 | 94.6% | 55.6% | 1.70 | 0.13 | 1.75 |
| 0.72 | 95.2% | 59.1% | 1.61 | 0.18 | 1.65 |
| 0.75 | 97.7% | 75.0% | 1.30 | 0.16 | 1.32 |
| 0.80 | 99.6% | 94.8% | 1.05 | 0.09 | 1.05 |

0.62 is the `mal_known` knee: 0.62 → 0.70 adds **zero** `mal_known` detections for +20.3 benign points. 0.50 has the best overall ratio; 0.62 is the recall-oriented compromise.

## Dataset plan (next work)

First step is **not downloading**: freeze the split and inventory.

```bash
mkdir -p ~/pg-v5/{frozen,manifest,refs,targets,reports}

python3 -I experiments/v2/scripts/build_dataset.py index \
    --datadog ~/packguard-data/datadog --index ~/pg-v5/index.json
python3 -I experiments/v2/scripts/build_dataset.py stats --index ~/pg-v5/index.json
```

Then:

1. Copy the current test sets/manifests into `~/pg-v5/frozen/`; record hashes. Never merge new data into the frozen tests.
2. Build `~/pg-v5/manifest.csv` with source, category, name, version, date, shape, family, label, split (`reference`/`validation`/`test`), provenance.
3. Split by time and family, not randomly.

Expand **benign first**:

```bash
python3 -I experiments/v2/scripts/fetch_benign.py \
    --datadog ~/packguard-data/datadog --out ~/pg-v5 --general 1000 --probe 12000
```

Need 1,000+ general benign, 500+ scripted benign, long-tail, and hard negatives (minified/bundled, TS stubs, copied libraries, build tools, telemetry, `hostname`/`env`/`child_process`/network users). Add large packages separately; the current fetcher caps at 64 KiB.

Expand malware:

```bash
python3 -I experiments/v2/scripts/fetch_datadog.py \
    --out ~/packguard-data/datadog --kind malicious_intent --max-bytes 10485760
python3 -I experiments/v2/scripts/fetch_datadog.py \
    --out ~/packguard-data/datadog --kind compromised_lib --max-bytes 10485760
```

Also: OSSF malicious-packages (names/reports), npm/GitHub/Snyk advisories, Backstabber's Knife Collection, MalwareBench, MalOSS (names only). The current `dataset_index.md` lists the backlog: `compromised_lib`, DataDog zips over 1 MiB, Backstabber/MalwareBench, MalOSS, OSSF, and a large benign set.

Do not optimize on clone count. Track families, code shapes, time span and hard benign negatives. Keep `.js/.cjs/.mjs` and install scripts. Dedup by code shape. Encrypted zips only in git; WSL only; never execute samples.

## Modelling next steps

1. Two-class compression likelihood ratio: `C(x|B) − C(x|M)` with benign and malware dictionaries; family dictionaries; calibrate at 5% FPR.
2. Compressibility features: `C(x)/len(x)`, entropy, ratios.
3. LZJD containment / SHWeL.
4. AST/function-level fingerprints (T3 padding).
5. Encoded views (T4).
6. Benign veto/margin (remove the 2.6% exact-zero floor).
7. Metadata/primitives.
8. Small feature fusion model.

The literature review is in `docs/related-work.md`: Alshahwan et al. (95.2% accuracy at 5% FPR on binaries with two-class NCD + compressibility + decision forest), Asadi/Varadharajan MDL, LZW two-dictionary, LZJD/SHWeL, ZipAST, and npm detectors. No paper found reports 95% recall at 5% FPR on known/mangled npm packages with compression-only stage 1; that is the gap.

## Reproduce

```bash
# Linux/WSL scanner
make -j4

# Windows scanner (Git Bash; Windows tar first for the xz extraction)
PATH="/c/Windows/System32:$PATH" powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows.ps1

# Rust CLI
cd frontend && cargo build --release

# CLI
frontend/target/release/packguard-cli.exe --mode known --refs <refs> --package <pkg>
frontend/target/release/packguard-cli.exe --mode new --refs <refs> --scan-dir <dir>
frontend/target/release/packguard-cli.exe --tui

# Full v5 matrix (WSL)
python3 -I experiments/v5/scripts/run_full.py
```

## Open issues / caveats

- Nothing committed; branch `feature/v5-stage1`.
- The full-matrix reports in `~/pg-v5` were generated before the current mode thresholds (known 0.62 JavaScript / 0.50 scripts, new 0.50). The `score` and primitive fields are threshold-independent and were used for the tables; the `flagged` fields in those reports reflect the older thresholds. Re-run for fresh `flagged` fields.
- `run_full.py` still prints .19/.30/.50; the 0.62 known metrics were computed separately from the report scores.
- Stage 2 is not called by the Rust CLI; it feeds on the JSON reports, which can be kept with `--reports`.
- 95/5 is not reached with NCD-only; the two-class compression/feature-fusion work is the path.
- T3 padding is the main known-v4 gap: 79.2% at 0.62; T4 is 93.3%.
- Benign set is too small for a 5% claim; expand hard negatives.
- Windows build script needs Windows `tar` ahead of Git Bash's `/usr/bin/tar`; otherwise it treats `C:` as a remote host.
- `frontend/target/` is ignored; `Cargo.lock` is untracked.

## File map

| Path | Purpose |
|---|---|
| `src/primitives.c/.h` | Behavioural primitive scanner and rules |
| `src/main.c` | `--mode known|new`, primitive aggregation, report fields |
| `src/report.c/.h` | `primitive_score`, `primitive_flagged`, `primitive_hits` |
| `src/scanner.h` | Reference-set documentation; no normalised filtering |
| `tests/primitives_scan_test/` | Primitive unit test and inputs |
| `frontend/` | Rust CLI/TUI wrapper |
| `experiments/v5/README.md` | Full results, ratio table, fixed-FPR ceiling, next signals |
| `experiments/v5/scripts/run_full.py` | Full known/new matrix harness |
| `experiments/v5/scripts/measure_subset.py` | Subset/ablation harness |
| `docs/v4-suggestions.md` | v5 plan and status |
| `docs/v5-plan.md` | Dataset expansion, frozen split, method ladder, speed budget |
| `docs/related-work.md` | Literature review and the research gap |
| `README.md` | CLI modes and v5 results pointer |
| `.gitignore` | Ignores `frontend/target/` |
