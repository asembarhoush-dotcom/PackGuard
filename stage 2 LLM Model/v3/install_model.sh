#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${SCRIPT_DIR}/model_int8"
mkdir -p "${TARGET_DIR}"
ARCHIVE_URL="https://github.com/asembarhoush-dotcom/PackGuard/releases/download/v2.0-model/packguard-modernbert-v3-onnx.tar.gz"
TMP_ARCHIVE="/tmp/packguard-modernbert-v3-onnx.tar.gz"
echo "[PackGuard Stage 2 v3] Downloading model..."
curl -fSL -o "${TMP_ARCHIVE}" "${ARCHIVE_URL}"
echo "[PackGuard Stage 2 v3] Extracting to ${TARGET_DIR}..."
tar -xzf "${TMP_ARCHIVE}" -C "${TARGET_DIR}"
rm -f "${TMP_ARCHIVE}"
echo "[PackGuard Stage 2 v3] Installation complete! Verifying..."
python3 "${SCRIPT_DIR}/stage2_filter.py" --self-test
