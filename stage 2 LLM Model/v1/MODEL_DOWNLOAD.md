# Stage 2 LLM Model v1 — Pretrained Model Download Links

Direct download links for the Stage 2 v1 fine-tuned `answerdotai/ModernBERT-base` (8,192-token context window) artifacts so `v5` can run CPU inference immediately without retraining.

---

## 1. 8-Bit Quantized ONNX Bundle (Recommended for CPU Inference in `v5`)

| Field | Value |
| :--- | :--- |
| **Direct Download Link** | **https://litter.catbox.moe/orrdk4.gz** |
| **Archive Size** | `214 MB` (`packguard-modernbert-v1-onnx.tar.gz`) |
| **Unpacked Model Size** | `254.3 MB` (`onnx_models/packguard_modernbert_int8.onnx`, ONNX opset 17, `QUInt8` dynamic `MatMul` quantization) |
| **Included Files** | `onnx_models/packguard_modernbert_int8.onnx`, `onnx_models/tokenizer.json`, `onnx_models/tokenizer_config.json`, `onnx_models/special_tokens_map.json`, `onnx_models/config.json` |

### Download & Extract (Linux / WSL / macOS / Windows PowerShell)

```bash
curl -L https://litter.catbox.moe/orrdk4.gz -o packguard-modernbert-v1-onnx.tar.gz
tar -xzf packguard-modernbert-v1-onnx.tar.gz
```

---

## 2. Full Fine-Tuned PyTorch Checkpoint (`model.safetensors`)

| Field | Value |
| :--- | :--- |
| **Direct Download Link** | **https://litter.catbox.moe/28p1j8.gz** |
| **Archive Size** | `531 MB` (`packguard-modernbert-v1-pytorch.tar.gz`) |
| **Included Files** | `final/model.safetensors`, `final/config.json`, `final/tokenizer.json`, `final/tokenizer_config.json`, `final/special_tokens_map.json`, `final/training_args.bin` |

### Download & Extract

```bash
curl -L https://litter.catbox.moe/28p1j8.gz -o packguard-modernbert-v1-pytorch.tar.gz
tar -xzf packguard-modernbert-v1-pytorch.tar.gz
```
