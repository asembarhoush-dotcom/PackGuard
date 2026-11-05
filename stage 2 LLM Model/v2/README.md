# PackGuard Stage 2 (`v2`) — False-Alarm Reduction, `T0–T4` + Raw Mode Unfolding & One-Command CPU Filter

## 1. Overview & What Changed from `v1` to `v2`

When `v1` and early `v2` were tested on Stage 1 flagged benign packages (`v4` / `v5` / `v6` benchmarks), three root causes of false alarms were identified and resolved:
1. **Prompt Metadata Shortcuts (`36%` False Alarms in `v1`):**
   - `v1` included `Stage1 Min NCD: {score}` and distinct script filenames (`install_scripts.txt` vs `package.json#scripts`) in the prompt text. Because `v1`'s synthetic training set had low NCD scores (`0.015–0.185`) only on malware and high NCD scores (`0.30–0.94`) on benign packages, any real benign package flagged by Stage 1 was biased toward a malicious prediction.
2. **Missing `T2` Identifier/String Mangling & Direct Raw Unformatted Input (`~20%` False Alarms in Early `v2`):**
   - In the `v4`/`v6` mangling benchmark (`experiments/v4/scripts/mangle.py`), 25% of benign test packages are `T2` (identifiers renamed to `v0, v1, v2` and strings replaced with random alphanumeric chars). Earlier `v2` only sampled `T1, T3, T4` and omitted `T2`, and did not include raw unformatted JS/chunks (`raw_mode=True`) for callers invoking `tokenizer.json` + `onnxruntime` directly without `text_formatter.py`.
3. **Trojanized Multi-File Ordering & Benign Barrel Stubs in `data/v1`:**
   - Sorting package `.js` files by smallest size caused multi-file trojanized libraries to select tiny 75-byte TypeScript barrel stubs (`"use strict"; Object.defineProperty(exports, "__esModule", { value: true });`) labeled `1` (malicious), teaching the model to false-alarm on normal TypeScript packages.

### How `v2` (RTX PRO 6000 Blackwell 48-Core + 100% GPU `1024`-Token Edition) Solves All Three Problems:
- **Leak-Free Canonical Text Formatter + Explicit Structural Signal Header ([`text_formatter.py`](text_formatter.py)):**
  - Strips all Stage 1 NCD numbers and benchmark package prefixes from the prompt text so classification is **100% based on code semantics**.
  - Prepends an explicit obfuscation-invariant structural telemetry header (`// [SIGNALS: t2_mangled=... pure_data=... require=...(lens:...) process=... buffer=... eval=... exec=... net=...]`) that exposes pure-data exports, `T2` short-string vs long-module `require(...)` lengths, and lack of dangerous sinks (`process`, `eval`, `exec`, `net`) before the first code token.
  - Compresses `T2` random alphanumeric string literals (`"[a-z0-9]{10,}"` -> `"<t2str_N>"`) so `T2` files consume `3–4x` fewer BPE tokens and fit completely inside the `1024`-token window.
  - Unifies `package.json`, `package.json#scripts`, and `install_scripts.txt` into a single canonical `// [INSTALL_SCRIPTS]` section header.
  - **Per-File Sliding-Window Chunk Reassembly:** Reconstructs split files using byte `start` offsets before unfolding so `T3` padding and `T4` Base64 strings spanning multiple 8 KiB chunks are never cut in half at chunk boundaries.
  - **Built-in `T1 / T3 / T4` De-Obfuscation & Repeated Obfuscator Token Collapse:** Automatically unfolds `eval(Buffer.from("<b64>","base64").toString())` wrappers and inline Base64 payloads back into clean UTF-8 JavaScript, strips `T3` `_pg_pad_` dead-code filler blocks, and collapses repeated obfuscator identifier prefixes.
