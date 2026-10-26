# v2 dataset, install scripts and ratio experiment

This experiment builds the v2 malware set from the whole DataDog npm `malicious_intent` collection. It adds install scripts from `package.json` and chooses how many examples to keep per code shape and per package name by measuring accuracy against time. Run on 2026-10-25 and 2026-10-26.

## Summary

- **Ratio: 1 package per code shape, 3 per package name, newest first.** Keeping more examples of a shape (2, 3, 5, 10, unlimited) caught no extra malware and raised no false alarm; it only cost memory and load time. Packages with one code shape are the same code with different strings, so one example is enough. Keeping the newest version of each family instead of the earliest raised AUC (0.690 → 0.697 on `mal_shape`, 0.656 → 0.662 on `mal_stream`) at the lowest cost: 28.5 s load and 1.22 GB. Lifting the name cap gives the same AUC gain but needs 2.0 GB and 57 s.
- **Install scripts help, with no new false alarm.** With them, AUC rises from 0.62 to 0.69 (`mal_shape`) and from 0.63 to 0.66 (`mal_stream`), and 0 of 64 popular packages with install scripts score below 0.46. Script texts are short (28–450 bytes), so few malicious scripts score below 0.19; a separate threshold for script text (around 0.45) is the next thing to test.
- **New campaigns are mostly missed (10–12% recall at 0.19).** Only 9 of the 300 `mal_shape` packages published after the cutoff share a code shape with older malware. This is the unseen-family gap that v1 measured as 24%, now measured on time; the ratio cannot fix it.
- **Benign false alarms (10 of 400 at 0.19)** come from compiled-TypeScript stubs of 44–200 bytes and from libraries copied by typosquats (`supertest` matched `eslint-supertest` at 0.030). Ignoring JavaScript chunks under 256 bytes halves them (10 → 5).
- **The new build gives identical results, about 2.3 times faster.** The 64 KiB dictionary, the thread pool and the inverted LZJD index changed no score on the 7 settings run with both builds. Scanning the 964 test packages took about 265 s instead of 613 s.
- **The prefilter stays close to brute force on v2 data.** 22 of 24 packages got exactly the brute-force score. One malicious package was 0.0074 higher (0.873 against 0.866) and one benign package 0.0105 higher, both far above any threshold used.

## Setup

| | |
|---|---|
| Source | 23,825 DataDog zips of 1 MiB or less: 22,907 usable, 14,218 with distinct content, 9,583 code shapes, 2,928 install-script-only |
| Time split | References from packages published before 2026-04-01 (19,872); tests from packages published on or after it (3,035) |
| `mal_shape` | 300 tests, one per random code shape (variety) |
| `mal_stream` | 200 random tests (what a live scan meets, clones included) |
| `ben_general` | 400 packages from the `npm-high-impact` list, at most 64 KiB of JavaScript, with their `package.json` |
| `ben_scripts` | 64 popular packages that have install scripts (`package.json` only) |
| Scanner | This branch: 64 KiB dictionary, thread pool, inverted LZJD index, prefilter `-p 256`, 4 threads, WSL on the i3-1315U |

