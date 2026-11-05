# PackGuard Stage 2 v3 — Model Download & Checksums

This directory provides direct links and cryptographic SHA-256 checksums for **PackGuard Stage 2 v3** (`ModernBERT-base` INT8 CPU ONNX).

## Artifact Summary

| File | Format | Target | Size | SHA-256 Checksum |
|---|---|---|---|---|
| `packguard-modernbert-v3-onnx.tar.gz` | ONNX INT8 + Tokenizer | CPU Inference | `142.33 MB` | `009c52896432f5da0bae5d7d7524b077b3d8e72c0a21eac732ba44ecf3bd4509` |

## Direct Download Links

- **GitHub Release (v2.0-model / v3.0-model):**
  ```bash
  curl -L -o packguard-modernbert-v3-onnx.tar.gz "https://github.com/asembarhoush-dotcom/PackGuard/releases/download/v2.0-model/packguard-modernbert-v3-onnx.tar.gz"
  ```

## Verification

Verify checksum before extracting:
```bash
# Linux / macOS:
sha256sum -c <<< "009c52896432f5da0bae5d7d7524b077b3d8e72c0a21eac732ba44ecf3bd4509  packguard-modernbert-v3-onnx.tar.gz"

# Windows PowerShell:
(Get-FileHash packguard-modernbert-v3-onnx.tar.gz -Algorithm SHA256).Hash -eq "009C52896432F5DA0BAE5D7D7524B077B3D8E72C0A21EAC732BA44ECF3BD4509"
```
