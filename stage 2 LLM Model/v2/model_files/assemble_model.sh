#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
EXPECTED="2a5c8029dc360f2f91327a280034b1ec4875814ed0103e245766781365529792"
OUT="packguard-modernbert-v2-onnx.tar.gz"
cat "$OUT".part* > "$OUT"
ACTUAL="$(sha256sum "$OUT" | cut -d' ' -f1)"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "SHA-256 mismatch: got $ACTUAL" >&2
  exit 1
fi
mkdir -p ../onnx
tar -xzf "$OUT" -C ../onnx --strip-components=0
rm -f "$OUT"
echo "OK: model extracted to $(cd ../onnx && pwd)"
ls ../onnx