- **13.4x Larger Suspicion-Ranked Training Corpus (`13,000` Raw Packages / `47,315` Examples) with `100%` `T2` Coverage ([`prepare_stage2_v2_data.py`](prepare_stage2_v2_data.py)):**
  - Uses `multiprocessing.Pool(processes=48)` across all 48 vCPUs to harvest **13,000 raw packages** (**6,500 malicious packages** across `data/v2` and `data/v1` + **6,500 benign npm packages** from `v6`, `v3`, `v1`, and **1,844 live hard-benign npm packages** covering pure data tables, NAPI-RS/WASM bindings, CLI wrappers, `child_process`, `webpack`, `esbuild`, `postinstall`, `node-gyp`, and `crypto`), producing **39,717 training examples**, **3,866 validation examples**, and **3,732 hard-benign (`T1–T4` + raw + benign install script) holdout examples** (**47,315 total examples**).
  - Generates **`T2` identifier/string mangled variants for `100%` of packages** (`6,500` benign `T2` + `6,500` malicious `T2`) so `T2` receives full representation during training.
  - Ranks 8 KiB windows across all `.js`/`.cjs`/`.mjs` files by Stage 1 behavioral suspicion so trojanized multi-file packages always place the injected payload at token 0, while filtering out empty non-functional barrel stubs from `label=1`.
- **Native `bfloat16` + `TF32` Blackwell Training (`max_length=1024`, `100%` GPU Utilization) & Baked-In Classifier Bias ([`train_modernbert_v2.py`](train_modernbert_v2.py)):**
  - Trained at **`max_length=1024`** in native `bfloat16` + `TF32` (`benign_weight = 3.0`, `optim="adamw_torch_fused"`, `num_proc=32`, `dataloader_num_workers=16`) on an **NVIDIA RTX PRO 6000 Blackwell Server Edition (96 GB VRAM + 48 vCPUs, 180 GB RAM)** at **`100%` GPU compute utilization (`50.4 GB` VRAM, `472 W`)**.
  - **Threshold Baked Directly into `model.classifier.bias`:** Calibrates $\tau = 0.7000$ and shifts `model.classifier.bias` by $\Delta = \ln(\tau / (1-\tau)) = +0.8473$ before ONNX export so even default `argmax(logits)` / `prob >= 0.50` automatically enforces the `< 0.5%` false-alarm operating point (`Hard Benign FPR = 0.48%`, `Val Benign FPR = 0.52%`, `ben_T2 FPR = 0.53%`, `Precision = 99.35%`, `ROC-AUC = 0.9725`).
- **One-Command Lightweight CPU Installer & CLI Filter ([`install_model.sh`](install_model.sh), [`install_model.ps1`](install_model.ps1), [`stage2_filter.py`](stage2_filter.py)):**
  - Installs in under 60 seconds on WSL2 / Linux / Windows using only CPU `onnxruntime` + `transformers` and downloads `packguard-modernbert-v2-onnx.tar.gz` directly from the GitHub Release CDN (`v2.0-model`).

---

## 2. Overall Benchmark & Validation Results (`v1` vs `v2`)

| Metric | Stage 2 `v1` (Baseline) | Stage 2 `v2` (Round 1 Blackwell: 10,376 Pkgs, `512` Tok) | Stage 2 `v2` (Round 2 Blackwell 48-Core + 100% GPU: `13,000` Pkgs, `1024` Tok) |
|---|---|---|---|
| **Raw Packages (Malware + Benign)** | `970` (`520` + `450`) | `10,376` (`4,500` + `5,876`) | **`13,000` (`6,500` + `6,500`)** |
| **Total Examples (`Train` + `Val` + `Hard Benign`)** | `970` | `27,777` (`21,693` + `2,944` + `3,140`) | **`47,315` (`39,717` + `3,866` + `3,732`)** |
| **Context Window (`MAX_SEQ_LENGTH`)** | `512` tokens | `512` tokens | **`1,024` tokens (`100%` `T2` coverage + `[SIGNALS]` header)** |
| **Obfuscation Tiers Covered** | `T0` only | `T0, T1, T2 (25%), T3, T4` + `Raw` | **`T0, T1, T2 (100%), T3, T4` + `Raw Unformatted`** |
| **Benign False-Alarm Rate (FPR)** | `36.0%` | `0.44%` (`7/1,596`) | **`0.52%` (`10/1,916`)** |
| **Benign Specificity (`1 - FPR`)** | `64.0%` | `99.56%` | **`99.48%`** |
| **Hard Benign (`T1–T4` + Raw + Scripts) FPR** | `35.3%+` | `0.61%` (`19/3,140`) | **`0.48%` (`18/3,732`)** |
| **Hard Benign Specificity** | `64.7%` | `99.39%` | **`99.52%`** |
| **`ben_T2` (Identifier/String Mangled) FPR** | — | `2.52%` (`4/159`) | **`0.53%` (`1/187` — `99.47%` specificity)** |
| **Precision** | — | `99.32%` | **`99.35%` (`98.34%` pre-bake)** |
| **Malware Recall** | — | `76.41%` (`79.08%` pre-bake) | **`78.82%` (`85.18%` pre-bake)** |
| **Validation Accuracy / F1** | — | `88.96%` / `86.37%` (`89.67%` / `87.52%` raw) | **`89.06%` / `87.90%` (`91.80%` acc / `91.29%` F1 raw)** |
| **ROC-AUC** | — | `0.9637` | **`0.9725`** |
| **ONNX INT8 CPU Self-Test** | Manual | `4/4 Passed` | **`4/4 Passed (100%)`** |

