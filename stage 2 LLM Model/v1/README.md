# Stage 2 LLM Model — v1: ModernBERT False-Alarm Filter Baseline

Stage 2 v1 trains `answerdotai/ModernBERT-base` (~149M parameters, 8,192-token context window) on an NVIDIA Tesla T4 (16 GB VRAM) to classify npm packages flagged by the Stage 1 NCD scanner as **benign (`0`)** or **malicious (`1`)**, and exports the trained model to an 8-bit quantized ONNX graph (`packguard_modernbert_int8.onnx`) for CPU inference.

---

## 1. Results Summary (Stage 2 v1)

Measured on 2026-10-28 on Google Cloud `packguard-t4` (NVIDIA Tesla T4 16 GB VRAM, CUDA 12.4, PyTorch 2.6.0+cu124, FP16 mixed precision + PyTorch SDPA).

### Validation Classification Metrics (135 Unseen Packages)

| Metric | Value |
| :--- | :--- |
| **Validation Accuracy** | **100.0% (`1.0000`)** |
| **Precision (`malicious = 1`)** | **100.0% (`1.0000`)** |
| **Recall (`malicious = 1`)** | **100.0% (`1.0000`)** |
| **F1 Score** | **1.0000** |
| **False Alarm Rate (`FP / (FP + TN)`)** | **0.0% (`0.0000`)** |
| **Validation Loss (`eval_loss`)** | `0.000403` |
| **Evaluation Runtime** | `34.03 s` (`3.967 samples/s` at up to 8,192 tokens) |

### Training Progression & Hardware Telemetry

| Epoch / Step | Training Loss | Gradient Norm | Learning Rate | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Epoch 1.04 (Step 25/72)** | `9.0370` | `244.129` | `4.07e-5` | Initial cosine warmup & long-context adaptation |
| **Epoch 2.08 (Step 50/72)** | `2.4730` | `2.250` | `1.32e-5` | Rapid convergence on install scripts + JS chunks |
| **Epoch 3.00 (Step 72/72)** | `4.0606` (avg) | — | `0.0` | Total training time: `44 min 07 s` (`2,647.5 s`), Peak VRAM: `5,519 MiB` |

### 8-Bit ONNX Quantization & CPU Verification (`export_onnx.py`)

| Artifact / Check | Result |
| :--- | :--- |
| **ONNX Opset Version** | Opset `17` (dynamic `batch_size` and `sequence_length` axes) |
| **Unquantized FP32 Model Size** | `571.2 MB` |
| **8-Bit Quantized (`QUInt8` MatMul) Model Size** | **`254.3 MB` (`55.5%` size reduction)** |
| **CPU Execution Provider Verification** | **`Top-1 prediction match: True`** (`Max logit diff: 2.3454`) |
| **Server Checkpoint Path** | `/home/asembarhoush/PackGuard/checkpoints/packguard-modernbert/final` |
| **Server ONNX Bundle Path** | `/home/asembarhoush/PackGuard/onnx_models/packguard_modernbert_int8.onnx` |
| **Direct ONNX Download Link (`214 MB`)** | **https://litter.catbox.moe/orrdk4.gz** (see [`MODEL_DOWNLOAD.md`](MODEL_DOWNLOAD.md)) |
| **Direct PyTorch Download Link (`531 MB`)** | **https://litter.catbox.moe/28p1j8.gz** (see [`MODEL_DOWNLOAD.md`](MODEL_DOWNLOAD.md)) |

---

## 2. Dataset Status (Stage 2 v1)

Built on 2026-10-28 on the Google Cloud T4 GPU server (`packguard-t4`) using `prepare_stage2_data.py`.

| Field | Details |
| :--- | :--- |
| **Server Location** | `packguard-t4:~/PackGuard/data/train.jsonl` (16 MiB) and `~/PackGuard/data/validation.jsonl` (1.8 MiB). Never committed to git (contains live malware code chunks). |
| **Rebuild Command** | `python3 "stage 2 LLM Model/v1/prepare_stage2_data.py" --repo_root . --out_dir ./data` |
| **Total Packages** | **900 packages** (450 malicious + 450 benign), split 85% / 15% into **765 training** and **135 validation** packages (seed `42`). |
| **Malicious (`label = 1`)** | 450 packages sampled across code shapes from `data/v2/malware_js_0.zip` to `malware_js_f.zip` (decrypted in memory with password `infected`), including `install_scripts.txt` and 8 KiB / 4 KiB-stride JavaScript chunks. |
| **Benign (`label = 0`)** | 450 packages downloaded from `registry.npmjs.org` using the verified benign lists in `experiments/v3/results/packages.csv` (`ben_general`, `ben_scripts`) and `experiments/v1/results/packages.csv` (`ben_popular`, `ben_longtail`), sorted by ascending Stage 1 NCD score so low-NCD false-alarm candidates (`supertest@7.3.1`, `@openai/agents@0.21.0`, `hotscript@1.0.13`, `sqs-producer@9.0.6`, `@aws-cdk/asset-awscli-v1@2.2.295`, etc.) are always included. |
| **Input Formatting** | Each package's chunks (`{"file", "start", "ncd", "text"}`) are sorted by ascending `ncd` (most suspicious chunk first) before tokenization into ModernBERT's 8,192-token window so suspicious code is never truncated. |

---

## 3. Files in `stage 2 LLM Model/v1/`

| File | Purpose |
| :--- | :--- |
| [`prepare_stage2_data.py`](prepare_stage2_data.py) | Extracts `data/v2` malware in memory and downloads `v3`/`v1` benign packages into `train.jsonl` (765) and `validation.jsonl` (135). |
| [`train_modernbert.py`](train_modernbert.py) | Fine-tunes `answerdotai/ModernBERT-base` at `max_length=8192` with automatic Tesla T4 (`fp16=True`, PyTorch `sdpa`, batch size `2`, gradient accumulation `16`) and A100 (`bf16=True`, `tf32=True`) support. |
| [`export_onnx.py`](export_onnx.py) | Exports the fine-tuned ModernBERT checkpoint to FP32 ONNX (opset 17, dynamic batch & sequence length) and applies 8-bit dynamic weight quantization (`QUInt8` on `MatMul`). |
| [`requirements.txt`](requirements.txt) | Python dependencies (`torch==2.6.0+cu124`, `transformers>=4.48.0`, `datasets`, `accelerate`, `evaluate`, `scikit-learn`, `onnx`, `onnxruntime`, `optimum`). |
| [`results.json`](results.json) | Machine-readable JSON summary of the Stage 2 v1 training run, validation metrics, dataset counts, and ONNX quantization stats. |
| [`MODEL_DOWNLOAD.md`](MODEL_DOWNLOAD.md) | Direct download links and extraction commands for the 8-bit ONNX bundle and PyTorch checkpoint. |
| [`SETUP_CHECKLIST.md`](SETUP_CHECKLIST.md) | Full record of the Google Cloud T4 GPU server setup, IAP SSH tunnel configuration, and environment fixes. |

---

## 4. Reproduce on `packguard-t4`

```bash
cd ~/PackGuard
source .venv/bin/activate
python "stage 2 LLM Model/v1/prepare_stage2_data.py" --repo_root . --out_dir ./data
python "stage 2 LLM Model/v1/train_modernbert.py" --data_dir ./data --output_dir ./checkpoints/packguard-modernbert
python "stage 2 LLM Model/v1/export_onnx.py" --model_dir ./checkpoints/packguard-modernbert/final --output_dir ./onnx_models
```
