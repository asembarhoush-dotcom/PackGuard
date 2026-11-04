# PackGuard Stage 2 (`v2`) — False-Alarm Reduction, `T0–T4` + Raw Mode Unfolding & One-Command CPU Filter

## 1. Overview & What Changed from `v1` to `v2`

When `v1` and early `v2` were tested on Stage 1 flagged benign packages (`v4` / `v5` / `v6` benchmarks), three root causes of false alarms were identified and resolved:
1. **Prompt Metadata Shortcuts (`36%` False Alarms in `v1`):**
   - `v1` included `Stage1 Min NCD: {score}` and distinct script filenames (`install_scripts.txt` vs `package.json#scripts`) in the prompt text. Because `v1`'s synthetic training set had low NCD scores (`0.015–0.185`) only on malware and high NCD scores (`0.30–0.94`) on benign packages, any real benign package flagged by Stage 1 was biased toward a malicious prediction.
2. **Missing `T2` Identifier/String Mangling & Direct Raw Unformatted Input (`~20%` False Alarms in Early `v2`):**
   - In the `v4`/`v6` mangling benchmark (`experiments/v4/scripts/mangle.py`), 25% of benign test packages are `T2` (identifiers renamed to `v0, v1, v2` and strings replaced with random alphanumeric chars). Earlier `v2` only sampled `T1, T3, T4` and omitted `T2`, and did not include raw unformatted JS/chunks (`raw_mode=True`) for callers invoking `tokenizer.json` + `onnxruntime` directly without `text_formatter.py`.
3. **Trojanized Multi-File Ordering & Benign Barrel Stubs in `data/v1`:**
   - Sorting package `.js` files by smallest size caused multi-file trojanized libraries to select tiny 75-byte TypeScript barrel stubs (`"use strict"; Object.defineProperty(exports, "__esModule", { value: true });`) labeled `1` (malicious), teaching the model to false-alarm on normal TypeScript packages.

### How `v2` (RTX PRO 6000 Blackwell Edition) Solves All Three Problems:
- **Leak-Free Canonical Text Formatter ([`text_formatter.py`](text_formatter.py)):**
  - Strips all Stage 1 NCD numbers and benchmark package prefixes from the prompt text so classification is **100% based on code semantics**.
  - Unifies `package.json`, `package.json#scripts`, and `install_scripts.txt` into a single canonical `// [INSTALL_SCRIPTS]` section header.
  - **Per-File Sliding-Window Chunk Reassembly:** Reconstructs split files using byte `start` offsets before unfolding so `T3` padding and `T4` Base64 strings spanning multiple 8 KiB chunks are never cut in half at chunk boundaries.
  - **Built-in `T1 / T3 / T4` De-Obfuscation & Repeated Obfuscator Token Collapse:** Automatically unfolds `eval(Buffer.from("<b64>","base64").toString())` wrappers and inline Base64 payloads back into clean UTF-8 JavaScript, strips `T3` `_pg_pad_` dead-code filler blocks, and collapses repeated obfuscator identifier prefixes.
- **10.7x Larger Suspicion-Ranked Training Corpus Across `T0–T4` + Raw Mode ([`prepare_stage2_v2_data.py`](prepare_stage2_v2_data.py)):**
  - Harvested **10,376 raw packages** (**4,500 unique malicious packages** across `data/v2` and `data/v1` + **5,876 benign npm packages** from `v6`, `v3`, `v1`, and **1,200 live hard-benign npm packages** using `child_process`, `webpack`, `esbuild`, `postinstall`, `node-gyp`, and `crypto`), producing **21,693 training examples**, **2,944 validation examples**, and **3,140 hard-benign (`T1–T4` + raw + benign install script) holdout examples**.
  - Ranks 6 KiB windows across all `.js`/`.cjs`/`.mjs` files by Stage 1 behavioral suspicion so trojanized multi-file packages always place the injected payload at token 0, while filtering out empty non-functional barrel stubs from `label=1`.
