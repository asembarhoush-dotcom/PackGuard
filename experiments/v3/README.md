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

## What v3 accepts

| Suggestion | Acceptance against the recorded baseline |
|---|---|
| 1. Tiny JS chunks ignored | At most 5/400 false alarms at 0.19 and 8/400 at 0.30; recall at least 9.0% / 11.5%; install-script chunks never ignored |
| 2. Boilerplate references dropped | Stub-driven false alarms disappear or fall below 0.19; no malicious score rises above the threshold; recall unchanged |
| 3. Separate install-script threshold | Script-only recall well above 1/28 at 0.19; `ben_scripts` false alarms stay 0; non-script scores identical to suggestion 2 |

Thresholds are tuned on validation data only, never on the test split.

## Running the harness

The harness reads the pinned v2 sets under `~/pg-v2`, built by
`experiments/v2/scripts/`. It never rebuilds or rescans the v2 baseline.

```bash
python3 -I experiments/v3/scripts/run_v3.py \
    --work ~/pg-v2 \
    --datadog ~/packguard-data/datadog \
    --index ~/pg-v2/index.json \
    --packguard build/packguard \
    --tag v3-baseline \
    --min-js 0

python3 -I experiments/v3/scripts/analyze_v3.py \
    --work ~/pg-v2 \
    --out experiments/v3/results \
    v3-baseline
```

Each tag writes `reports/<tag>/`, `reports/<tag>.log` and
`reports/<tag>.run.json`. The analyzer writes `summary.csv`, `packages.csv` and
`chunks.csv`. `chunks.csv` keeps the file, kind, byte length, NCD and matched
reference of every scored chunk, which is what attributes a false alarm to a
reference chunk.

`analyze_v3.py` understands reports from before v3: without a `kind` field it
treats `package.json` and `install_scripts.txt` as install scripts and every
other file as JavaScript. That lets the recorded v2 reports and a v3 build be
analyzed by the same code.

All runs happen inside WSL. Malware is never extracted on Windows.
