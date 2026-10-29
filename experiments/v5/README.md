# v5: two modes, full results

Stage 1 v5 has two modes in one binary:

| Mode | Settings | Purpose |
|---|---|---|
| **Known / mangled** | `--mode known`: v4c2 views/chunking (`-c 2 -n 1 -e 1 -b 1`) with JavaScript threshold **0.62** and install-script threshold **0.50** | Reproduce v4's renamed/mangled results at the selected recall point |
| **New campaigns** | `--mode new`: raw NCD plus behavioural primitives, no normalised view, threshold **0.50** | Catch malware whose family is not in the references |

**Operating point: known 0.62 JavaScript / 0.50 scripts; new 0.50.** Stage 2 is built and committed on `main`, so it filters the false alarms; stage 1 runs at the selected aggressive setting. The split is deliberate: stage 1 (compression plus primitives) does the detection work, and stage 2 only clears false alarms. 0.62 is the known-mode balance. The 0.19 and 0.30 columns below are kept for comparison.

## Full matrix

All four combinations were run on the full sets: the v4 mangling benchmark (712 targets: 480 malware, 232 benign) and the v2 new-campaign set (964 targets: 500 malware, 464 benign). Reports are in `~/pg-v5`; the harness is `experiments/v5/scripts/run_full.py`.

### Known / mangled mode on the v4 benchmark (0.62 active)

At 0.62: **441/480 (91.9%) malware** and **82/232 (35.3%) benign**, precision 84.3%, stage-1 accuracy 83.0%. Per tier: T1 117/120, T2 117/120, T3 95/120, T4 112/120; benign T1 31/58, T2 31/58, T3 0/58, T4 20/58. `mal_known` alone is 195/200 (97.5%); `mal_newver` is 113/140 (80.7%) and `mal_newname` 133/140 (95.0%).

The table below keeps the .19/.30/.50 history; 0.62 is the selected known-mode setting.

| Tier | Malware at 0.19 / 0.30 / 0.50 | Benign at 0.19 / 0.30 / 0.50 |
|---|---|---|
| T1 format | 109/120 / 111/120 / 114/120 | 3/58 / 4/58 / 11/58 |
| T2 rename | 108/120 / 110/120 / 113/120 | 3/58 / 4/58 / 11/58 |
| T3 padding | 36/120 / 53/120 / 82/120 | 0/58 / 0/58 / 0/58 |
| T4 base64 | 58/120 / 87/120 / 103/120 | 0/58 / 0/58 / 4/58 |
| **All** | **311/480 (64.8%) / 361/480 (75.2%) / 412/480 (85.8%)** | **6/232 (2.6%) / 8/232 (3.4%) / 26/232 (11.2%)** |

Known mode on the new-campaign set at the selected 0.62/0.50 thresholds: 360/500 (72.0%) malware and 250/464 (53.9%) benign. The 0.50 comparison above is 278/500 (55.6%) and 175/464 (37.7%). Stage 2 handles the higher benign load.

### New-campaign mode on the new-campaign set

| Category | Baseline v4c2 at 0.19 | New at 0.19 | New at 0.30 | New at 0.50 |
|---|---|---|---|---|
| `ben_general` | 84/400 | **50/400** | 51/400 | 77/400 |
| `ben_scripts` | 0/64 | **0/64** | 0/64 | 0/64 |
| `mal_shape` | 95/300 | **227/300** | 228/300 | 231/300 |
| `mal_stream` | 71/200 | **142/200** | 143/200 | 144/200 |
| **All** | **166/500 (33.2%)** | **369/500 (73.8%)** | **371/500 (74.2%)** | **375/500 (75.0%)** |

Benign false alarms are 50/464 (10.8%) at 0.19, 51/464 at 0.30 and 77/464 at 0.50. The primitive channel flags 353/500 malware; primitive-only hits at 0.19 are 201 `mal_shape`, 119 `mal_stream` and 49 `ben_general`. Raw NCD adds the rest.

**At the deployed 0.50 operating point: 375/500 (75.0%) malware and 77/464 (16.6%) benign.** This is the main v5 result: the new mode raises new-campaign recall from 55.6% (known mode at 0.50) to 75.0% while lowering benign flags from 37.7% to 16.6%. Stage 2 filters the remaining false alarms.

### Cross-checks: new mode on the v4 benchmark

The new mode is not meant to replace the known mode. The cross-run shows why:

| Tier | New-mode malware at 0.19 / 0.30 / 0.50 | New-mode benign |
|---|---|---|
| T1 | 75/120 / 102/120 / 112/120 | 0/58 / 0/58 / 1/58 |
| T2 | 1/120 / 2/120 / 5/120 | 0/58 |
| T3 | 84/120 / 91/120 / 100/120 | 0/58 |
| T4 | 120/120 / 120/120 / 120/120 | 58/58 / 58/58 / 58/58 |