- **Native `bfloat16` + `TF32` Blackwell Training & Baked-In Classifier Bias ([`train_modernbert_v2.py`](train_modernbert_v2.py)):**
  - Trained in native `bfloat16` + `TF32` (`benign_weight = 3.0`) on an **NVIDIA RTX PRO 6000 Blackwell Server Edition (96 GB VRAM)** in **6 minutes 36 seconds (`395.8 s`)**.
  - **Threshold Baked Directly into `model.classifier.bias`:** Calibrates $\tau = 0.6160$ and shifts `model.classifier.bias` by $\Delta = \ln(\tau / (1-\tau)) = +0.4726$ before ONNX export so even default `argmax(logits)` / `prob >= 0.50` automatically enforces the `< 0.5%` false-alarm operating point (`Val FPR = 0.44%`, `Hard Benign FPR = 0.61%`, `Precision = 99.32%`).
- **One-Command Lightweight CPU Installer & CLI Filter ([`install_model.sh`](install_model.sh), [`install_model.ps1`](install_model.ps1), [`stage2_filter.py`](stage2_filter.py)):**
  - Installs in under 60 seconds on WSL2 / Linux / Windows using only CPU `onnxruntime` + `transformers` and downloads `packguard-modernbert-v2-onnx.tar.gz` directly from the GitHub Release CDN (`v2.0-model`).

---

## 2. Overall Benchmark & Validation Results (`v1` vs `v2`)

| Metric | Stage 2 `v1` (Baseline) | Stage 2 `v2` (T4 Round 2: 5,600 Pkgs) | Stage 2 `v2` (RTX PRO 6000 Blackwell: 10,376 Pkgs) |
|---|---|---|---|
| **Raw Packages (Malware + Benign)** | `970` (`520` + `450`) | `5,600` (`2,800` + `2,800`) | **`10,376` (`4,500` + `5,876`)** |
| **Total Examples (`Train` + `Val` + `Hard Benign`)** | `970` | `10,703` | **`27,777` (`21,693` + `2,944` + `3,140`)** |
| **Obfuscation Tiers Covered** | `T0` only | `T0, T1, T3, T4` | **`T0, T1, T2, T3, T4` + `Raw Unformatted`** |
| **Benign False-Alarm Rate (FPR)** | `36.0%` | `0.60%` (`4/672`) | **`0.44%` (`7/1,596`)** |
| **Benign Specificity (`1 - FPR`)** | `64.0%` | `99.40%` | **`99.56%`** |
| **Hard Benign (`T1–T4` + Raw + Scripts) FPR** | `35.3%+` | `0.64%` (`7/1,092`) | **`0.61%` (`19/3,140`)** |
| **Hard Benign Specificity** | `64.7%` | `99.36%` | **`99.39%`** |
| **Precision** | — | `99.20%` | **`99.32%`** |
| **Validation Accuracy** | — | `88.39%` | **`88.96%` (`89.67%` raw)** |
| **ROC-AUC** | — | `0.9194` | **`0.9637`** |
| **ONNX INT8 CPU Self-Test** | Manual | `4/4 Passed` | **`4/4 Passed (100%, 16.4 ms avg)`** |

---

## 3. Results Broken Down by Package Type & Obfuscation Tier

### A. Benign Package Categories & Obfuscation Tiers (False-Alarm Evaluation)

