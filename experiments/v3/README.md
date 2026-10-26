# v3: stage 1 accuracy work

This is the v3 stage-1 branch. It applies three suggestions from
[`docs/v2-suggestions.md`](../../docs/v2-suggestions.md):

1. Ignore JavaScript chunks under 256 bytes when scoring a package.
2. Drop boilerplate reference chunks.
3. Use a separate threshold for install-script text.

Stage 2 (the ModernBERT filter) is outside this branch. The report changes are the
contract stage 2 reads.

## Recorded v2 baseline

The v2 baseline is **not rerun**. It is recorded from PR #13 and from
`experiments/v2/results/ratio/`, both produced by the build at `6daa56ff`:

- PR: <https://github.com/fr9rx/PackGuard/pull/13>
- Run file: `experiments/v2/results/ratio/s1_n3_latest.run.json`
- Summary: `experiments/v2/results/ratio/summary.csv`
- Write-up: `experiments/v2/README.md`

Pinned setting: `s1_n3_latest` (1 package per code shape, 3 per name, newest
first), prefilter `-p 256`, 4 threads. Test sets: `mal_shape` 300, `mal_stream`
200, `ben_general` 400, `ben_scripts` 64.

| Measure | v2 baseline |
|---|---|
| Reference packages / distinct chunks | 5,411 / 51,351 |
| Load time | 28.5 s |
| Scan time, 964 packages | 265 s (PR); 267.0 s in the run file |
| Peak memory | 1.22 GB (1,224 MiB) |
| Recall at 0.19, `mal_shape` / `mal_stream` | 10.3% / 12.0% |
| Recall at 0.30, `mal_shape` / `mal_stream` | 12.0% / 12.5% |
| AUC, `mal_shape` / `mal_stream` | 0.697 / 0.662 |
| False alarms at 0.19, `ben_general` / `ben_scripts` | 10 / 400, 0 / 64 |
| False alarms at 0.30, `ben_general` / `ben_scripts` | 24 / 400, 0 / 64 |
| Lowest benign score | 0.0298 |

The same run with **JavaScript chunks under 256 bytes left out** is the target
for suggestion 1:

| Measure | With every chunk | JS chunks under 256 B ignored |
|---|---|---|
| False alarms at 0.19, `ben_general` | 10 / 400 | 5 / 400 |
| False alarms at 0.30, `ben_general` | 24 / 400 | 8 / 400 |
| Recall at 0.19, `mal_shape` / `mal_stream` | 10.3% / 12.0% | 9.0% / 11.5% |
| Recall at 0.30, `mal_shape` / `mal_stream` | 12.0% / 12.5% | 10.3% / 11.5% |
| AUC, `mal_shape` / `mal_stream` | 0.697 / 0.662 | 0.714 / 0.661 |

The five benign packages still at or below 0.19 after that rule are the first
diagnostic targets for suggestion 2:

| Package | Score |
|---|---|
| `supertest@7.3.1` | 0.0298 |
| `@openai/agents@0.21.0` | 0.0935 |
| `hotscript@1.0.13` | 0.1701 |
| `sqs-producer@9.0.6` | 0.1719 |
| `@aws-cdk/asset-awscli-v1@2.2.295` | 0.1815 |

PR #13 attributes the first class to libraries copied by typosquats and the
stub class to compiled-TypeScript code of 44-200 bytes. Suggestion 4
(benign references or a known-library check) covers the copied-library class and
is out of v3 scope.

### v1 regression baseline

The v2 build reproduced every v1 score. v3 must keep doing so:

| v1 detailed test, threshold 0.19 | Result |
|---|---|
| Known malware | 50/50 |
| Renamed clones | 32/35 |
| New versions of known packages | 23/35 |
| Family left out of the references | 12/50 |
| Benign false alarms | 0/75 |
| Total time, 195 packages | 68 s (load 43 s, scan 25 s, 1.74 GB peak) |

The v2 prefilter is also close to exact: 22 of 24 small packages scored exactly
as brute force. The two misses were 0.0074 and 0.0105 higher, both far above any
threshold.

## v3 results

Measured on 2026-10-26/27 on the same frozen v2 sets and the same
`s1_n3_latest` references. The official baseline is still the recorded v2 one;
the baseline row below is a verification run of the unchanged build, and it
reproduced the recorded scores (10/400 and 24/400 with every chunk, 5/400 and
8/400 with the 256-byte rule).

| Build | Distinct refs | Load | Scan | Peak | Benign ≤0.19 | Benign ≤0.30 | Recall shape/stream ≤0.19 | Recall ≤0.30 | AUC shape/stream |
|---|---|---|---|---|---|---|---|---|---|
| v2 baseline, every chunk | 51,351 | 30.6 s | 294.6 s | 1,224 MiB | 10/400 | 24/400 | 10.3% / 12.0% | 12.0% / 12.5% | 0.697 / 0.662 |
| v2 baseline, 256-byte rule applied afterwards | 51,351 | 30.6 s | 294.6 s | 1,224 MiB | 5/400 | 8/400 | 9.0% / 11.5% | 10.3% / 11.5% | 0.714 / 0.661 |
| v3 `#1` scanner (`v3-m256`) | 51,351 | 47.0 s | 334.8 s | 1,224 MiB | 5/400 | 8/400 | 9.0% / 11.5% | 10.3% / 11.5% | 0.714 / 0.661 |
| v3 `#1+#2+#3` (`v3-full`) | 51,029 | 42.8 s | 306.4 s | 1,222 MiB | **1/400** | **4/400** | 8.7% / 11.5% | 10.0% / 11.5% | **0.717 / 0.662** |

The scan times are not a controlled comparison: the v3 runs overlapped with
builds and sanitizer runs on the same 4-core WSL machine. No speed-up is
expected from suggestion 1, because ignored chunks are still scored and still
reported; the saving is in false alarms, not time.