See [`dataset_index.md`](../../dataset_index.md#v2-ratio-test-set) for how the sets were chosen.

Configuration names are `s<shape cap>_n<name cap>`, where 0 means no cap; the earliest-published packages are kept first unless the name ends in `_latest`. `_noscripts` uses references without install scripts and ignores script chunks.

## Results

Recall and false alarms counted at a score of 0.19 or less, all chunks counted (`results/ratio/summary.csv` has 0.10 and 0.30 too, and every row again with JavaScript chunks under 256 bytes ignored):

| Config | Ref. packages | Distinct chunks | Load | Scan | Peak memory | `mal_shape` recall | `mal_stream` recall | AUC (shape / stream) | False alarms (`ben_general`, `ben_scripts`) |
|---|---|---|---|---|---|---|---|---|---|
| **s1_n3_latest (chosen)** | 5,411 | 51,351 | 28.5 s | 267 s | 1,224 MiB | 10.3% | 12.0% | **0.697 / 0.662** | 10/400, 0/64 |
| s3_n3_latest | 6,417 | 53,617 | 31.1 s | 266 s | 1,345 MiB | 10.3% | 12.0% | 0.698 / 0.663 | 10/400, 0/64 |
| s1_n3 | 5,401 | 49,086 | 35.1 s | 265 s | 1,165 MiB | 10.3% | 12.0% | 0.690 / 0.656 | 10/400, 0/64 |
| s2_n3 | 6,080 | 50,707 | 36.0 s | 268 s | 1,244 MiB | 10.3% | 12.0% | 0.690 / 0.656 | 10/400, 0/64 |
| s3_n3 (v1 rule) | 6,419 | 51,862 | 39.7 s | 264 s | 1,292 MiB | 10.3% | 12.0% | 0.690 / 0.656 | 10/400, 0/64 |
| s5_n3 | 6,793 | 53,983 | 38.6 s | 266 s | 1,333 MiB | 10.3% | 12.0% | 0.690 / 0.656 | 10/400, 0/64 |
| s10_n3 | 7,233 | 55,257 | 40.4 s | 266 s | 1,359 MiB | 10.3% | 12.5% | 0.690 / 0.656 | 10/400, 0/64 |
| s0_n3 | 8,468 | 56,529 | 40.7 s | 288 s | 1,392 MiB | 10.3% | 12.5% | 0.692 / 0.657 | 10/400, 0/64 |
| s3_n0 | 9,431 | 77,251 | 58.9 s | 273 s | 2,035 MiB | 10.3% | 12.0% | 0.698 / 0.662 | 10/400, 0/64 |
| s0_n0 | 11,968 | 82,530 | 57.4 s | 267 s | 2,158 MiB | 10.3% | 12.5% | 0.699 / 0.662 | 10/400, 0/64 |
| s3_n3_noscripts | 5,390 | 50,003 | 40.5 s | 268 s | 1,271 MiB | 10.0% | 11.5% | 0.623 / 0.631 | 10/400, 0/64 |

Scan is the wall time for all 964 test packages. At 0.30 the chosen setting has one benign false alarm fewer than the earliest-first ones (24 against 25) and one `mal_stream` package fewer (12.5% against 13.0%).

### Same results, faster build

The first 7 settings were also run with the earlier build (1 MiB dictionary, threads started for every pass, every reference digest compared). Every score was the same, and the run files are in `results/ratio/build_1mib/`:

| Config | Load (old → new) | Scan (old → new) |
|---|---|---|
| s1_n3 | 26.0 → 35.1 s | 613 → 265 s |
| s3_n3 | 24.0 → 39.7 s | 632 → 264 s |
| s0_n3 | 33.7 → 40.7 s | 650 → 288 s |

Load is about 10 s longer because the inverted index is built then; scanning is 2.3 times faster. On the v1 detailed test the total went from 108 s to 68 s with every report identical (see the README's prefilter section).

### Prefilter against brute force

24 test packages of at most 12 KiB (10 `mal_shape`, 6 `mal_stream`, 8 `ben_general`), `s1_n3` references, `-p 0` against `-p 256` (`results/prefilter_vs_bruteforce.csv`). 22 scores are identical; `crypto-hash-sdk@1.0.1` is 0.8731 with the prefilter against 0.8657 by brute force, and one benign package is 0.0105 higher. Brute force took 585 s for the 24 packages.

## Reproduce (WSL only)

```bash
python3 -I experiments/v2/scripts/fetch_datadog.py --out ~/packguard-data/datadog
python3 -I experiments/v2/scripts/build_dataset.py index --datadog ~/packguard-data/datadog --index ~/pg-v2/index.json
python3 -I experiments/v2/scripts/build_dataset.py targets --datadog ~/packguard-data/datadog --index ~/pg-v2/index.json \
    --out ~/pg-v2 --since 2026-04-01 --category mal_shape
python3 -I experiments/v2/scripts/build_dataset.py targets --datadog ~/packguard-data/datadog --index ~/pg-v2/index.json \
    --out ~/pg-v2 --since 2026-04-01 --mode stream --n 200 --category mal_stream
python3 -I experiments/v2/scripts/fetch_benign.py --datadog ~/packguard-data/datadog --out ~/pg-v2
python3 -I experiments/v2/scripts/run_ratio.py --work ~/pg-v2 --datadog ~/packguard-data/datadog \
    --index ~/pg-v2/index.json --packguard build/packguard
python3 -I experiments/v2/scripts/analyze_ratio.py --work ~/pg-v2 --out experiments/v2/results/ratio
```

Build the v2 set from all dates with the chosen ratio and pack it (`zip` is Info-ZIP; without root it can be unpacked from the Ubuntu `.deb` with `dpkg -x`):

```bash
python3 -I experiments/v2/scripts/build_dataset.py select --datadog ~/packguard-data/datadog \
    --index ~/pg-v2/index.json --out ~/packguard-data/v2/malware_js --shape-cap 1 --name-cap 3 --order latest
python3 -I experiments/v2/scripts/build_dataset.py pack --out ~/packguard-data/v2/malware_js \
    --zips data/v2 --prefix malware_js
```

## Files

| Path | Content |
|---|---|
| `scripts/fetch_datadog.py` | Downloads the DataDog npm zips in parallel from `raw.githubusercontent.com` |
| `scripts/build_dataset.py` | Index (code shapes, install scripts), selection with caps, test targets, encrypted packing |
| `scripts/fetch_benign.py` | Benign packages from the npm registry |
| `scripts/run_ratio.py`, `scripts/analyze_ratio.py` | The ratio experiment and its metrics |
| `results/ratio/summary.csv` | One row per configuration and minimum JavaScript chunk size |
| `results/ratio/packages.csv` | One row per configuration and test package: scores only, no malware text |
| `results/ratio/*.run.json` | Reference size, load time, wall time and peak memory per configuration; `build_1mib/` holds the earlier build's runs |
| `results/prefilter_vs_bruteforce.csv` | Prefilter and brute-force score of each of the 24 packages checked |