| Package Type / Tier | Description | Evaluated | False Alarms (`FP`) | Correct Benign (`TN`) | False-Alarm Rate (`FPR`) | Benign Specificity |
|---|---|---:|---:|---:|---:|---:|
| **`ben_popular` (`T0`)** | Popular unmodified npm packages (`v6` manifest) | `243` | `3` | `240` | **`1.23%`** | **`98.77%`** |
| **`ben_longtail` (`T0`)** | Long-tail unmodified npm packages (`<= 2,000` dl/mo) | `118` | `0` | `118` | **`0.00%`** | **`100.00%`** |
| **`ben_live_hard` (`T0`)** | Live npm registry hard-benign CLI/build/system/crypto packages | `113` | `0` | `113` | **`0.00%`** | **`100.00%`** |
| **`ben_scripts` (Install Hooks)** | Benign packages with `preinstall` / `install` / `postinstall` (`husky`, `node-gyp`, `tsc`, `esbuild`, `patch-package`) | `165` | `0` | `165` | **`0.00%`** | **`100.00%`** |
| **`ben_T1` (Reformatted)** | `T1` re-indented + `/* reformatted */` header controls | `161` | `0` | `161` | **`0.00%`** | **`100.00%`** |
| **`ben_T2` (Identifier/String Mangled)** | `T2` identifier (`v0, v1, ...`) & string-mangled benign controls (`mangle.py`) | `159` | `4` | `155` | **`2.52%`** | **`97.48%`** |
| **`ben_T3` (Dead-Code Padded)** | `T3` 18 KiB `function _pg_pad_...` padded controls (reassembled & stripped) | `157` | `0` | `157` | **`0.00%`** | **`100.00%`** |
| **`ben_T4` (Base64 `eval` Wrapped)** | `T4` full-file `eval(Buffer.from(...,"base64").toString())` controls (reassembled & unfolded) | `158` | `0` | `158` | **`0.00%`** | **`100.00%`** |
| **`ben_raw` (Unformatted Direct Input)** | Raw unformatted benign JS & Stage 1 chunks across `T0–T4` (no `text_formatter.py`) | `322` | `0` | `322` | **`0.00%`** | **`100.00%`** |
| **All Validation Benign (`validation.jsonl`)** | Combined held-out validation benign split | `1,596` | `7` | `1,589` | **`0.44%`** | **`99.56%`** |
| **All Hard Benign (`hard_benign_val.jsonl`)** | Combined `T1 + T2 + T3 + T4 + ben_raw + ben_scripts + ben_live_hard` stress benchmark | `3,140` | `19` | `3,121` | **`0.61%`** | **`99.39%`** |

### B. Malicious Package Categories & Obfuscation Tiers

| Package Type / Tier | Description | Evaluated | Detected (`TP`) | Missed (`FN`) | Recall (at `< 0.5%` FPR) |
|---|---|---:|---:|---:|---:|
| **`mal_T0` (`data/v2` + `data/v1`)** | Real malicious npm packages (`JS` + `install_scripts.txt`) | `539` | `425` | `114` | **`78.85%`** |
| **`mal_T1` (Reformatted)** | `T1` re-indented + comment header malware variants | `135` | `103` | `32` | **`76.30%`** |
| **`mal_T2` (Identifier/String Mangled)** | `T2` identifier & string-mangled malware variants | `134` | `88` | `46` | **`65.67%`** |
| **`mal_T3` (Dead-Code Padded)** | `T3` dead-code padded malware variants | `135` | `111` | `24` | **`82.22%`** |
| **`mal_T4` (Base64 `eval` Wrapped)** | `T4` full-file Base64 `eval` wrapped malware variants | `135` | `106` | `29` | **`78.52%`** |
| **`mal_raw` (Unformatted Direct Input)** | Raw unformatted malicious JS & chunks across `T0–T4` (`tier_T3_raw`: `79.6%`, `tier_T4_raw`: `75.9%`) | `270` | `197` | `73` | **`72.96%`** |
| **All Validation Malware** | Combined held-out malware across `T0 / T1 / T2 / T3 / T4 / Raw` | `1,348` | `1,030` (`1,066` raw) | `318` | **`76.41%` (`79.08%` raw, `99.32%` precision)** |

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
  - `T1/ben_popular/mime-db@1.54.0` -> **`BENIGN`** (`prob = 0.0570`, `40.2 ms`)
  - `T2/ben_popular/mime-db@1.54.0` -> **`BENIGN`** (`prob = 0.0682`, `42.1 ms`)
  - `T2/ben_popular/hasown@2.0.2` -> **`BENIGN`** (`prob = 0.1589`, `55.4 ms`)
  - `T4/ben_longtail/date-format-php@1.0.2` -> **`BENIGN`** (`prob = 0.2593`, `477.8 ms`)
  - `T4/ben_longtail/ethiopic-date@1.0.4` -> **`BENIGN`** (`prob = 0.3726`, `317.0 ms`)
