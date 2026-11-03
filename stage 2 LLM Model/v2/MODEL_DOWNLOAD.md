# PackGuard Stage 2 (`v2`) — Pre-Trained Model Downloads & Installation

The `v2` Stage 2 neural filter (`ModernBERT-base` fine-tuned on **5,600 raw packages / 7,947+ training examples** with `T1–T4` de-obfuscation and false-alarm penalty) is available both via **1-command automated installation** and direct archive downloads.

---

## 1. Fastest Setup: 1-Command Automated Installer (Recommended)

You do **not** need to download the archives manually. Running the installer script automatically creates a lightweight CPU virtual environment (`onnxruntime` + `transformers`), downloads and extracts `packguard_modernbert_v2_int8.onnx`, and runs the `4/4` self-test:

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
| **`packguard-modernbert-v2-onnx.tar.gz`** | 8-bit Quantized ONNX (`QUInt8` CPU Runtime + Tokenizer + Calibrated Threshold) | `147 MB` | `2a5c8029dc360f2f91327a280034b1ec4875814ed0103e245766781365529792` | **GitHub Release CDN (Direct):** [Download Archive](https://github.com/asembarhoush-dotcom/PackGuard/releases/download/v2.0-model/packguard-modernbert-v2-onnx.tar.gz)<br>**Browser / Gofile Mirror:** [https://gofile.io/d/w81spJ2a](https://gofile.io/d/w81spJ2a) |
| **`packguard-modernbert-v2-pytorch.tar.gz`** | Full PyTorch Safetensors Checkpoint (`model.safetensors` + Tokenizer + Config) | `228 MB` | `d49d4635ddfae9e4c0b1284041ced41c40a73c8524d0cd79e40f5658614b8bde` | **Browser / Gofile:** [https://gofile.io/d/V3vbJvCu](https://gofile.io/d/V3vbJvCu) |

### Manual CLI Download & Extraction (ONNX INT8 Bundle)
```bash
cd "stage 2 LLM Model/v2"
mkdir -p model_int8
curl -L -o packguard-modernbert-v2-onnx.tar.gz https://github.com/asembarhoush-dotcom/PackGuard/releases/download/v2.0-model/packguard-modernbert-v2-onnx.tar.gz
sha256sum packguard-modernbert-v2-onnx.tar.gz
# Expected: 2a5c8029dc360f2f91327a280034b1ec4875814ed0103e245766781365529792
tar -xzf packguard-modernbert-v2-onnx.tar.gz -C model_int8
```
