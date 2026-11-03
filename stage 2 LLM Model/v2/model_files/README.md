# Stage 2 v2 model: in-repo copy

The INT8 ONNX bundle (`packguard-modernbert-v2-onnx.tar.gz`, 153,161,286 bytes) is stored here in 3 parts,
because GitHub rejects single files over 100 MB.

SHA-256 of the full archive:
`2a5c8029dc360f2f91327a280034b1ec4875814ed0103e245766781365529792`

The archive contains the quantized model `packguard_modernbert_v2_int8.onnx`, `tokenizer.json`,
and `best_threshold.json` (0.72).

## Rebuild and extract

Linux / macOS / WSL:

```bash
cd "stage 2 LLM Model/v2/model_files"
bash assemble_model.sh
```

Windows PowerShell:

```powershell
cd "stage 2 LLM Model\v2\model_files"
powershell -ExecutionPolicy Bypass -File .\assemble_model.ps1
```

Both scripts join the parts, verify the SHA-256, and extract to `../onnx/`.

## Run it

```bash
pip install numpy onnxruntime tokenizers
python "stage 2 LLM Model/v2/simple_example.py"
```

See `../HOW_TO_USE_TOKENIZER_AND_MODEL.md` for how tokenizing and batching work
(only pass `input_ids` and `attention_mask`, never `token_type_ids`).
