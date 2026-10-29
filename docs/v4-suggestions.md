# Stage 1 suggestions for v5: keep mangled-known recall, catch new campaigns

Scope: **stage 1 only**. Stage 2 (the ModernBERT filter) is owned by the AI-filter work and is out of scope here. v4 targeted known malware that has been renamed or mangled, and is now merged in [`experiments/v4/`](../experiments/v4/README.md). v5 provides **two modes in one tool**: a known/mangled mode with the proven v4c2 settings, and a new-campaign mode with separate settings.

The short version: v4c2 is a strong near-duplicate detector, not a new-campaign detector. Use it unchanged as the known/mangled mode. For new campaigns, use a different score composition: raw NCD plus a small, explainable behavioural-primitive channel over JavaScript and install scripts, with its own calibrated threshold. Stage 2 owns false alarms; stage 1 does not trade known-mangled recall for a lower false-alarm rate.

Status (2026-10-28): both modes are implemented. The selected stage-1 thresholds are known 0.62 JavaScript / 0.50 scripts and new 0.50; stage 2 is built and filters false alarms. Known/mangled mode at 0.62 gives 441/480 (91.9%) on the v4 benchmark with 82/232 (35.3%) benign; `mal_known` alone is 195/200 (97.5%). New-campaign mode at 0.50 gives 375/500 (75.0%) on new campaigns with 77/464 (16.6%) benign. The Rust CLI/TUI wrapper is in `frontend/`. Full results and the tuning recommendation are in [`experiments/v5/`](../experiments/v5/README.md).

## What the data says

All numbers are from the frozen v2 sets, the merged v4 results in [`experiments/v4/`](../experiments/v4/README.md), the v3 results in [`experiments/v3/`](../experiments/v3/README.md), and the WSL run of the v4c2 build on the v2 time split; stage 2 is not involved.

### v4 known-mangled benchmark

The v4 benchmark is 712 transformed packages: 480 malware variants (50 `mal_known`, 35 `mal_newver`, 35 `mal_newname`, each in T1–T4) and 58 benign packages per tier. T1 reformats, T2 renames identifiers, strings, numbers and files, T3 inserts 18 KiB of dead code, T4 base64-encodes whole files.

| Tier | v3 at 0.19 | v4c2 at 0.19 | v4c2 at 0.30 | v4c2 at 0.50 | v4c2 benign at 0.19 |
|---|---|---|---|---|---|
| T1 format | 15.8% | **90.8%** | 92.5% | 95.0% | 5.2% (3/58) |
| T2 rename | 0.8% | **90.0%** | 91.7% | 94.2% | 5.2% (3/58) |
| T3 padding | 22.5% | **30.0%** | 44.2% | 68.3% | 0% |
| T4 base64 | 0% | **48.3%** | 72.5% | 85.8% | 0% |
| **All** | **9.8%** | **64.8%** | **75.2%** | **85.8%** | **2.6% (6/232)** |

The normalised view is the main win: it set the package score for 405 of the 480 variants, and the exact normalised hash matched 211. This is the result v5 must keep. The v4 path is opt-in (`-c 2 -n 1 -e 1`); the scanner defaults still reproduce v3, so the normalised scoring can be changed without touching the v3 path.

### v4 on new campaigns: the gain is a threshold artefact

The same v4c2 build was run on the v2 time split: 500 malware packages published after the reference cutoff, 462 benign reports (400 general, 62 scripted with a score; the v2 `ben_scripts` set has 64). These reports already exist in `~/pg-v2/reports/newcamp-v4c2`; they are a local WSL measurement and are not part of the committed v4 results.

| Build / score | TPR at 0.19 | TPR at 0.30 | TPR at 0.50 | Benign at 0.19 |
|---|---|---|---|---|
| v3 raw NCD | 9.8% (49/500) | 10.8% | 15.0% | 1/462 (0.2%) |
| v4c2 `min(raw, normalised)` | **33.2% (166/500)** | 34.2% | 55.6% | **84/462 (18.2%)** |

At the same threshold, v4c2 looks much better. At the same **benign false-alarm rate** it is not:

| Score | AUC | TPR at 1% FPR | at 5% | at 10% | at 20% |
|---|---|---|---|---|---|
| Raw NCD | 0.68–0.70 | 11.0% | 14.2% | 21.4% | 42.2% |
| Normalised NCD, exact hashes removed | 0.47 | 0.9% | 5.2% | 8.9% | 21.2% |
| `min(raw, normalised)` | 0.61 | not usable at 1–10% | — | — | — |