### Suggestion 1: tiny JavaScript chunks

The scanner reproduces the recorded projection exactly: 5 of 400 benign
packages at 0.19 and 8 of 400 at 0.30, with recall 9.0% / 11.5%. The 345
chunks under 256 bytes in the benign set no longer set a package score. The
install scripts are untouched. The all-tiny fallback was exercised by
`tests/write_package_test` and produced a score plus `low_confidence` in every
case, so no package became unscored.

### Suggestion 2: boilerplate references

`is_boilerplate()` dropped 322 of the 51,351 distinct reference chunks. They
are compiled module stubs: `"use strict"`, a TypeScript helper, an
`__esModule` marker and re-export statements, with no code of their own. The
filter removed the reference side of the remaining stub false alarms:

| Benign package | Score before #2 | Score after #2 |
|---|---|---|
| `supertest@7.3.1` | 0.0298 | 0.0298 |
| `@openai/agents@0.21.0` | 0.0935 | > 0.30 |
| `hotscript@1.0.13` | 0.1701 | > 0.30 |
| `sqs-producer@9.0.6` | 0.1719 | 0.2959 |
| `@aws-cdk/asset-awscli-v1@2.2.295` | 0.1815 | > 0.30 |

Benign false alarms at 0.19 fell from 5 to 1 and at 0.30 from 8 to 4. Recall
lost 0.3 points on `mal_shape` at 0.19 (9.0% to 8.7%) and 1.0 point at 0.30;
AUC rose slightly (0.714 to 0.717 on `mal_shape`, 0.661 to 0.662 on
`mal_stream`). The one remaining false alarm at 0.19 is `supertest`, which
matched a renamed copy of its own library (`eslint-supertest`, NCD 0.0298).
That is the copied-library class that suggestion 4 (benign references or a
known-library check) covers; it is out of v3 scope. At 0.30 the remaining
four are `supertest`, `@bufbuild/buf` (0.2783),
`lodash.isequalwith` (0.2695) and `sqs-producer` (0.2959).

### Suggestion 3: install-script threshold

With `-t 0.19 -s 0.45`, the scanner's package `flagged` is the OR of the two
per-chunk rules. Across all 964 reports the scanner's flag matched an
independent Python recomputation in 964 of 964 cases.

| Measure | JavaScript rule only (0.19) | With the script rule (0.45) |
|---|---|---|
| Script-only malicious packages recalled, all test sets | 2/36 (5.6%) | **7/36 (19.4%)** |
| `ben_scripts` false alarms | 0/64 | **0/64** |
| `ben_general` false alarms | 1/400 | 1/400 |

The threshold was not tuned on the test split: 0.45 comes from the v2
measurement where the lowest benign script scored 0.462 and about ten
malicious scripts scored below it. A validation split should re-check it
before v3 is used live.

## What v3 accepts

| Suggestion | Acceptance against the recorded baseline | Measured |
|---|---|---|
| 1. Tiny JS chunks ignored | At most 5/400 false alarms at 0.19 and 8/400 at 0.30; recall at least 9.0% / 11.5%; install-script chunks never ignored | Met: 5/400, 8/400; recall 9.0% / 11.5% |
| 2. Boilerplate references dropped | Stub-driven false alarms disappear or fall below 0.19; no malicious score rises above the threshold | Met, with a 0.3-point recall cost at 0.19: 1/400, 4/400; recall 8.7% / 11.5%; `supertest` remains and belongs to suggestion 4 |
| 3. Separate install-script threshold | Script-only recall well above 1/28 at 0.19; `ben_scripts` false alarms stay 0; non-script scores identical to suggestion 2 | Met: 7/36 script-only; 0/64 `ben_scripts`; 964/964 flags match the independent recomputation |

The thresholds were not tuned on the test split. The 0.45 script threshold
comes from the v2 measurement; it still needs a validation split before a live
run.

## Running the harness

The harness reads the pinned v2 sets under `~/pg-v2`, built by
`experiments/v2/scripts/`. The official v2 baseline is the recorded one in the
section above; the harness is used to evaluate each new build against the same
frozen sets, not to replace that record.

```bash
python3 -I experiments/v3/scripts/run_v3.py \
    --work ~/pg-v2 \
    --datadog ~/packguard-data/datadog \
    --index ~/pg-v2/index.json \
    --packguard build/packguard \
    --tag v3-full \
    --min-js 256 \
    --js-threshold 0.19 \
    --script-threshold 0.45

python3 -I experiments/v3/scripts/analyze_v3.py \
    --work ~/pg-v2 \
    --out experiments/v3/results \
    v3-full

python3 -I experiments/v3/scripts/inspect_false_alarms.py \
    --work ~/pg-v2 --tag v3-full --threshold 0.19
```

`--min-js 0` and `--no-boilerplate` (which passes `-b 0`) give the ablation
modes. `--js-threshold` adds `-t` and `--script-threshold` adds `-s`.

Each tag writes `reports/<tag>/`, `reports/<tag>.log` and
`reports/<tag>.run.json`. The analyzer writes `summary.csv`, `packages.csv` and
`chunks.csv`. `chunks.csv` keeps the file, kind, byte length, NCD and matched
reference of every scored chunk, which is what attributes a false alarm to a
reference chunk. `inspect_false_alarms.py` prints the lowest non-ignored chunks
of every benign package at or below a threshold, with the matched reference and
the start of the target text.

`analyze_v3.py` understands reports from before v3: without a `kind` field it
treats `package.json` and `install_scripts.txt` as install scripts and every
other file as JavaScript. That lets the recorded v2 reports and a v3 build be
analyzed by the same code.

All runs happen inside WSL. Malware is never extracted on Windows.
