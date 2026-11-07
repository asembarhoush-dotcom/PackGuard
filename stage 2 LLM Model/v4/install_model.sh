#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${SCRIPT_DIR}/checkpoints"
mkdir -p "${TARGET_DIR}"

MODEL_URL="https://github.com/asembarhoush-dotcom/PackGuard/releases/download/v2.0-model/packguard_v4_nano_int8.onnx"
MODEL_PATH="${TARGET_DIR}/packguard_v4_nano_int8.onnx"

if [ ! -f "${MODEL_PATH}" ]; then
    echo "[PackGuard Stage 2 v4 CPU-Only] Downloading 11.83 MB packguard_v4_nano_int8.onnx..."
    curl -fSL -o "${MODEL_PATH}" "${MODEL_URL}" || true
fi

echo "[PackGuard Stage 2 v4 CPU-Only] Verifying 100% CPU-Only Lightweight Filter..."
python3 "${SCRIPT_DIR}/stage2_filter.py" --self-test
echo "[PackGuard Stage 2 v4 CPU-Only] Ready for ultra-fast CPU inference (Zero GPU required)!"