The `min` view cannot operate at a low false-alarm rate because 82 benign packages score exactly 0: their normalised text is byte-identical to a reference chunk. That is 17.7% of all benign packages and 20.5% of those with JavaScript. The same happens to 160 malicious packages. At 0.19 the `min` view reaches 33.2% TPR but flags 18.2% of benign packages; raw NCD at the same 20% false-alarm rate catches 42.2%. The normalised exact hash is therefore the source of both the apparent new-campaign gain and the false alarms. Normalised NCD without the exact hash is close to random on new campaigns (AUC 0.47); it is a rename detector, not a general similarity measure.

### Why a size cutoff is not the fix

Ignoring every normalised exact match whose reference file is 256 bytes or less removes many false alarms, but it also removes real detections:

| v4 benchmark | v4c2 | Ignore exact matches to refs ≤256 B |
|---|---|---|
| T1 recall at 0.19 | 90.8% | 77.5% |
| T2 recall at 0.19 | 90.0% | 74.2% |
| T1/T2 benign at 0.19 | 3/58 each | 1/58 each |

The small references include genuine 80–150 byte payloads (`require("child_process").exec("curl …")`), not only stubs. A stub that is identified by its **content**, not its size, is the right filter.

### The signal that does generalise to new campaigns

On the 500 new-campaign malware and 462 benign packages, generic malicious primitives are common in malware and rare in benign code. Package-level prevalence:

| Primitive in JavaScript | Malware (464 with JS) | Benign (400 with JS) |
|---|---|---|
| `child_process` | 48.7% | 4.0% |
| `exec` / `execSync` | 42.9% | 11.5% |
| `os.userInfo` | 25.2% | 0.2% |
| `os.hostname` | 33.2% | 0.2% |
| webhook / OAST / Telegram / ipify | 32.3% | 1.5% |
| `nslookup` / DNS resolution | 6.2% | 0.2% |
| base64 / `atob` | 28.0% | 6.8% |
| `_0x…` obfuscation | 6.5% | 0% |
| `hostname` **and** a URL | 28.0% | 0.2% |
| webhook **and** `child_process` | 16.8% | 0% |
| `os.userInfo` **or** `hostname` | 33.2% | 0.4% |

Install scripts are even cleaner. Of 500 malware packages, 360 have install scripts; 67 of 462 benign packages do. A simple rule — a URL, DNS lookup or webhook **and** a host/user/environment read, shell call, base64 or `.ssh`/`.env` path — flags 74/500 malware (14.8%) and **0/464** benign packages. It flags 24 of the 36 script-only malware packages; adding NCD at 0.45 takes script-only recall from 7/36 to 27/36.

Combining the raw NCD score with the script rule and one JavaScript rule (`os.hostname` + network) gives, at the raw 0.19 threshold:

| Union | Malware recall | Benign false alarms |
|---|---|---|
| Raw NCD only | 49/500 (9.8%) | 1/462 (0.2%) |
| Raw + script rule | 123/500 (24.6%) | 1/462 (0.2%) |
| Raw + JS rule | 184/500 (36.8%) | 2/462 (0.4%) |
| Raw + script + JS | **239/500 (47.8%)** | **2/462 (0.4%)** |

The JS rule in this table is `os.hostname` plus a URL, webhook or DNS lookup. At a matched false-alarm rate the same union reaches TPR 48.6% at 1% FPR and 50.2% at 5% FPR, against 11.0% and 14.2% for raw NCD. These features were inspected on the frozen test sets, so they are **exploratory**: v5 must choose the feature set and weights on a separate validation split before quoting a test number.

### Smaller gaps worth keeping visible

- **Tiny packages.** 42/500 new-campaign malware have only JavaScript chunks under 256 bytes (17 `mal_shape`, 25 `mal_stream`). v3 marked 3 and 11 as `low_confidence`; v4c2 marks 0 and 1, because a normalised stub match gives the package a score and clears the flag. That hides the uncertainty instead of resolving it.
- **Script-only packages.** 36/500 new-campaign malware carry the attack only in `package.json`. v3 and v4c2 both catch 7/36 at the 0.45 script threshold.
- **Copied libraries.** The v4 benchmark's third benign false alarm is `mime-db` matching a 1,575-byte `bcrypts-js` file. v1 had `supertest` matching `eslint-supertest`, and v2 had `body-parser` matching `boby_parser`. Normalisation cannot fix this; a known-benign reference can.

## Ranking