- T2 collapses in the new mode because the normalised view is what survives renaming; use the known mode for renamed/mangled families.
- T4 is fully flagged on both sides because the `eval` + `decode` primitive fires on every base64 wrapper. This is useful for new campaigns but too broad as a standalone known-mangled rule; stage 2 handles the benign side.

## Threshold efficiency (recall-to-false-alarm ratio)

`Ratio` is recall% divided by benign-flagged%. `Marginal` is the change in recall points divided by the change in benign points from the previous row. Higher is better for both.

| Threshold | All known recall | Benign | Ratio | Marginal | `mal_known` recall | `mal_known` ratio |
|---|---|---|---|---|---|---|
| 0.19 | 64.8% | 2.6% | 25.05 | — | 69.5% | 26.87 |
| 0.30 | 75.2% | 3.4% | 21.81 | 12.08 | 80.5% | 23.35 |
| 0.50 | 85.8% | 11.2% | 7.66 | 1.37 | 91.0% | 8.12 |
| 0.60 | 91.5% | 32.3% | 2.83 | 0.27 | 96.5% | 2.99 |
| **0.62** | **91.9%** | **35.3%** | **2.60** | **0.14** | **97.5%** | **2.76** |
| 0.70 | 94.6% | 55.6% | 1.70 | 0.13 | 97.5% | 1.75 |
| 0.72 | 95.2% | 59.1% | 1.61 | 0.18 | 97.5% | 1.65 |
| 0.75 | 97.7% | 75.0% | 1.30 | 0.16 | 99.0% | 1.32 |
| 0.80 | 99.6% | 94.8% | 1.05 | 0.09 | 100.0% | 1.05 |

At **0.62** the next step to 0.70 adds **zero** `mal_known` detections for **+20.3** benign points; 0.70 to 0.72 also adds zero. That is the `mal_known` knee. For all known variants, 0.62 to 0.70 buys +2.7 recall for +20.3 benign; 0.70 to 0.80 buys +5.0 recall for +39.2 benign.

The ratio favors **0.50** if stage-2 load is the constraint: it sends 26 benign packages to stage 2, against 82 at 0.62 and 220 at 0.80. 0.62 is the recall-oriented compromise: it gets `mal_known` to 97.5% and keeps stage 2 below half the benign set. The ratio must be read with the absolute recall and the stage-2 cost; a high ratio at 0.19 comes with only 64.8% overall recall.

## Beyond one NCD threshold

The 0.62 trade-off is real because one NCD threshold sees only one number. The known-v4 gap at 0.62 is T3 (79.2%) and T4 (93.3%), while T1/T2 are 97.5%; benign flags are 82/232. If T3 reached 95% while T1/T2/T4 stayed the same, all-known recall at 0.62 would be about **95.8%** with the same benign flags. That is the highest-leverage fix.

### Fixed false-alarm ceiling (current score)

| Target FPR | All known variants TPR | `mal_known` TPR |
|---|---|---|
| 5% | 82.7% | 89.5% |
| 10% | 85.4% | 91.0% |
| 20% | 89.2% | 94.0% |

The current known-v4 score has AUC 0.9176. At 95% recall the FPR is 59.1%; at 5% FPR the all-known TPR is 82.7%. The six benign exact-zero matches also set a 2.6% false-alarm floor, so no cutoff below that catches malware. **95% recall at 5% false alarms is not reachable by moving the NCD cutoff.** It needs a better score and the benign veto.

With stage 2, a final 5% false-alarm rate at 95% recall is a system-level possibility, but it is not a stage-1 result: stage 1 at 0.72 gives 95.2% recall with 59.1% benign, so stage 2 would have to filter most of those benign packages while keeping the malware. That is a heavy stage-2 load and must be measured on stage 2, not assumed.

### Compression beyond NCD

NCD is a nearest-neighbor distance: it asks “is this close to any malware chunk?” It has no model of benign code, so generic code compresses well against both sides and the classes overlap. A stronger compression formulation is a **two-model likelihood ratio**:

- Build a malware dictionary/model `M` and a benign dictionary/model `B` from held-out data.
- Compute `C(x | M)`, the compressed size of a chunk with the malware dictionary, and `C(x | B)` with the benign dictionary.
- Score `C(x | B) - C(x | M)` or `C(x | B) / C(x | M)`. A chunk that belongs to a malware family compresses better under `M`; generic code compresses about equally under both. Flag at a calibrated margin.
- Use **family dictionaries** if one global malware dictionary is too broad: score `min_family C(x | family)` against `C(x | B)`.
- A small **compression feature ensemble** can combine `C(x)`, `C(x | M)`, `C(x | B)`, the ratios, compression ratio, LZJD containment and exact hashes. A logistic regression or shallow tree only calibrates those features; it is not stage 2’s deep model.

This is still compression, not raw-code ML, and it directly targets the 5% false-alarm target: the benign model explains generic code, so the malware-versus-benign likelihood ratio should flag less of it. The cost is two dictionary compressions per chunk, which is cheaper than NCD against the full reference set; LZMA preset dictionaries or representative family dictionaries work without a new library.

