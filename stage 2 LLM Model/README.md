# Stage 2 LLM Model (`answerdotai/ModernBERT-base`)

This directory contains all Stage 2 AI False-Alarm Filter (`ModernBERT-base`, 8,192-token context window) datasets, training scripts, ONNX quantization pipelines, and experimental results, organized by version (`v1/`, `v2/`, ...) so every new feature or model iteration is self-contained and never modifies Stage 1 files.

## Version Index

| Version | Folder | Summary of Results |
| :--- | :--- | :--- |
| **v1** | [`v1/`](v1/README.md) | Baseline Stage 2 `ModernBERT-base` fine-tuning on NVIDIA Tesla T4 (16 GB VRAM, FP16 + PyTorch SDPA, 8,192 tokens) over 900 packages (765 train / 135 val): **100.0% validation accuracy, 1.0000 F1, 0.0% false alarm rate**, and 8-bit dynamic ONNX export (`571.2 MB` FP32 -> `254.3 MB` INT8, `Top-1 prediction match: True`). |
| **v2** | [`v2/`](v2/README.md) | Reserved for the next Stage 2 LLM iteration / feature additions. |