| Rank | Suggestion | What it changes | Expected effect | Cost |
|---|---|---|---|---|
| 1 | v5 benchmark with per-mode scoring, a validation split and a larger benign set | Nothing by itself; makes every other idea measurable | Decides the v5 scope | Medium (Python, WSL) |
| 2 | Lock the known/mangled mode to v4c2 | No reference-stub filter; keep every normalised reference; stage 2 handles false alarms | Reproduces v4's T1/T2/T3/T4 exactly | None (settings only) |
| 3 | Install-script primitive score | Network + host/user/environment/shell/base64 features over `install_scripts.txt` | 74/500 new malware with 0/464 benign; script-only 7/36 → 27/36 | Low (C string scan) |
| 4 | JavaScript primitive score | The same generic features over JavaScript, as a weighted score not a single hard rule | JS rule alone: 37.6% TPR at 1% FPR; with the script channel: 47.8% new-campaign recall at 0.4% false alarms | Low–medium |
| 5 | Known-benign references or a benign margin | Exact benign hash veto plus a malware-versus-benign NCD margin in the grey band | Removes copied-library false alarms, allows a lower threshold | Medium (load and memory) |
| 6 | Tiny-package path and `low_confidence` preservation | Character/token n-gram index for all-tiny packages; never clear `low_confidence` on a stub match | 3/8 tiny variants → at least 6/8 | Low–medium |
| 7 | Reference recency and rolling updates | Measure recall against reference age; test a recent-window reference set and daily updates | Raises real-world catch after first sight; sets the update cadence | Low code, data work |
| 8 | LZJD or token n-gram similarity as a new-campaign score | Expose the best LZJD/token-shingle score already computed by the prefilter; calibrate it | Uncertain; may add signal where long substrings differ | Low–medium |
| 9 | T3/CDC tuning and function-level matching | Known-family only: smaller maximum chunk, overlap, snippet view; do not apply CDC to the raw view | T3 30.0% → higher at equal false alarms | Medium |
| 10 | Deferred: AST canonicalisation, compressor/settings selectors, more examples per shape, hard aggregation, stage 2 | — | Little headroom on the measured data | — |

## 1. v5 benchmark and per-mode scoreboard

Build this before any scanner change. The v4 harness answers "how many are below 0.19"; v5 must answer "at what benign false-alarm rate".

- Keep the v4 T1–T4 set as a **regression** benchmark. v5 must reproduce v4c2's T1/T2 results at the same false-alarm rate and report T3/T4 separately.
- Keep the v2 time split (`mal_shape` 300, `mal_stream` 200, `ben_general` 400, `ben_scripts` 64) as the new-campaign test. Add a family-held-out split, so a detection is not a renamed copy of a reference package; the v1 leave-family-out method is the template.
- Add a **validation split** by date or by family for every tunable: normalised thresholds, primitive weights, script threshold, tiny threshold. The test split is read once.
- Report TPR at 0.5%, 1%, 2%, 5% and 10% benign FPR, plus AUC, per category, per tier, per size bucket and for the script-only and all-tiny subsets. Report the threshold that produced each point.
- Expand the benign controls before trusting the primitive rules: at least 1,000 benign packages and 500 benign scripts, including packages that legitimately use `os.hostname`, webhooks, `child_process` and telemetry. The current 400 general and 67 scripted benign packages are too few for a 0.2% false-alarm rate.
- Record per-channel evidence: raw NCD, normalised NCD, exact-hash match, matched reference package/group, script features, JS features. Stage 2 consumes these later, but stage 1 does not tune on stage 2.

**Acceptance:** two tables, one per mode, each at its own settings and threshold. Do not compare the two modes at one shared NCD threshold. False alarms are reported for stage 2, not used to trade away known-mangled recall. The existing `~/pg-v2/reports/newcamp-v3` and `newcamp-v4c2` runs are the starting point; the v3 harness already accepts `--scanner-arg` for the v4 flags.

## 2. Two modes with separate settings

The tool keeps two profiles in one binary. The mode selects the score composition and the calibrated threshold; it is not a per-package choice.

### Known / mangled mode

- Use the proven v4c2 settings unchanged: `-c 2 -n 1 -e 1 -b 1 -t 0.19 -s 0.45`.
- Keep every normalised reference. Do not apply a content or frequency filter to it.
- Stage 2 owns false alarms; do not lower recall to reduce them.
- **Acceptance:** reproduce v4c2's T1/T2/T3/T4 and the v1 anchors; no reference-stub filtering.

### New-campaign mode

- Use raw NCD plus the install-script and JavaScript primitive score.
- Do not use the normalised exact hash as a generic new-campaign trigger; it is a rename detector.
- Calibrate a separate threshold on new-campaign validation data; do not inherit 0.19.
- Stage 2 owns false alarms.
- **Acceptance:** the measured new-campaign TPR at the chosen threshold, with per-feature evidence in the report.

