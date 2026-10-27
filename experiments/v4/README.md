# v4: renamed and mangled known malware

Stage 1 v4 adds a normalised JavaScript view and content-defined chunking (CDC), and tests them on transformed known-malware samples. Stage 2 is out of scope. Run on 2026-10-27 inside WSL.

## Summary

- **Known-family recall rises sharply.** On 712 transformed packages, overall malware recall at 0.19 goes from **9.8% (v3) to 64.8% (v4c2)**, at 0.30 from 28.7% to **75.2%**, and at 0.50 from 40.2% to **85.8%**.
- **Formatting and renaming are essentially solved.** At 0.19, T1 (re-indent/comment) rises from 15.8% to **90.8%**, T2 (rename identifiers, strings, numbers and files) from 0.8% to **90.0%**.
- **Encoded payloads become detectable.** T4 (whole-file base64) rises from 0% to **48.3% at 0.19**, 72.5% at 0.30 and 85.8% at 0.50.
- **T3 padding is still hard.** T3 (18 KiB of inserted dead code) rises from 22.5% to **30.0% at 0.19**, 41.7% to 44.2% at 0.30, and 67.5% to 68.3% at 0.50. CDC only on the normalised view removes the regression seen when CDC was applied to the raw view as well.
- **False alarms rise on T1/T2.** Benign false alarms at 0.19 go from 0% to **5.2% (3/58)** on T1/T2, and at 0.50 to 19.0% (11/58). T3 and T4 have 0% at 0.19 and 0.30; T4 is 6.9% at 0.50. The overall benign rate is 2.6% at 0.19, 3.4% at 0.30 and 11.2% at 0.50. Stage 2 is intended to remove these, but they are a real cost at the stage-1 threshold.
- **The normalised view is the main win.** The exact normalised hash matched 211 of the 480 malware variants, and the normalised view set the package score for 405 of 480.
- **Time cost is moderate.** v4c2 takes 428.5 s against v3's 374.0 s for 712 targets; load is 55.5 s raw plus 14.7 s normalised, and peak memory is the same 1,702 MiB.

## Setup

| | |
|---|---|
| Source | The v1 detailed test set in WSL: `~/pg-detailed/targets` |
| Malware | 120 packages: 50 `mal_known`, 35 `mal_newver`, 35 `mal_newname` |
| Benign | 58 packages with JavaScript: 41 `ben_popular`, 17 `ben_longtail` |
| Tiers | T1 format, T2 rename/strings/numbers/files, T3 18 KiB dead-code padding, T4 base64 |
| References | v1 malware set: 39,119 files, 190,939 chunks, 68,868 distinct after boilerplate |
| Normalised references | 50,791 chunks, 17,906 distinct |
| Scanner | `-j 4 -p 256 -m 256 -b 1 -t 0.19 -s 0.45` |
| v3 mode | `-c 0 -n 0` |
| v4c2 mode | `-c 2 -n 1 -e 1` (CDC only on the normalised view) |

The original sample is in the reference set, but each transformed variant is new. This measures **known-family robustness**, which is what v4 targets; it does not measure detection of a new campaign. The T2 transform may produce code that is not valid JavaScript, but it is only read as text and never executed.

## Results

Malware recall and benign false-alarm rate, by tier (120 malware and 58 benign packages per tier):

| Tier | v3 0.19 | v4c2 0.19 | v3 0.30 | v4c2 0.30 | v3 0.50 | v4c2 0.50 | v4c2 benign 0.19 / 0.30 / 0.50 |
|---|---|---|---|---|---|---|---|
| T1 format | 15.8% | **90.8%** | 71.7% | **92.5%** | 89.2% | **95.0%** | 5.2% / 6.9% / 19.0% |
| T2 rename | 0.8% | **90.0%** | 1.7% | **91.7%** | 4.2% | **94.2%** | 5.2% / 6.9% / 19.0% |
| T3 padding | 22.5% | **30.0%** | 41.7% | **44.2%** | 67.5% | **68.3%** | 0% / 0% / 0% |
| T4 base64 | 0% | **48.3%** | 0% | **72.5%** | 0% | **85.8%** | 0% / 0% / 6.9% |
| **All** | **9.8%** | **64.8%** | **28.7%** | **75.2%** | **40.2%** | **85.8%** | 2.6% / 3.4% / 11.2% |

By category, across all four tiers:

| Category | v3 0.19 / 0.30 / 0.50 | v4c2 0.19 / 0.30 / 0.50 |
|---|---|---|
| `mal_known` | 13.0% / 33.0% / 44.0% | **69.5% / 80.5% / 91.0%** |
| `mal_newver` | 4.3% / 18.6% / 28.6% | **46.4% / 57.1% / 70.0%** |
| `mal_newname` | 10.7% / 32.9% / 46.4% | **76.4% / 85.7% / 94.3%** |

### Same results, three modes