The current NCD ROC is AUC 0.9176 with 82.7% all-known TPR at 5% FPR (89.5% `mal_known`). Whether the two-model compression score reaches 95/5 is a measurement question; it has a better chance than any cutoff change because it changes the score, not the threshold.

Two independent directions:

1. **Benign reference veto or margin.** Keep the 0.62/0.70 threshold for recall, but do not let a chunk that also matches known-benign code set the score. An exact benign hash veto handles copied libraries and generic stubs; for near matches, compute the best benign NCD and require the malware match to be better by a margin. Use a held-out benign set, never the test set. This is the direct way to stop trading benign packages for recall.
2. **Add non-NCD evidence.** These signals are independent of the compression score:
   - **LZJD containment** is already computed for the prefilter. Use the phrase-set containment (how much of the reference phrase set is in the target), not just candidate ranking; it survives padding better than whole-chunk NCD.
   - **Function-level fingerprints**: split JavaScript into functions and hash a canonical form of each function (or AST subtree). A single matching function flags the package even if padding, split/merge or file renaming moved everything else. This targets T3.
   - **Encoded payload views**: recursively decode base64, hex, char-code arrays, gzip/deflate and `eval`/`Function` wrappers; score the decoded text as a separate view. This targets T4 and new campaigns.
   - **Behavioural primitives and metadata**: install scripts, API calls, `child_process`/network/host reads, package name/version, repository presence and publication age. These are high-precision, independent signals; stage 2 filters the false alarms.
   - **Feature fusion**: a small calibrated model over NCD, LZJD containment, exact hashes, primitives and metadata. A logistic regression or shallow tree can learn the trade-off and produce one score; it is not stage 2's deep model. Measure at fixed false-alarm rates before adopting it.

The recommended order is the benign veto first (it can cut the 82/232 false alarms without lowering recall), then LZJD containment/function-level matching for T3, then encoded views for T4. A feature-fusion model is the larger follow-up, not the first move.

## Tuning recommendation

**The selected thresholds are known 0.62 JavaScript / 0.50 scripts and new 0.50.** Stage 2 is built and committed on `main`, so it filters the false alarms.

**Known / mangled mode at 0.62:** 441/480 (91.9%) on the v4 benchmark with 82/232 (35.3%) benign; `mal_known` alone is 195/200 (97.5%). On the new-campaign set it gives 360/500 (72.0%) with 250/464 (53.9%) benign. Use it for renamed and mangled families.

**The new-campaign mode at 0.50:** 375/500 (75.0%) on new campaigns with 77/464 (16.6%) benign. It remains the better profile for new campaigns even against the more aggressive known mode.

If the target is 95% recall over **all** known variants, 0.62 is not enough (91.9%); 0.72 is 95.2%, but 59.1% of benign packages are flagged. 0.62 gives 97.5% on the original `mal_known` category. The known-mode 0.62 choice is the current compromise.

The optional precision work is the **`eval` + `decode` primitive** in the new mode. It flags all 58 benign T4 packages and contributes many of the primitive-only benign flags. Requiring a second signal (network, execution or sensitive path) for `eval` + `decode`, or making it a score rather than a standalone flag, would reduce stage-2 load. Measure that change on the new-campaign set first; it may also lose encoded new-campaign samples.

The remaining 125/500 new-campaign misses at 0.50 are feature work, not threshold tuning. `ben_scripts` has 0 false alarms, so the script rule is clean.

## CLI / TUI

The Rust wrapper is in `frontend/`. It runs the C scanner, reads the JSON reports, and prints a ranked table:

```bash
cd frontend
cargo build --release
./target/release/packguard-cli --mode new --refs <reference_dir> --scan-dir <package_dir>
./target/release/packguard-cli --tui --packguard ../build/packguard
```

`--mode` selects the profile; known uses 0.62 JavaScript / 0.50 scripts, new uses 0.50. The TUI lets you change the mode, reference directory, scan directory and scanner path, then run and inspect the table. The C scanner must be built first.

## Reproduce

```bash
make -j4
python3 -I experiments/v5/scripts/run_full.py
```

The harness runs `--mode known` and `--mode new` on both sets, writes reports to `~/pg-v5`, and prints the tables above. It needs the existing `~/pg-v4`, `~/pg-v2` and `~/packguard-data` directories. Run times on the 4-core WSL machine: known-v4 450 s, new-v4 390 s, known-newcamp 450 s, new-newcamp 330 s.

## Limitations

- These are full sets, but the thresholds are still static per mode; the TUI will select the mode, not tune the threshold.
- Stage 2 is not included. The false-alarm numbers here are stage-1 numbers for stage 2 to filter.
- T4 is a synthetic base64 transform, not every obfuscator.
- The new mode's primitive rules were selected from the v2 data; a separate validation split is still needed before a production claim.