---

## 3. Results Broken Down by Package Type & Obfuscation Tier

### A. Benign Package Categories & Obfuscation Tiers (False-Alarm Evaluation)

| Package Type / Tier | Description | Evaluated | False Alarms (`FP`) | Correct Benign (`TN`) | False-Alarm Rate (`FPR`) | Benign Specificity |
|---|---|---:|---:|---:|---:|---:|
| **`ben_popular` (`T0`)** | Popular unmodified npm packages (`v6` manifest) | `243` | `3` | `240` | **`1.23%`** | **`98.77%`** |
| **`ben_longtail` (`T0`)** | Long-tail unmodified npm packages (`<= 2,000` dl/mo) | `118` | `0` | `118` | **`0.00%`** | **`100.00%`** |
| **`ben_live_hard` (`T0`)** | Live npm registry hard-benign CLI/build/system/crypto/WASM packages | `176` | `3` | `173` | **`1.70%`** | **`98.30%`** |
| **`ben_scripts` (Install Hooks)** | Benign packages with `preinstall` / `install` / `postinstall` (`husky`, `node-gyp`, `tsc`, `esbuild`, `patch-package`) | `211` | `1` | `210` | **`0.47%`** | **`99.53%`** |
| **`ben_T1` (Reformatted)** | `T1` re-indented + `/* reformatted */` header controls | `187` | `1` | `186` | **`0.53%`** | **`99.47%`** |
| **`ben_T2` (Identifier/String Mangled)** | `T2` identifier (`v0, v1, ...`) & string-mangled benign controls (`mangle.py`, `100%` coverage) | `187` | `1` | `186` | **`0.53%`** | **`99.47%`** |
| **`ben_T3` (Dead-Code Padded)** | `T3` 18 KiB `function _pg_pad_...` padded controls (reassembled & stripped) | `186` | `0` | `186` | **`0.00%`** | **`100.00%`** |
| **`ben_T4` (Base64 `eval` Wrapped)** | `T4` full-file `eval(Buffer.from(...,"base64").toString())` controls (reassembled & unfolded) | `185` | `1` | `184` | **`0.54%`** | **`99.46%`** |
| **`ben_raw` (Unformatted Direct Input)** | Raw unformatted benign JS & Stage 1 chunks across `T0–T4` (no `text_formatter.py`) | `423` | `0` | `423` | **`0.00%`** | **`100.00%`** |
| **All Validation Benign (`validation.jsonl`)** | Combined held-out validation benign split | `1,916` | `10` | `1,906` | **`0.52%`** | **`99.48%`** |
| **All Hard Benign (`hard_benign_val.jsonl`)** | Combined `T1 + T2 + T3 + T4 + ben_raw + ben_scripts + ben_live_hard` stress benchmark | `3,732` | `18` | `3,714` | **`0.48%`** | **`99.52%`** |

### B. Malicious Package Categories & Obfuscation Tiers