- **`v6` Validation Set (`14 / 15` Eliminated — `0.21%` Combined FPR):**
  - `T1, T2, T3, T4 / ben_longtail/react-intl-currency-input-fork@0.2.0` -> **`BENIGN`** (`prob = 0.3042–0.3222`)
  - `T1, T2, T3, T4 / ben_longtail/vue-pretty-logger@0.9.0` -> **`BENIGN`** (`prob = 0.0981–0.2359`)
  - `T1, T3, T4 / ben_popular/basic-auth@3.0.0` -> **`BENIGN`** (`prob = 0.2178`)
  - `T3 / ben_popular/form-data-lite@1.0.4` -> **`BENIGN`** (`prob = 0.1613`)
  - `T4 / ben_longtail/yaml-fm@0.1.3` -> **`BENIGN`** (`prob = 0.0500`)
  - `T4 / ben_popular/robot3@1.4.0` -> **`BENIGN`** (`prob = 0.3799`)
  - `T4 / ben_longtail/timezone-name-offsets@1.0.2` -> `MALICIOUS` (`prob = 0.6010`, only remaining false alarm out of 480 validation targets)

---

## 4. Training, Harvesting & Inference Timing Breakdown

All dataset harvesting, `bfloat16` + `TF32` GPU training, and ONNX INT8 quantization were executed on the Google Cloud **`g4-standard-48` (`europe-west10-b`)** instance equipped with an **NVIDIA RTX PRO 6000 Blackwell Server Edition (`96 GB VRAM`, `48 vCPUs`)**:

| Pipeline Stage | Hardware | Wall-Clock Time | Throughput / Notes |
|---|---|---|---|
| **Dataset Harvesting & Extraction (`10,376` Raw Pkgs)** | 48 vCPUs (`64` Async Workers) | `168.4 s` (`2m 48s`) | `4,500` unique malware packages (`v2` + `v1`) + `5,876` benign npm packages (incl. `1,200` live hard-benign) |
| **Suspicion-Ranked `T0–T4` + Raw JSONL Generation (`27,777` Examples)** | 48 vCPUs | `25.2 s` | `21,693` train + `2,944` val + `3,140` hard-benign holdout examples |
| **ModernBERT-base Fine-Tuning (`4` Epochs, `batch_size=64`, `bf16`+`TF32`)** | NVIDIA RTX PRO 6000 Blackwell (`96 GB`) | **`395.76 s` (`6m 36s`)** | `1,356` steps at `3.64 steps/s` (~`233 examples/s`, **100x faster** than T4) |
| **Validation + Hard-Benign Calibration (`6,084` Examples)** | NVIDIA RTX PRO 6000 Blackwell (`96 GB`) | **`9.88 s`** | `603.3 samples/s` (`4.88 s` validation + `5.00 s` hard-benign holdout) |
| **ONNX FP32 Export + Dynamic 8-Bit `QUInt8` Quantization** | 48 vCPUs + ONNX Runtime | `25.63 s` | `571.3 MB` FP32 -> `254.3 MB` INT8 (`146.1 MB` `.tar.gz`, `top1_match=True`) |
| **CPU Inference Latency per Package (`stage2_filter.py`)** | CPU (`ORT_ENABLE_ALL`) | **`10.5 – 28.3 ms`** (`16.4 ms` avg) | `13.8 ms` (`T0`), `12.8 ms` (install hook), `10.5 ms` (`T4`), `28.3 ms` (malware) |

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
