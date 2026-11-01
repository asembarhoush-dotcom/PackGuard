# How the Tokenizer, Token Batching & ONNX Model Work (`Stage 2 v2`)

If you are integrating `packguard_modernbert_v2_int8.onnx` and `tokenizer.json` into your own script (or ran into errors with token shapes, padding, or `token_type_ids`), this guide explains the **exact inputs, outputs, and batching rules**.

---

## 1. The 3 Common Pitfalls to Avoid

1. **Do NOT pass `token_type_ids` to the ONNX model:**
   - Standard BERT uses 3 inputs (`input_ids`, `attention_mask`, `token_type_ids`), but **ModernBERT only takes 2 inputs**:
     - `"input_ids"`: `int64` tensor of shape `[batch_size, seq_len]`
     - `"attention_mask"`: `int64` tensor of shape `[batch_size, seq_len]` (`1` for real tokens, `0` for `[PAD]` tokens)
   - If you use HuggingFace `AutoTokenizer`, pass only `enc["input_ids"]` and `enc["attention_mask"]` to `session.run(...)`.

2. **How to Batch Multiple Packages Together (`padding` + `truncation`):**
   - Different packages have different token lengths. To batch multiple packages into a single `[batch_size, seq_len]` matrix, you **must enable both truncation (`max_length=512`) and right-padding (`pad_id=50283`, `pad_token="[PAD]"`)**.
   - Both arrays must be cast to **`np.int64`** before passing to `onnxruntime`.

3. **How to Format Stage 1 JSON Reports Before Tokenizing:**
   - Always pass the Stage 1 report dictionary through [`format_scanner_chunks_to_text(report)`](text_formatter.py), which:
     - Reassembles sliding-window chunks per file using `start` byte offsets,
     - Unfolds `T4` Base64 `eval(Buffer.from(...,"base64").toString())` payloads,
     - Strips `T3` dead-code padding (`_pg_pad_`), and
     - Formats the text with canonical headers:
       ```text
       // [INSTALL_SCRIPTS]
       <install commands>

       // [JS_CODE]
       <javascript code>
       ```

---

## 2. Option A: Pure `tokenizers` + `onnxruntime` (Lightweight, No `transformers` Needed!)

Install only the fast Rust-backed `tokenizers` and `onnxruntime` packages (~25 MB total):

```bash
pip install onnxruntime tokenizers numpy
```

Then tokenize and batch-score packages like this (also available in [`simple_example.py`](simple_example.py)):

```python
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer
from text_formatter import format_scanner_chunks_to_text

# 1. Load tokenizer.json and configure truncation + batch padding
tokenizer = Tokenizer.from_file("model_int8/tokenizer.json")
tokenizer.enable_truncation(max_length=512)
tokenizer.enable_padding(
    direction="right",
    pad_id=50283,        # ModernBERT [PAD] token ID
    pad_token="[PAD]",
    pad_to_multiple_of=8
)

# 2. Load the 8-bit quantized ONNX model on CPU
session = ort.InferenceSession(
    "model_int8/packguard_modernbert_v2_int8.onnx",
    providers=["CPUExecutionProvider"],
)

def predict_batch(stage1_reports, threshold=0.72):
    # Format each Stage 1 JSON report into canonical text
    texts = [format_scanner_chunks_to_text(r) for r in stage1_reports]

    # Tokenize & pad the entire batch in parallel (Rust backend)
    encodings = tokenizer.encode_batch(texts)

    # Build 2D int64 arrays of shape [batch_size, seq_len]
    input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
    attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)

    # Run ONNX model (ONLY pass input_ids and attention_mask!)
    # Output `logits` has shape [batch_size, 2] -> [benign_logit, malicious_logit]
    logits = session.run(
        ["logits"],
        {"input_ids": input_ids, "attention_mask": attention_mask},
    )[0]

    # Softmax to get P(malicious) = probs[:, 1]
    shifted = logits - np.max(logits, axis=-1, keepdims=True)
    probs = np.exp(shifted) / np.sum(np.exp(shifted), axis=-1, keepdims=True)
    mal_probs = probs[:, 1]

    return [(bool(p >= threshold), float(p)) for p in mal_probs]
```

---

## 3. Option B: Using HuggingFace `transformers.AutoTokenizer`

If you use `from transformers import AutoTokenizer`:

```python
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer
from text_formatter import format_scanner_chunks_to_text

tokenizer = AutoTokenizer.from_pretrained("model_int8")
session = ort.InferenceSession(
    "model_int8/packguard_modernbert_v2_int8.onnx",
    providers=["CPUExecutionProvider"],
)

def predict_batch_hf(stage1_reports, threshold=0.72):
    texts = [format_scanner_chunks_to_text(r) for r in stage1_reports]

    # padding=True pads all items in the batch to the longest item in the batch
    enc = tokenizer(
        texts,
        padding=True,
        truncation=True,
        max_length=512,
        pad_to_multiple_of=8,
        return_tensors="np",
    )

    # IMPORTANT: Only pass input_ids and attention_mask (cast to int64)
    logits = session.run(
        ["logits"],
        {
            "input_ids": enc["input_ids"].astype(np.int64),
            "attention_mask": enc["attention_mask"].astype(np.int64),
        },
    )[0]

    shifted = logits - np.max(logits, axis=-1, keepdims=True)
    probs = np.exp(shifted) / np.sum(np.exp(shifted), axis=-1, keepdims=True)
    return [(bool(p >= threshold), float(p)) for p in probs[:, 1]]
```

---

## 4. Exact Model Input / Output Specification Reference

| Tensor | Role | Type | Shape | Description |
|---|---|---|---|---|
| **`input_ids`** | Input 0 | `int64` | `[batch_size, seq_len]` | Token IDs (`[CLS]=50281`, `[SEP]=50282`, `[PAD]=50283`, `seq_len <= 512`) |
| **`attention_mask`** | Input 1 | `int64` | `[batch_size, seq_len]` | `1` for non-padding tokens, `0` for padding tokens |
| **`logits`** | Output 0 | `float32` | `[batch_size, 2]` | `logits[:, 0]` = Benign score, `logits[:, 1]` = Malicious score |
| **Verdict Rule** | Post-process | `bool` | `[batch_size]` | `softmax(logits)[:, 1] >= 0.72` (`best_threshold.json`) |