| Mode | Wall | Raw load | Normalised load | Peak memory | T3 recall 0.19 |
|---|---|---|---|---|---|
| v3, `-c 0 -n 0` | 374.0 s | 46.7 s | — | 1,702 MiB | 22.5% |
| v4, `-c 1 -n 1 -e 1` (CDC both views) | 311.6 s | 27.2 s | 12.1 s | 1,472 MiB | 16.7% |
| **v4c2, `-c 2 -n 1 -e 1` (CDC normalised only)** | **428.5 s** | **55.5 s** | **14.7 s** | **1,702 MiB** | **30.0%** |

CDC on the raw view reduced reference chunks from 190,939 to 97,927 and made the run faster, but it lost T3 recall because the fixed overlapping windows kept a mostly-original chunk after the 18 KiB insertion. `-c 2` keeps the raw view at v3 behaviour and applies CDC only to the normalised view, which turns T3 into a small gain. The CDC-both ablation is in `results-cdc-both/`.

## What changed

- **Normalised view (`-n 1`).** Comments and whitespace are removed, string literals become `S`, numbers become `N`, identifiers become `I`, and language keywords plus common built-ins are kept. The scanner loads a second reference set from the normalised stream and scores target JavaScript against it. The package score is the lower of the raw and normalised scores.
- **Encoded payloads (`-e 1`).** Long base64 and hex string literals are decoded and their normalised text is added to the view; a whole file that is one encoded payload is decoded before normalisation. This is what makes T4 detectable.
- **Exact normalised hash.** An open-addressed table over the normalised reference chunks gives a byte-identical normalised chunk a distance of 0 without running NCD.
- **Content-defined chunking (`-c`).** `-c 1` applies CDC to both views; `-c 2` applies it only to the normalised view; `-c 0` is the fixed 8 KiB/4 KiB windows of v3. CDC uses 2/8/16 KiB minimum/average/maximum boundaries from a gear-style rolling hash.
- **Report fields.** With `-n 1`, the report adds `score_raw`, `score_normalized`, `score_view` and `normalized_match`; the raw `chunks` array and the v3 defaults are unchanged.

## Reproduce

```bash
make -j4
python3 -I experiments/v4/scripts/mangle.py --work ~/pg-v4
python3 -I experiments/v4/scripts/run_v4.py --work ~/pg-v4 --mode v3 --tag v3 --packguard ./build/packguard
python3 -I experiments/v4/scripts/run_v4.py --work ~/pg-v4 --mode v4c2 --tag v4c2 --packguard ./build/packguard
python3 -I experiments/v4/scripts/analyze_v4.py --work ~/pg-v4 --tags v3,v4c2 --out experiments/v4/results
```

All malware work happens in WSL. The transformed targets and reports stay in `~/pg-v4`; only score and name CSVs are committed.

## Files

| Path | Content |
|---|---|
| `scripts/mangle.py` | Builds the T1–T4 transformed targets, benign controls, manifest and scan symlinks |
| `scripts/run_v4.py` | Runs v3, v4 or v4c2 and records wall time, load time, peak RSS and exit status |
| `scripts/analyze_v4.py` | Writes `summary.csv`, `packages.csv` and `summary.json`; prints per-tier recall and false alarms |
| `results/summary.csv` | One row per tag, tier and category, including the `ALL` rows |
| `results/packages.csv` | One row per tag, tier, category and package: score, raw score, normalised score and winning view |
| `results/summary.json` | The same summary plus v4c2-minus-v3 deltas |
| `results/v3.run.json`, `v4.run.json`, `v4c2.run.json` | Reference size, load, wall time and peak memory per run |
| `results-cdc-both/` | The `-c 1` ablation, kept for comparison |

## Limitations

- **Known family only.** The original sample is in the references. This is the v4 target, but it is not an unseen-family or leave-family-out measurement.
- **Synthetic transforms.** T2 can produce invalid JavaScript; T3 is one padding strategy, not split/merge or reordering; T4 is base64, not every obfuscator.
- **Small benign set.** 58 packages per tier. The 5.2% false-alarm rate is 3 packages, so the confidence interval is wide; a larger benign set is still needed.
- **Thresholds are inherited.** 0.19 comes from the v1 test set and was not tuned on this benchmark. 0.30 is shown because v3 already had 71.7% T1 recall there.
- **T3 is the remaining weak spot.** Padding still loses most variants at 0.19. CDC parameters, overlap, or function-level matching are the next candidates; CDC on the raw view is not one, because it made T3 worse.
- **Stage 2 is not included.** The false alarms are expected to be removed there, but that is a separate evaluation.

## Next steps

1. Tune CDC for structural insertion: smaller maximum chunk, overlap, or a function/snippet view. Do not apply CDC to the raw view until T3 improves.
2. Expand the benign controls and re-check the 5.2% false-alarm rate.
3. Run the v1 detailed test with the v4c2 flags as a regression check.
4. Feed the normalised-view scores and `normalized_match` to stage 2; v4 records them but does not use them.