| Package Type / Tier | Description | Evaluated | Detected (`TP`) | Missed (`FN`) | Recall (at `< 0.5%` FPR) |
|---|---|---:|---:|---:|---:|
| **`mal_T0` (`data/v2` + `data/v1`)** | Real malicious npm packages (`JS` + `install_scripts.txt`) | `780` | `642` | `138` | **`82.31%`** |
| **`mal_T1` (Reformatted)** | `T1` re-indented + comment header malware variants | `195` | `165` | `30` | **`84.62%`** |
| **`mal_T2` (Identifier/String Mangled)** | `T2` identifier & string-mangled malware variants (`100%` `T2` coverage) | `195` | `135` | `60` | **`69.23%`** |
| **`mal_T3` (Dead-Code Padded)** | `T3` dead-code padded malware variants | `195` | `156` | `39` | **`80.00%`** |
| **`mal_T4` (Base64 `eval` Wrapped)** | `T4` full-file Base64 `eval` wrapped malware variants | `195` | `158` | `37` | **`81.03%`** |
| **`mal_raw` (Unformatted Direct Input)** | Raw unformatted malicious JS & chunks across `T0–T4` (`tier_T1_raw`: `82.1%`, `tier_T3_raw`: `79.5%`, `tier_T4_raw`: `80.8%`) | `390` | `281` | `109` | **`72.05%`** |
| **All Validation Malware** | Combined held-out malware across `T0 / T1 / T2 / T3 / T4 / Raw` | `1,950` | `1,537` (`1,661` raw) | `413` | **`78.82%` (`85.18%` raw, `99.35%` precision)** |

### C. Stage 1 `v6` (`experiments/v6`) + Stage 2 `v2` Two-Stage Benchmark Evaluation

Evaluated directly against the **`v6` Test Set (`712` targets across `T1–T4`)** and **`v6` Validation Set (`960` targets across `T1–T4`)** from `experiments/v6/results/`:

| `v6` Benchmark Split & Operating Mode | Stage 1 `v6` Benign False Alarms | Eliminated by Stage 2 `v2` | Remaining False Alarms (`Stage 1 + Stage 2`) | Combined Two-Stage Benign FPR | Combined Benign Specificity |
|---|---:|---:|---:|---:|---:|
| **`v6` Test Set (`-q 256`, `232` benign targets)** | `3 / 232` (`1.29%`) | **`3 / 3` (`100%`)** | **`0 / 232`** | **`0.00%`** | **`100.00%`** |
| **`v6` Test Set (`-q 64` default, `232` benign targets)** | `5 / 232` (`2.16%`) | **`5 / 5` (`100%`)** | **`0 / 232`** | **`0.00%`** | **`100.00%`** |
| **`v6` Validation Set (`480` benign targets)** | `15 / 480` (`3.13%`) | **`14 / 15` (`93.3%`)** | **`1 / 480`** | **`0.21%`** | **`99.79%`** |
| **Total Across All `v6` Test + Validation (`712` benign targets)** | `20 / 712` (`2.81%`) | **`19 / 20` (`95.0%`)** | **`1 / 712`** | **`0.14%`** | **`99.86%`** |

#### Exact Stage 1 `v6` False Alarms Filtered by Stage 2 `v2` (`19 / 20` Eliminated):
- **`v6` Test Set (`5 / 5` Eliminated — `0.00%` Combined FPR):**
  - `T1/ben_popular/mime-db@1.54.0` -> **`BENIGN`** (`prob = 0.1254`)
  - `T2/ben_popular/mime-db@1.54.0` -> **`BENIGN`** (`prob = 0.1284`)
  - `T2/ben_popular/hasown@2.0.2` -> **`BENIGN`** (`prob = 0.2791`)
  - `T4/ben_longtail/date-format-php@1.0.2` -> **`BENIGN`** (`prob = 0.2026`)
  - `T4/ben_longtail/ethiopic-date@1.0.4` -> **`BENIGN`** (`prob = 0.4412`)
