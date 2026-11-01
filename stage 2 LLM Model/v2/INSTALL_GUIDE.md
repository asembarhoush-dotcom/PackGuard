# PackGuard Stage 2 (`v2`) — Collaborator Installation & Usage Guide

This guide explains how to install and run the **PackGuard Stage 2 `v2` Neural Filter** (`ModernBERT-base` INT8 ONNX) on CPU in **under 60 seconds**.

> **Why Stage 2 `v2` is Lightweight on WSL2 / Laptops:**
> You do **not** need a GPU or a 2.5 GB CUDA/PyTorch installation to run Stage 2 `v2`. The installer sets up a lightweight CPU runtime (`onnxruntime` + `transformers`, ~60 MB total) and downloads the pre-trained 8-bit quantized ONNX model (`packguard_modernbert_v2_int8.onnx`).

---

## 1. One-Command Installation (WSL2 / Ubuntu / Linux / macOS)

From the root of the `PackGuard` repository inside WSL2 or Linux, run:

```bash
bash "stage 2 LLM Model/v2/install_model.sh"
```

### What `install_model.sh` does automatically:
1. Creates an isolated virtual environment at `stage 2 LLM Model/v2/.venv-stage2`.
2. Installs `onnxruntime`, `transformers`, and `numpy` (CPU-only, < 500 MB RAM).
3. Downloads and extracts `packguard_modernbert_v2_int8.onnx`, `tokenizer.json`, and `best_threshold.json` into `stage 2 LLM Model/v2/model_int8/`.
4. Runs the built-in `--self-test` on sample benign (`T0`, `T4` Base64-wrapped, and `husky` postinstall hooks) and malicious packages to verify everything works.

---

## 2. One-Command Installation (Windows PowerShell)

From the root of `PackGuard` in PowerShell, run:

```powershell
powershell -ExecutionPolicy Bypass -File "stage 2 LLM Model\v2\install_model.ps1"
```

---

## 3. Running Stage 2 `v2` on Stage 1 (`v5` / `v6`) Scan Reports

Once installed, use [`stage2_filter.py`](stage2_filter.py) to filter any directory of Stage 1 JSON reports produced by `build/packguard -d <reports_dir>`:

### A. Filter a Stage 1 Report Directory (Prints the `v6`-style Tier/Category Table)
```bash
"stage 2 LLM Model/v2/.venv-stage2/bin/python" "stage 2 LLM Model/v2/stage2_filter.py" \
    --reports ~/pg-v6/test/r3 \
    --out-dir ~/pg-v6/test/r3_stage2
```
- By default, `stage2_filter.py` evaluates every package where Stage 1 set `"flagged": true`, adds `"stage2_prob"` and `"stage2_flagged"` to the JSON report, updates `"flagged"`, and prints the exact `T1 / T2 / T3 / T4` recall and `ben_popular / ben_longtail` false-alarm table used by `experiments/v6/scripts/summarize.py`.
- To evaluate Stage 2 standalone on **every** report in the directory (even those not flagged by Stage 1), add `--all-packages`:
  ```bash
  "stage 2 LLM Model/v2/.venv-stage2/bin/python" "stage 2 LLM Model/v2/stage2_filter.py" \
      --reports ~/pg-v6/test/r3 \
      --all-packages
  ```

### B. Score a Single Stage 1 JSON Report
```bash
"stage 2 LLM Model/v2/.venv-stage2/bin/python" "stage 2 LLM Model/v2/stage2_filter.py" \
    --report ~/pg-v6/test/r3/T1__ben_popular__express@4.18.2.json
```

### C. Score a Raw Unpacked npm Package Directory Directly
```bash
"stage 2 LLM Model/v2/.venv-stage2/bin/python" "stage 2 LLM Model/v2/stage2_filter.py" \
    --package /path/to/unpacked/package@1.0.0
```
