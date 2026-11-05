import argparse
import json
import math
import os
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
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

MODEL_ID = "answerdotai/ModernBERT-base"
MAX_SEQ_LENGTH = 1024

LABEL2ID = {"benign": 0, "clean": 0, "malicious": 1, "malware": 1}
ID2LABEL = {0: "benign", 1: "malicious"}


def configure_gpu_environment() -> str:
    if torch.cuda.is_available():
        major, minor = torch.cuda.get_device_capability(0)
        if major >= 8:
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
        device_name = torch.cuda.get_device_name(0)
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        print(f"[PackGuard v3] GPU: {device_name} (sm_{major}{minor}, {vram_gb:.1f} GB VRAM)", flush=True)
    else:
        print("[PackGuard v3] WARNING: CUDA GPU not detected.", flush=True)

    if torch.cuda.is_available() and torch.cuda.get_device_capability(0)[0] >= 8:
        try:
            import flash_attn
            print("[PackGuard v3] FlashAttention-2 enabled.", flush=True)
            return "flash_attention_2"
        except ImportError:
            pass

    print("[PackGuard v3] Using PyTorch SDPA backend.", flush=True)
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
        texts: List[str] = [str(t) for t in batch.get("text", [])]
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
            batch_size=1024,
            num_proc=min(32, os.cpu_count() or 1),
            remove_columns=split_ds.column_names,
            desc=f"Tokenizing {split_name} (max_length={max_length})",
        )
    return processed


class FocalLossStage2Trainer(Trainer):
    """
    Focal Loss Trainer with gamma=2.0 and benign-priority weighting.
    Focuses gradient updates on hard-to-classify samples (T2 mangled, complex obfuscation)
    while keeping easy benign false-alarm loss near zero.
    """
    def __init__(self, *args, alpha_benign: float = 0.58, gamma: float = 2.0, **kwargs):
        super().__init__(*args, **kwargs)
        self.alpha_benign = float(alpha_benign)
        self.gamma = float(gamma)

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.get("labels")
        outputs = model(**inputs)
        logits = outputs.get("logits")

        # Softmax probabilities
        probs = F.softmax(logits, dim=-1)
        p_t = probs.gather(1, labels.unsqueeze(1)).squeeze(1)

        # Alpha factor: penalize benign misclassifications slightly more to ensure <0.5% FPR
        alpha_t = torch.where(labels == 0, self.alpha_benign, 1.0 - self.alpha_benign)

        # Focal loss: -alpha_t * (1 - p_t)^gamma * log(p_t)
        focal_weight = alpha_t * torch.pow(1.0 - p_t + 1e-8, self.gamma)
        ce_loss = F.cross_entropy(logits, labels, reduction="none")
        loss = (focal_weight * ce_loss).mean()

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
    prec = precision_score(labels, preds, zero_division=0)
    rec = recall_score(labels, preds, zero_division=0)
    f1 = f1_score(labels, preds, zero_division=0)

    try:
        auc = roc_auc_score(labels, mal_probs)
    except Exception:
        auc = 0.5

    tn, fp, fn, tp = confusion_matrix(labels, preds, labels=[0, 1]).ravel()
    fpr = fp / max(1, fp + tn)
    spec = tn / max(1, fp + tn)

    return {
        "accuracy": float(acc),
        "precision": float(prec),
        "recall": float(rec),
        "f1": float(f1),
        "roc_auc": float(auc),
        "false_alarm_rate": float(fpr),
        "specificity": float(spec),
        "true_positives": int(tp),
        "false_positives": int(fp),
        "true_negatives": int(tn),
        "false_negatives": int(fn),
    }


def calibrate_optimal_threshold(
    val_probs: np.ndarray,
    val_labels: np.ndarray,
    max_target_fpr: float = 0.005,
) -> float:
    best_thresh = 0.5
    best_recall = -1.0
    for t in np.linspace(0.10, 0.90, 801):
        preds = (val_probs >= t).astype(int)
        tn, fp, fn, tp = confusion_matrix(val_labels, preds, labels=[0, 1]).ravel()
        fpr = fp / max(1, fp + tn)
        rec = tp / max(1, tp + fn)
        if fpr <= max_target_fpr:
            if rec > best_recall:
                best_recall = rec
                best_thresh = float(t)
    return best_thresh


def bake_threshold_into_model(model: nn.Module, threshold: float) -> float:
    tau = max(1e-4, min(1.0 - 1e-4, float(threshold)))
    delta = math.log(tau / (1.0 - tau))
    with torch.no_grad():
        if hasattr(model, "classifier"):
            cls_module = model.classifier
            if hasattr(cls_module, "bias") and cls_module.bias is not None:
                cls_module.bias[0] += delta
            elif hasattr(cls_module, "out_proj") and hasattr(cls_module.out_proj, "bias"):
                cls_module.out_proj.bias[0] += delta
            elif hasattr(cls_module, "linear") and hasattr(cls_module.linear, "bias"):
                cls_module.linear.bias[0] += delta
    return delta


