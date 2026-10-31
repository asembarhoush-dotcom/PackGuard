# PackGuard Stage 2 — LLM Semantic Malware Classifier (`ModernBERT-base`)

This folder contains all iterations (`v1`, `v2`, ...) of **PackGuard Stage 2**, the neural code-analysis filter that inspects packages flagged by the Stage 1 C17 LZJD/NCD compression scanner.

## Folder Structure

| Folder | Status | Summary |
|---|---|---|
| [`v1/`](v1/README.md) | Completed | Initial `ModernBERT-base` fine-tuning (`970` packages: `520` malware from `data/v2`, `450` benign from `npm`), FP16 T4 training, and 8-bit dynamic ONNX export (`packguard_modernbert_int8.onnx`). |
| [`v2/`](v2/README.md) | **Completed (Recommended)** | **99.40% Benign Specificity (`0.60%` False-Alarm Rate, down from `36%` in `v1`)**: Trained on **5,600 raw packages** (`2,800` benign from `v6` manifests + `2,800` malware from `data/v2`, up to `10,703` total examples across `T0/T1/T3/T4` + hard-negative benign install scripts). Includes leak-free chunk reassembly & `T4` Base64 unfolding ([`text_formatter.py`](v2/text_formatter.py)), a 1-command lightweight CPU installer ([`install_model.sh`](v2/install_model.sh) / [`install_model.ps1`](v2/install_model.ps1)), and the Stage 1 report directory filter CLI ([`stage2_filter.py`](v2/stage2_filter.py)). |

## Quick Links
- **Stage 2 `v2` (Latest — 99.4% Specificity + 1-Command Installer):**
  - [`v2/README.md`](v2/README.md) — Root-cause analysis, `v1` vs `v2` benchmark comparison, and architecture
  - [`v2/INSTALL_GUIDE.md`](v2/INSTALL_GUIDE.md) — 1-command setup (`bash "stage 2 LLM Model/v2/install_model.sh"`) and CLI usage on Stage 1 reports
  - [`v2/MODEL_DOWNLOAD.md`](v2/MODEL_DOWNLOAD.md) — Direct download links and SHA-256 checksums for `v2` ONNX INT8 (`147 MB`) and PyTorch (`228 MB`)
  - [`v2/results.json`](v2/results.json) — Machine-readable `v2` training rounds and evaluation metrics
- **Stage 2 `v1` (Baseline):**
  - [`v1/README.md`](v1/README.md) — Baseline training & evaluation report
  - [`v1/MODEL_DOWNLOAD.md`](v1/MODEL_DOWNLOAD.md) — Baseline model download links