The reference-stub filters were measured and rejected: the content filter cost T2 1/30 and new-campaign 4/125; the size + frequency gate cost T1 1/30, T2 2/30 and new-campaign 23/125. Neither is used.

## 3. Install-script primitive score

The script channel is separate, cheap and currently underused: NCD at 0.45 catches 7/36 script-only packages. Replace the single NCD threshold with a small deterministic score over the `install_scripts.txt` text:

- Network: URL, IP literal, webhook/OAST/Telegram/Discord/ipify, `nslookup`.
- Host or identity read: `hostname`, `whoami`, `os.userInfo`, `process.env`, `homedir`, `USERDOMAIN`.
- Sensitive paths: `.ssh`, `.aws`, `.npmrc`, `.git-credentials`, `.env`, wallet files.
- Execution: `child_process`, `exec`/`execSync`, a pipe to `sh`/`bash`, `node -e` with network.
- Encoding: base64, hex, `Buffer.from`, long encoded runs.

Use a weighted score with a threshold, not a single hard rule, so the false-alarm rate can be tuned. Require a combination (network **and** an exfiltration/execution feature) rather than a single keyword. Benign scripts in the v2 set use `node -e "try{require('./scripts/postinstall.js')}catch(e){}"`; these must stay below the threshold.

**Acceptance:** script-only recall 7/36 → at least 15/36 (the measured rule alone flags 24/36, and 27/36 when combined with NCD at 0.45); report the benign-script false-alarm rate for stage 2; no regression on the v4 benchmark; the report carries the script score and the matched features.

## 4. JavaScript primitive score

Apply the same features to JavaScript text, as a weighted score. This is the main new-campaign lever in the measured data:

- `os.hostname` with a URL or webhook: 28.0% of new malware, 0.2% of benign.
- `os.userInfo` or `os.hostname`: 33.2% of new malware, 0.4% of benign.
- webhook plus `child_process`: 16.8% of new malware, 0% of benign.
- `.ssh`/`.aws`/`.env` reads plus `exec`: 6.8% of new malware, 0.2% of benign.
- `_0x…` obfuscation: 6.5% of new malware, 0% of benign.

Keep it small and explainable. Do not use a learned model here; stage 2 owns that. Do not flag `exec` or `process.env` alone: they are common in benign build tools (11.5% and 12.0% of benign packages). Require the combination.

**Acceptance:** new-campaign TPR at 1% FPR at least 30% (stretch 45%), at 5% FPR at least 40% (stretch 50%); report the benign-package false-alarm rate for stage 2; v4 known-mangled recall unchanged; per-feature evidence in the report.

## 5. Known-benign references or a benign margin

Normalisation and the primitive rules both increase the chance that benign code matches something. The copied-library false alarms are the clearest case: `mime-db` matching `bcrypts-js`, `supertest` matching `eslint-supertest`, `body-parser` matching `boby_parser`.

- Build a benign reference set from packages held out of the test split, never from the test benign set.
- Exact veto: a Bloom filter or hash set of raw and normalised benign chunks. If a target chunk is byte-identical to a known-benign chunk, it cannot set a malware score. This is cheap and removes the copied-library class at the source.
- Near match: compute the best benign NCD only for packages whose malware score is in the grey band, and require a margin before flagging. Do not run benign NCD for every package.
- Also useful for the future `compromised_lib` category: the clean upstream version is the benign reference.

**Acceptance:** `mime-db`, `supertest` and `body-parser` stop being flagged; no loss on the known-malware anchors; new-campaign false alarms at 0.19 at most 1/400; at a fixed FPR the primitive-channel TPR does not fall.

## 6. Tiny-package path and `low_confidence`

Tiny packages are still a gap, and v4's normalised view hides it: a stub match gives an all-tiny package a score and clears `low_confidence`. Keep the flag whenever the only evidence is a tiny or stub chunk.

Options, cheapest first:

1. For an all-tiny package, score the largest chunk with a character 4-gram Jaccard or MinHash against a tiny-reference index, and keep `low_confidence`.
2. Add a tiny-reference index with a stricter threshold used only for all-tiny packages. Do not lower the global threshold.
3. Report the tiny score separately so the case stays measurable.

**Acceptance:** tiny (<256 B) known-variant recall 3/8 → at least 6/8; report the benign false-alarm rate for stage 2; every all-tiny package still has a score; non-tiny packages are unchanged.

## 7. Reference recency and rolling updates

New campaigns are missed partly because the references are older than the attack. This does not change the algorithm, but it changes the real-world catch and the update cadence.