def export_to_onnx_and_quantize(
    model_dir: str,
    onnx_dir: str,
    tokenizer: AutoTokenizer,
    max_length: int = MAX_SEQ_LENGTH,
) -> Dict[str, Any]:
    import onnx
    import onnxruntime as ort
    from onnxruntime.quantization import QuantType, quantize_dynamic

    out_p = Path(onnx_dir)
    out_p.mkdir(parents=True, exist_ok=True)
    fp32_onnx = out_p / "model_fp32.onnx"
    int8_onnx = out_p / "packguard_modernbert_v3_int8.onnx"

    model = AutoModelForSequenceClassification.from_pretrained(model_dir)
    model.eval()

    dummy_text = "function test(){ return true; }"
    dummy_inputs = tokenizer(
        dummy_text,
        max_length=max_length,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )

    print(f"[v3 ONNX] Exporting FP32 model to {fp32_onnx}...", flush=True)
    torch.onnx.export(
        model,
        (dummy_inputs["input_ids"], dummy_inputs["attention_mask"]),
        str(fp32_onnx),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "logits": {0: "batch_size"},
        },
        opset_version=17,
        do_constant_folding=True,
    )

    print(f"[v3 ONNX] Dynamic INT8 quantization -> {int8_onnx}...", flush=True)
    quantize_dynamic(
        model_input=str(fp32_onnx),
        model_output=str(int8_onnx),
        weight_type=QuantType.QUInt8,
    )

    fp32_onnx.unlink(missing_ok=True)
    tokenizer.save_pretrained(str(out_p))

    tar_path = Path("/home/USER/packguard-modernbert-v3-onnx.tar.gz")
    with tarfile.open(tar_path, "w:gz") as tar:
        for f in out_p.iterdir():
            tar.add(f, arcname=f.name)

    tar_size = tar_path.stat().st_size / (1024 * 1024)
    print(f"[v3 ONNX] Created archive: {tar_path} ({tar_size:.1f} MB)", flush=True)
    return {"tar_path": str(tar_path), "tar_size_mb": round(tar_size, 2)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="/home/USER/stage2_v3_data")
    parser.add_argument("--output-dir", default="/home/USER/stage2_v3_ckpt")
    parser.add_argument("--onnx-dir", default="/home/USER/stage2_v3_onnx")
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=2e-5)
    args = parser.parse_args()

    set_seed(42)
    attn_impl = configure_gpu_environment()

    print("[PackGuard v3] Loading ModernBERT tokenizer and model...", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_ID,
        num_labels=2,
        id2label=ID2LABEL,
        label2id=LABEL2ID,
        attn_implementation=attn_impl,
        torch_dtype=torch.bfloat16,
    )

    print("[PackGuard v3] Preprocessing dataset...", flush=True)
    raw_ds = load_local_dataset(args.data_dir)
    tokenized_ds = preprocess_dataset(raw_ds, tokenizer, max_length=MAX_SEQ_LENGTH)

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size * 2,
        learning_rate=args.lr,
        weight_decay=0.01,
        warmup_steps=100,
        bf16=True,
        tf32=True,
        logging_steps=50,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=1,
        load_best_model_at_end=True,
        metric_for_best_model="eval_roc_auc",
        greater_is_better=True,
        dataloader_num_workers=16,
        dataloader_persistent_workers=True,
        dataloader_prefetch_factor=4,
        optim="adamw_torch_fused",
        report_to="none",
    )

    trainer = FocalLossStage2Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_ds["train"],
        eval_dataset=tokenized_ds["validation"],
        processing_class=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer, pad_to_multiple_of=8),
        compute_metrics=compute_security_metrics,
        alpha_benign=0.55,
        gamma=2.0,
    )

    print("[PackGuard v3] Starting RTX PRO 6000 Blackwell training...", flush=True)
    t0 = time.time()
    train_result = trainer.train()
    train_time = time.time() - t0
    print(f"[PackGuard v3] Training completed in {train_time:.2f}s ({train_time/60:.2f}m)!", flush=True)

    # Validation evaluation
    print("[PackGuard v3] Evaluating on validation set...", flush=True)
    val_pred = trainer.predict(tokenized_ds["validation"])
    val_probs = _softmax_mal_probs(val_pred.predictions)
    val_labels = val_pred.label_ids

    # Hard-benign holdout evaluation
    hb_pred = trainer.predict(tokenized_ds["hard_benign_val"])
    hb_probs = _softmax_mal_probs(hb_pred.predictions)
    hb_labels = hb_pred.label_ids

    # Optimal threshold calibration for <0.5% False Alarm Rate
    opt_thresh = calibrate_optimal_threshold(val_probs, val_labels, max_target_fpr=0.005)
    print(f"[PackGuard v3] Optimal threshold for <0.5% FPR: {opt_thresh:.4f}")

    # Bake threshold into classifier bias
    delta = bake_threshold_into_model(model, opt_thresh)
    print(f"[PackGuard v3] Baked bias delta: {delta:+.6f}")

    # Save calibrated model
    calibrated_dir = Path(args.output_dir) / "calibrated_model"
    model.save_pretrained(str(calibrated_dir))
    tokenizer.save_pretrained(str(calibrated_dir))

    # Export ONNX and quantize
    export_to_onnx_and_quantize(str(calibrated_dir), args.onnx_dir, tokenizer)

    # Save threshold metadata
    thresh_meta = {
        "best_threshold": 0.5,
        "threshold": 0.5,
        "pre_bake_optimal_threshold": round(opt_thresh, 4),
        "baked_bias_delta": round(delta, 6),
        "note": "Calibrated with Focal Loss and baked into classifier bias for <0.5% FPR."
    }
    (Path(args.onnx_dir) / "best_threshold.json").write_text(json.dumps(thresh_meta, indent=2))
    print("[PackGuard v3] Training, calibration, and ONNX export 100% complete!")


if __name__ == "__main__":
    import tarfile
    main()
