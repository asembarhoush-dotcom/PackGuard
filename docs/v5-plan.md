# v5 consolidation plan: dataset, scoreboard, methods, speed

v5 is the consolidation release: one binary, two modes, a frozen benchmark, and a final report. The target is known/mangled npm malware at **95% recall and about 5% false alarms**, with new-campaign detection kept at or above the current level. If 95/5 is not reached, v5 reports the Pareto frontier and stops; it does not tune forever.

## Definition of done

- **Known / mangled:** at least 95% recall at no more than 5% benign false alarms on a frozen held-out npm set. Current NCD-only ceiling: 82.7% all-known at 5% FPR (89.5% `mal_known`); at 0.62 it is 91.9% all-known with 35.3% benign.
- **New campaigns:** at least 75% recall at no more than 10% false alarms, and ideally 5%. Current new mode: 75.0% at 0.50 with 16.6% benign.
- **Speed:** load and scan within a stated budget. Current full runs on 4 cores: known-v4 450 s, new-v4 390 s, known-newcamp 450 s, new-newcamp 330 s; raw load 55.5 s and normalised load 14.7 s for the v1 references. Set a per-package and peak-memory budget before adding AST or two-model compression.
- **Reproducible:** one command per mode, frozen splits, committed results. The CLI/TUI reads the same reports.
- **Stop rule:** if the method ladder does not reach 95/5, publish the best Pareto point (recall vs FPR vs time) and stop. That is a result, not a failure.

## Use the .js advantage

Only JavaScript means one parser, one AST and one set of API patterns instead of a zoo of binary formats. Exploit it:

- canonical function fingerprints and AST subtrees, not just byte chunks;
- API-call and `require`/`import` sequences;
- string/URL/domain extraction;
- `package.json` install scripts and metadata;
- a JS-specific normaliser and lexer.

Keep `.cjs`, `.mjs` and install scripts. Many npm attacks live in `preinstall`/`install`/`postinstall`; do not restrict the scanner to `.js` alone. The v4 normaliser and install-script channel already handle this.

## Dataset expansion (do this first, freeze it, then tune)

### First step: inventory and freeze

Do this before downloading anything new:

1. Create a v5 work root, for example `~/pg-v5/`, with `manifest/`, `refs/`, `targets/`, `reports/` and `frozen/`.
2. Index the current DataDog corpus and print the stats:
   ```bash
   python3 -I experiments/v2/scripts/build_dataset.py index \
       --datadog ~/packguard-data/datadog --index ~/pg-v5/index.json
   python3 -I experiments/v2/scripts/build_dataset.py stats --index ~/pg-v5/index.json
   ```
3. Freeze the current test sets. Copy the manifests and target lists of the v1 detailed set, v2 time split, v4 mangling benchmark and the new-campaign sets into `~/pg-v5/frozen/`; record file hashes. Never merge new data into those test sets.
4. Build `~/pg-v5/manifest.csv` with one row per package: source, category, package name, version, publish date, code shape, family, label, split (`reference`, `validation`, `test`) and provenance. The split is by time and family, not random.
5. Only then start collecting. Expand the benign side first; it is safe, cheap and defines the 5% false-alarm rate. Add malware families and time slices second, then dedup.

### Malicious sources

- DataDog `malicious_intent` npm packages (the current v1/v2 sets): more packages, more families, newer campaigns.
- OSSF malicious-packages reports and npm security advisories.
- Backstabber's Knife Collection and MalwareBench (access on request).
- `compromised_lib` samples, once a clean upstream version is available for the diff.
- npm takedowns, Snyk/GitHub Advisory entries, and security-research PoCs (label PoCs separately).

### Benign sources and hard negatives

The benign side is what decides the false-alarm rate. Expand it more than the malware side:

- popular npm packages and long-tail packages, with `.js`/`.cjs`/`.mjs` and `package.json`;
- packages with install scripts, native builds and CLI wrappers;
- minified/bundled code, TypeScript stubs, re-export stubs, source maps;
- copied-library cases (a package shipping an old copy of another library);
- telemetry/build tools that use `hostname`, `process.env`, `child_process` and network APIs.

The current 400 general + 67 scripted benign packages are far too few for a 5% claim.

### Splits and leakage

