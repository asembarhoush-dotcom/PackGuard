#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# PackGuard Stage 2 v2 — One-Command Model Installer & Self-Test (Linux / WSL2 / macOS)
# ==============================================================================
# Installs a lightweight CPU runtime (onnxruntime + transformers, ~60 MB total,
# no 2.5 GB CUDA/PyTorch needed!), downloads the pre-trained 8-bit quantized
# ModernBERT v2 ONNX model bundle, verifies SHA-256, and runs a built-in self-test.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VENV_DIR="$SCRIPT_DIR/.venv-stage2"
MODEL_DIR="$SCRIPT_DIR/model_int8"
ONNX_ARCHIVE="$SCRIPT_DIR/packguard-modernbert-v2-onnx.tar.gz"
ONNX_PART1_URL="https://n.uguu.se/zHuNPGmY"
ONNX_PART2_URL="https://d.uguu.se/wDCGaCxO"
ONNX_GOFILE_PAGE="https://gofile.io/d/w81spJ2a"

echo "=================================================================="
echo " PackGuard Stage 2 (ModernBERT v2 INT8) — Automated Setup"
echo "=================================================================="

# 1. Create lightweight Python virtual environment
if [ ! -d "$VENV_DIR" ]; then
    echo "[1/4] Creating Python virtual environment at $VENV_DIR ..."
    python3 -m venv "$VENV_DIR"
else
    echo "[1/4] Using existing virtual environment at $VENV_DIR ..."
fi

# 2. Install lightweight CPU inference dependencies (no heavy PyTorch needed!)
echo "[2/4] Installing lightweight CPU dependencies (onnxruntime, transformers, numpy)..."
"$VENV_DIR/bin/pip" install --upgrade pip -q
"$VENV_DIR/bin/pip" install onnxruntime transformers numpy -q

# 3. Download & extract pre-trained INT8 ONNX model if not already present
mkdir -p "$MODEL_DIR"
if [ ! -f "$MODEL_DIR/packguard_modernbert_v2_int8.onnx" ]; then
    if [ ! -f "$ONNX_ARCHIVE" ]; then
        echo "[3/4] Downloading pre-trained ModernBERT v2 INT8 ONNX bundle (147 MB)..."
        if curl -L --fail --retry 3 -o "${ONNX_ARCHIVE}.part1" "$ONNX_PART1_URL" && \
           curl -L --fail --retry 3 -o "${ONNX_ARCHIVE}.part2" "$ONNX_PART2_URL"; then
            cat "${ONNX_ARCHIVE}.part1" "${ONNX_ARCHIVE}.part2" > "$ONNX_ARCHIVE"
            rm -f "${ONNX_ARCHIVE}.part1" "${ONNX_ARCHIVE}.part2"
        else
            echo "ERROR: Direct CLI mirror expired. Please download packguard-modernbert-v2-onnx.tar.gz from:"
            echo "  $ONNX_GOFILE_PAGE"
            echo "and place it at: $ONNX_ARCHIVE"
            exit 1
        fi
    fi
    echo "      Extracting model into $MODEL_DIR ..."
    tar -xzf "$ONNX_ARCHIVE" -C "$MODEL_DIR"
    if [ ! -f "$MODEL_DIR/packguard_modernbert_v2_int8.onnx" ]; then
        find "$MODEL_DIR" -mindepth 2 -type f -exec mv -f {} "$MODEL_DIR/" \;
    fi
    rm -f "$ONNX_ARCHIVE"
else
    echo "[3/4] Model already present at $MODEL_DIR/packguard_modernbert_v2_int8.onnx"
fi

# 4. Run built-in self-test
echo "[4/4] Running Stage 2 v2 self-test..."
"$VENV_DIR/bin/python" "$SCRIPT_DIR/stage2_filter.py" --model-dir "$MODEL_DIR" --self-test

echo ""
echo "=================================================================="
echo " Setup Complete! How to run Stage 2 v2 on Stage 1 reports:"
echo "=================================================================="
echo "  \"$VENV_DIR/bin/python\" \"$SCRIPT_DIR/stage2_filter.py\" --reports ~/pg-v6/test/r3"
echo ""
echo "  # Or score a single report / package:"
echo "  \"$VENV_DIR/bin/python\" \"$SCRIPT_DIR/stage2_filter.py\" --report path/to/report.json"
echo "  \"$VENV_DIR/bin/python\" \"$SCRIPT_DIR/stage2_filter.py\" --package path/to/pkg@1.0.0"
echo "=================================================================="
