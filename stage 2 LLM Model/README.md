# PackGuard Stage 2 — LLM Semantic Malware Classifier (`ModernBERT-base`)

This folder contains all iterations (`v1`, `v2`, `v3`) of **PackGuard Stage 2**, the neural code-analysis filter that inspects packages flagged by the Stage 1 C17 LZJD/NCD compression scanner.

## Folder Structure

| Folder | Status | Summary |
|---|---|---|
| [`v1/`](v1/README.md) | Completed | Initial `ModernBERT-base` fine-tuning (`970` packages: `520` malware from `data/v2`, `450` benign from `npm`), FP16 T4 training, and 8-bit dynamic ONNX export (`packguard_modernbert_int8.onnx`). |
| [`v2/`](v2/README.md) | Completed | **99.40% Benign Specificity (`0.60%` False-Alarm Rate)**: Trained on `5,600` raw packages (`2,800` benign from `v6` manifests + `2,800` malware from `data/v2`, `10,703` augmented samples). Introduced leak-free chunk reassembly & `T4` Base64 unfolding, 1-command installer, and CLI report filter. |
| [`v3/`](v3/README.md) | **Completed (Latest / Recommended)** | **T2 Identifier De-anonymization & 100% False-Alarm Elimination**: Fine-tuned on RTX PRO 6000 Blackwell GPU (`checkpoint-2932`, `calibrated_model`) and quantized to INT8 ONNX (`142 MB`). Features AST module length inference (detecting `child_process`, `https`, `net/dns` even when variable names and strings are mangled), multi-window sliding-window max-pooling for large/multi-file packages, and zero-sink data protection. Achieves **100% (20/20) Stage 1 false alarm elimination**, **0.00% Combined FPR** on real-life `experiments/v6/` benchmark, and **>97.5% Combined Recall across all tiers** (T1: >98.3%, T2: >97.5%, T3: >98.3%, T4: >98.3%). |

## Quick Links
- **Stage 2 `v3` (Latest / Recommended — T2 De-anonymization & 0.00% FPR):**
  - [`v3/README.md`](v3/README.md) — Architecture, benchmark results against `v6`, and CLI usage
  - [`v3/MODEL_DOWNLOAD.md`](v3/MODEL_DOWNLOAD.md) — Direct download links and SHA-256 checksums (`packguard-modernbert-v3-onnx.tar.gz`)
  - [`v3/results.json`](v3/results.json) — Full evaluation metrics on `v6` real-life benchmark
  - 1-command setup: `bash "stage 2 LLM Model/v3/install_model.sh"` or `pwsh "stage 2 LLM Model/v3/install_model.ps1"`
- **Stage 2 `v2`:**
  - [`v2/README.md`](v2/README.md) — Root-cause analysis, `v1` vs `v2` benchmark comparison, and architecture
  - [`v2/INSTALL_GUIDE.md`](v2/INSTALL_GUIDE.md) — 1-command setup (`bash "stage 2 LLM Model/v2/install_model.sh"`) and CLI usage on Stage 1 reports
  - [`v2/MODEL_DOWNLOAD.md`](v2/MODEL_DOWNLOAD.md) — Direct download links and SHA-256 checksums for `v2` ONNX INT8 (`147 MB`) and PyTorch (`228 MB`)
  - [`v2/results.json`](v2/results.json) — Machine-readable `v2` training rounds and evaluation metrics
- **Stage 2 `v1` (Baseline):**
  - [`v1/README.md`](v1/README.md) — Baseline training & evaluation report
  - [`v1/MODEL_DOWNLOAD.md`](v1/MODEL_DOWNLOAD.md) — Baseline model download links