- **Time split:** references before a cutoff; tests after it. Preserve the v2 precedent (2026-04-01 cutoff) and extend it.
- **Family-held-out:** remove a whole code-shape family or package name from the references; test on it. This measures known-family robustness, not memorisation.
- **Validation/test separation:** tune every feature, threshold and weight on validation; read the test split once. Do not repeat the same test to “smash ways.”
- **Dedup:** remove exact and near-duplicate code shapes across the split. The v1/v2 `shape` key (strings, numbers, comments and `_0x` names blanked) is a good start.
- **Ratios:** at most a fixed number of packages per code shape and per name, and keep both earliest and newest samples where they matter. The v2 ratio experiment showed more examples per shape do not help nearest-neighbour NCD; they may help a learned feature model, so measure.
- **Label quality:** DataDog `malicious_intent` includes test/PoC packages. Classify `malicious_intent`, PoC, compromised and benign-test separately; do not let one category dominate the recall number.
- **Storage/safety:** encrypted zips only in git; extract in WSL; never execute samples; keep dataset_index.md current.

### Dataset size is not the goal

More packages only help if they add **families, transformations and hard benign cases**. A million clones of one campaign will not move the 5% FPR. Track family count, code-shape count, time span and benign hard-negative count, not just package count.

## Fixed-FPR scoreboard

Every method is judged on the same frozen split:

- TPR at 1%, 2%, 5% and 10% FPR; AUC; precision at the chosen point;
- per family, per tier/transform and per size bucket;
- load time, scan seconds per package, peak memory;
- the exact feature set and threshold used;
- a validation score and a test score, reported separately.

The current NCD-only curve is the baseline: 82.7% all-known at 5% FPR, 89.5% `mal_known`, AUC 0.9176. A method is kept only if it improves the fixed-FPR score or reduces time; feature count is not a virtue.

## Method ladder

1. **Two-class compression likelihood ratio.** Malware dictionary `M`, benign dictionary `B`; score `C(x|B) - C(x|M)` or the ratio; family dictionaries if one global `M` is too broad. This is the published Alshahwan/Asadi/Lai route and the most likely way to the 95/5 region.
2. **Compressibility features.** `C(x)/len(x)`, entropy, compression ratio; combine with NCD/LZJD in a small classifier.
3. **LZJD containment / SHWeL.** Already computed for the prefilter; use phrase-set containment and class-imbalance weighting.
4. **AST / function-level fingerprints.** Canonical function hashes or AST subtrees; one matching function survives padding, split/merge and reordering. ZipAST is the closest JS reference.
5. **Encoded payload views.** Recursive base64/hex/char-code/gzip and `eval`/`Function` wrappers; score the decoded text as a separate view.
6. **Benign veto / margin.** Exact benign hash veto plus a malware-versus-benign NCD margin; removes the 2.6% exact-zero floor and copied-library false alarms.
7. **Metadata and primitives.** Install scripts, API calls, package name/version, repository presence, publication age; independent of NCD.
8. **Feature fusion.** A logistic regression or shallow tree over the features above, calibrated to a 5% FPR target. This is the final scorer, not stage 2’s deep model.

Keep the order: the two-class compression score changes the ROC; the later features improve it. Do not start with a large model.

## Speed budget and keep/drop rule

- Set explicit limits before the ladder, for example: load ≤120 s, scan ≤2 s per package, peak memory ≤3 GB, on the 4-core WSL machine. Adjust once, then hold them.
- Two-model compression means two dictionary compressions per chunk; it is cheaper than NCD against the full reference set.
- LZJD is the fast similarity path; AST parsing is the expensive one. Run AST/function-level features only on JavaScript files and, if needed, only in the grey band where the cheap score is ambiguous.
- Keep a method if it improves TPR@5% FPR by a meaningful margin within the budget, or reduces time at the same score. Drop it otherwise. Record the ablation in `experiments/v5/`.

## Phases

0. **Dataset:** expand malicious and benign sets, classify labels, dedup, freeze validation/test and family-held-out splits. Update `dataset_index.md`.
1. **Two-class compression:** dictionaries `M`/`B`, likelihood-ratio score, compressibility features, calibration at 5% FPR. This is the main experiment.
2. **T3:** LZJD containment and AST/function-level fingerprints; measure on the padded/structural transforms.
3. **T4:** encoded views and recursive decoding; measure on base64/hex/char-code.
4. **Precision:** benign veto/margin, metadata/primitives; cut the false-alarm floor without lowering recall.
5. **Fusion:** small calibrated classifier; final speed pass; CLI/TUI; frozen benchmark and report.

## What would count as “invented”

No paper found reports 95% recall at 5% FPR on known/mangled npm packages with a compression-only stage 1. The published ingredients are two-class compression (Alshahwan/Asadi/Lai), LZJD/SHWeL, ZIP/AST compression, and npm feature detectors. The v5 contribution is the **combination for npm JavaScript at a fixed 5% FPR**, with a speed budget and an open benchmark. That is a real contribution even if the final number lands at, say, 92% at 5% rather than 95%.