- On the time split, measure TPR at a fixed FPR for references cut off 1, 3, 6 and 12 months before the test. Report the decay.
- Test a recent-window reference set (for example the last 12 months) against the full set. The v2 ratio experiment showed that more examples per code shape do not help; recency is a different axis.
- For the live scan, update the references on a fixed schedule and record the reference timestamp in the report. The reference cache from [v4 suggestion 9](v3-suggestions.md#9-reference-cache-and-report-fields) becomes useful here.

**Acceptance:** a measured recall-versus-reference-age curve, the load/memory cost of the chosen window, and no regression on the v4 benchmark.

## 8. LZJD or token n-gram similarity as a new-campaign score

The prefilter already computes an LZJD digest for every chunk. Expose the best LZJD similarity and calibrate it as a second score. A token 4-gram MinHash/Jaccard over the normalised stream is the other candidate: it can find shared API sequences when long substrings differ.

This is a research idea, not a certain win: normalised NCD without the exact hash is near random on new campaigns (AUC 0.47), and raw NCD is 0.68. Compare the candidate against raw NCD at the same FPR. If it does not beat raw NCD, keep it as a prefilter only.

**Acceptance:** a measured AUC/TPR improvement over raw NCD at a fixed FPR, or a clear negative result that closes the idea.

## 9. T3/CDC tuning and function-level matching

T3 is the weak spot in the known-mangled result: 30.0% at 0.19. This is known-family work, not new-campaign work.

- Try smaller maximum chunk sizes, overlap, and a function/snippet view over the normalised stream.
- Do not apply CDC to the raw view: the v4 ablation showed it reduces T3 recall (22.5% → 16.7%) because the fixed overlapping windows keep a mostly original chunk after the padding.
- Keep the 64 KiB LZMA dictionary at least twice the maximum chunk.

**Acceptance:** at least +10 points T3 recall at equal false alarms; no T1/T2/T4 regression; load and scan time reported.

## 10. Deferred

- **AST canonicalisation with tree-sitter.** v4 already solves T1/T2 with a token normaliser; the cost is high and the new-campaign gain is unproven.
- **Compressor, chunk-size and compression-settings selectors.** v1/v2 measured little headroom.
- **More examples per code shape.** v2 showed no detection gain, only load time and memory.
- **Hard aggregation rules** (two chunks, two reference packages). v3 measured roughly half the recall at 0.19.
- **Stage 2.** Out of scope for this ranking; stage 1 should only expose clean per-channel scores and evidence.

## Order

1. Benchmark, per-mode scoreboard, validation split and larger benign controls (1).
2. Lock the known/mangled mode to v4c2 exactly (2); no reference-stub filter.
3. Add `--mode known|new` to the CLI and make `known` the v4c2 profile.
4. Install-script primitive score in the `new` mode (3).
5. JavaScript primitive score in the `new` mode (4).
6. Optional known-benign margin for the `new` mode (5).
7. Tiny-package path, reference recency, LZJD/token similarity and T3/CDC tuning as time allows (6–9).
8. Wrap the CLI in the Rust TUI; the TUI selects the mode and passes the profile to the same binary.

## Acceptance for v5

- **Known / mangled mode:** exactly the v4c2 settings. Reproduce T1 90.8%, T2 90.0%, overall 64.8%, T3 30.0%, T4 48.3% at 0.19; no v1 anchor regression (50/50 known, 32/35 renamed, 23/35 new versions, 0/75 benign); no reference-stub filtering.
- **New-campaign mode:** its own calibrated threshold and score composition. Report TPR and FPR separately; script-only 7/36 → at least 15/36; every number from the test split, with features and thresholds chosen on validation.
- **Modes:** `--mode known|new`; the modes share the scanner and report format but not their score composition or threshold. Do not compare them at one shared NCD cutoff.
- **False alarms:** report them for stage 2; they are not a stage-1 release gate. The known mode keeps v4c2's reported false-alarm rate; the new mode reports its own.
- **Cost:** report load time, peak memory, wall time and the share spent in the primitive channel. The primitive channel should be a small fraction of scan time; the benign reference set is the main new cost.
- **Safety:** no sample is executed; malware stays inside WSL and encrypted archives.

## A note on the trade-off

The known / mangled mode stays on the v4c2 NCD and normalised path because v4 proved it; that mode does not trade recall for false alarms. The new-campaign mode adds the behavioural-primitive channel because raw NCD alone catches about 10% at 0.19 and the normalised view is near random for new campaigns. The two modes share the scanner and report format but not their score composition or thresholds. Stage 2 handles false alarms; stage 1 optimizes recall for each mode. If the new mode must stay pure NCD, reference recency is the realistic lever and the new-campaign target should be lowered accordingly.
