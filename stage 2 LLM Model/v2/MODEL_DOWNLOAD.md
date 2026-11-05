# PackGuard Stage 2 (`v2`) — Pre-Trained Model Downloads & Installation

The `v2` Stage 2 neural filter (`ModernBERT-base` fine-tuned in native `bfloat16` + `TF32` at `max_length=1024` on an **NVIDIA RTX PRO 6000 Blackwell 96 GB GPU + 48 vCPUs** across **13,000 raw packages / 47,315 total examples** covering `100%` of all 5 tiers `T0, T1, T2, T3, T4` + raw unformatted mode + explicit structural signal headers, with the calibrated `< 1%` false-alarm threshold baked directly into `model.classifier.bias`) is available via **1-command automated installation** and direct GitHub Release download.

---

## 1. Fastest Setup: 1-Command Automated Installer (Recommended)

You do **not** need to download the archive manually. Running the installer script automatically creates a lightweight CPU virtual environment (`onnxruntime` + `transformers`), downloads and extracts `packguard_modernbert_v2_int8.onnx` from the GitHub Release CDN, and runs the `4/4` self-test:

### WSL2 / Ubuntu / Linux / macOS
```bash
bash "stage 2 LLM Model/v2/install_model.sh"
```

### Windows PowerShell
```powershell
powershell -ExecutionPolicy Bypass -File "stage 2 LLM Model\v2\install_model.ps1"
```

---

## 2. Direct Model Archive Links

| Artifact | Format | Size | SHA-256 Checksum | Download Link |
|---|---|---|---|---|
| **`packguard-modernbert-v2-onnx.tar.gz`** | 8-bit Quantized ONNX (`QUInt8` CPU Runtime + Tokenizer + Baked Threshold Bias) | `146.1 MB` | `29a4c87f79335d10f4103bc27c07ebda6f91f8a301eabbf1fa6dff61bac4bd62` | **GitHub Release CDN (Direct):** [Download Archive](https://github.com/asembarhoush-dotcom/PackGuard/releases/download/v2.0-model/packguard-modernbert-v2-onnx.tar.gz) |

### Manual CLI Download & Extraction (ONNX INT8 Bundle)
```bash
cd "stage 2 LLM Model/v2"
mkdir -p model_int8
curl -L -o packguard-modernbert-v2-onnx.tar.gz https://github.com/asembarhoush-dotcom/PackGuard/releases/download/v2.0-model/packguard-modernbert-v2-onnx.tar.gz
sha256sum packguard-modernbert-v2-onnx.tar.gz
# Expected: 29a4c87f79335d10f4103bc27c07ebda6f91f8a301eabbf1fa6dff61bac4bd62
tar -xzf packguard-modernbert-v2-onnx.tar.gz -C model_int8
```