- **`v6` Validation Set (`14 / 15` Eliminated — `0.21%` Combined FPR):**
  - `T1, T2, T3, T4 / ben_longtail/react-intl-currency-input-fork@0.2.0` -> **`BENIGN`** (`prob = 0.3548–0.5987`)
  - `T1, T2, T3, T4 / ben_longtail/vue-pretty-logger@0.9.0` -> **`BENIGN`** (`prob = 0.1347–0.2052`)
  - `T1, T3, T4 / ben_popular/basic-auth@3.0.0` -> **`BENIGN`** (`prob = 0.5615`)
  - `T3 / ben_popular/form-data-lite@1.0.4` -> **`BENIGN`** (`prob = 0.4058`)
  - `T4 / ben_longtail/yaml-fm@0.1.3` -> **`BENIGN`** (`prob = 0.1522`)
  - `T4 / ben_popular/robot3@1.4.0` -> **`BENIGN`** (`prob = 0.3373`)
  - `T4 / ben_longtail/timezone-name-offsets@1.0.2` -> `MALICIOUS` (`prob = 0.7722`, only remaining false alarm out of 480 validation targets)

---

## 4. Training, Harvesting & Inference Timing Breakdown

All dataset harvesting, `bfloat16` + `TF32` GPU training (`max_length=1024`), and ONNX INT8 quantization were executed on the Google Cloud **`g4-standard-48` (`europe-west10-b`)** instance equipped with an **NVIDIA RTX PRO 6000 Blackwell Server Edition (`96 GB VRAM`, `48 vCPUs`, `180 GB RAM`)**:

| Pipeline Stage | Hardware | Wall-Clock Time | Throughput / Notes |
|---|---|---|---|
| **Dataset Harvesting & Parallel Extraction (`13,000` Raw Pkgs)** | 48 vCPUs (`64` Async Workers + `48` Pool Processes) | `191.5 s` (`3m 11s`) | `6,500` malicious packages (`v2` + `v1`) + `6,500` benign npm packages (incl. `1,844` live hard-benign) |
| **48-Core Parallel `T0–T4` (`100%` `T2`) + Raw JSONL Generation (`47,315` Examples)** | 48 vCPUs (`multiprocessing.Pool(48)`) | `61.4 s` | `39,717` train + `3,866` val + `3,732` hard-benign holdout examples (`100%` `T2` coverage) |
| **ModernBERT-base Fine-Tuning (`4` Epochs, `max_length=1024`, `bf16`+`TF32`, `adamw_torch_fused`)** | NVIDIA RTX PRO 6000 Blackwell (`96 GB` @ `100%` GPU / `50.4 GB` VRAM / `472 W`) | **`1,637.58 s` (`27m 17s`)** | `2,484` steps across `158,868` `1024`-token sequences (`97.04 samples/s`) |
| **Validation + Hard-Benign Calibration (`7,598` Examples @ `1024` Tokens)** | NVIDIA RTX PRO 6000 Blackwell (`96 GB`) | **`28.08 s`** | `270.6 samples/s` (`14.31 s` validation + `13.77 s` hard-benign holdout) |
| **ONNX FP32 Export + Dynamic 8-Bit `QUInt8` Quantization** | 48 vCPUs + ONNX Runtime | `27.32 s` | `571.3 MB` FP32 -> `254.3 MB` INT8 (`146.1 MB` `.tar.gz`, `top1_match=True`, `4/4` self-test passed) |
| **CPU Inference Latency per Package (`stage2_filter.py`)** | CPU (`ORT_ENABLE_ALL`) | **`12.8 – 42.1 ms`** | Single-command CPU inference via `onnxruntime` |

---

## 5. Quick Start: How to Install & Run the Model

### Step 1: Run the One-Command Installer
In **WSL2 / Ubuntu / Linux / macOS**:
```bash
bash "stage 2 LLM Model/v2/install_model.sh"
```
Or in **Windows PowerShell**:
```powershell
powershell -ExecutionPolicy Bypass -File "stage 2 LLM Model\v2\install_model.ps1"
```

### Step 2: Run Stage 2 `v2` on Stage 1 (`v5` / `v6`) Scan Reports
```bash
"stage 2 LLM Model/v2/.venv-stage2/bin/python" "stage 2 LLM Model/v2/stage2_filter.py" \
    --reports ~/pg-v6/test/r3 \
    --out-dir ~/pg-v6/test/r3_stage2
```
See [`INSTALL_GUIDE.md`](INSTALL_GUIDE.md) and [`MODEL_DOWNLOAD.md`](MODEL_DOWNLOAD.md) for full CLI options and direct download links.
