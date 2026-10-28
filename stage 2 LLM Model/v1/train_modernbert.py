import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import torch
from datasets import Dataset, DatasetDict, load_dataset
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
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
            f"[PackGuard] GPU Detected: {device_name} "
            f"(sm_{major}{minor}, {vram_gb:.1f} GB VRAM)"
        )
    else:
        print("[PackGuard] WARNING: CUDA GPU not detected. Training on CPU will be slow.")

    if torch.cuda.is_available() and torch.cuda.get_device_capability(0)[0] >= 8:
        try:
            import flash_attn

            print("[PackGuard] FlashAttention-2 enabled for 8,192-token unpadded attention.")
            return "flash_attention_2"
        except ImportError:
            pass

    print("[PackGuard] Using PyTorch SDPA (memory-efficient scaled dot-product attention).")
    return "sdpa"


def format_scanner_chunks_to_text(record: Dict[str, Any]) -> str:
    """
    Assemble PackGuard Stage 1 scanner JSON (`package`, `version`, `score`, `chunks`)
    into a single prioritized document for ModernBERT's 8,192-token window.
    Chunks are sorted by ascending NCD (lowest NCD = most similar to known malware)
    so the most suspicious regions are never truncated at the 8,192-token boundary.
    """
    if "text" in record and isinstance(record["text"], str) and "chunks" not in record:
        return record["text"]

    pkg_name = record.get("package", "unknown-pkg")
    pkg_version = record.get("version", "0.0.0")
    pkg_score = record.get("score", 1.0)
    chunks = record.get("chunks") or []

    sorted_chunks = sorted(chunks, key=lambda c: float(c.get("ncd", 1.0)))
    sections = [f"// Package: {pkg_name}@{pkg_version} | Stage1 Min NCD: {pkg_score:.4f}"]
    for chunk in sorted_chunks:
        file_path = chunk.get("file", "unknown.js")
        start_offset = chunk.get("start", 0)
        ncd_val = float(chunk.get("ncd", 1.0))
        chunk_text = chunk.get("text", "")
        sections.append(
            f"// File: {file_path} (offset={start_offset}, ncd={ncd_val:.4f})\n{chunk_text}"
        )
    return "\n\n".join(sections)


def parse_label(raw_label: Any) -> int:
    """Normalize string or integer labels into {0: benign, 1: malicious}."""
    if isinstance(raw_label, (int, np.integer, bool)):
        return int(raw_label)
    cleaned = str(raw_label).strip().lower()
    if cleaned in LABEL2ID:
        return LABEL2ID[cleaned]
    return int(cleaned)


def _load_directory_of_scanner_jsons(data_path: Path) -> DatasetDict:
    """Load per-package Stage 1 JSON files from class subdirectories."""
    records_by_split: Dict[str, List[Dict[str, Any]]] = {}

    for split_name in ["train", "validation", "val", "test"]:
        split_dir = data_path / split_name
        if split_dir.is_dir():
            target_key = "validation" if split_name == "val" else split_name
            records_by_split.setdefault(target_key, [])
            for class_name, label_id in [("benign", 0), ("clean", 0), ("malicious", 1), ("malware", 1)]:
                class_dir = split_dir / class_name
                if class_dir.is_dir():
                    for json_file in sorted(class_dir.glob("*.json")):
                        payload = json.loads(json_file.read_text(encoding="utf-8", errors="replace"))
                        records_by_split[target_key].append(
                            {"text": format_scanner_chunks_to_text(payload), "label": label_id}
                        )

    if not records_by_split:
        all_records: List[Dict[str, Any]] = []
        for class_name, label_id in [("benign", 0), ("clean", 0), ("malicious", 1), ("malware", 1)]:
            class_dir = data_path / class_name
            if class_dir.is_dir():
                for json_file in sorted(class_dir.glob("*.json")):
                    payload = json.loads(json_file.read_text(encoding="utf-8", errors="replace"))
                    all_records.append(
                        {"text": format_scanner_chunks_to_text(payload), "label": label_id}
                    )
        if all_records:
            ds = Dataset.from_list(all_records)
            split_ds = ds.train_test_split(test_size=0.1, seed=42)
            return DatasetDict({"train": split_ds["train"], "validation": split_ds["test"]})
        return DatasetDict()

    return DatasetDict({k: Dataset.from_list(v) for k, v in records_by_split.items() if v})


def load_local_dataset(data_dir: str) -> DatasetDict:
    """Ingest local dataset files (split files or Stage 1 scanner JSON directories)."""
    data_path = Path(data_dir)
    if not data_path.exists():
        raise FileNotFoundError(
            f"Dataset directory not found: {data_path.resolve()}. "
            "Place train/validation files or Stage 1 scanner JSONs in `--data_dir`."
        )

    data_files: Dict[str, str] = {}
    for split in ["train", "validation", "val", "test"]:
        for ext in ["jsonl", "json", "parquet", "csv"]:
            candidate = data_path / f"{split}.{ext}"
            if candidate.exists():
                key = "validation" if split == "val" else split
                data_files[key] = str(candidate)
                break

    if data_files:
        ext = Path(next(iter(data_files.values()))).suffix.lstrip(".")
        loader_type = "json" if ext in ("json", "jsonl") else ext
        raw_datasets = load_dataset(loader_type, data_files=data_files)
    else:
        raw_datasets = _load_directory_of_scanner_jsons(data_path)
        if not raw_datasets:
            raise ValueError(
                f"No valid dataset found in {data_path.resolve()}. Provide either "
                "train.{jsonl,json,csv,parquet} or {benign,malicious}/*.json files."
            )

    if "validation" not in raw_datasets:
        print("[PackGuard] No validation split found; splitting 10% from train set.")
        split_ds = raw_datasets["train"].train_test_split(test_size=0.1, seed=42)
        raw_datasets["train"] = split_ds["train"]
        raw_datasets["validation"] = split_ds["test"]

    return raw_datasets


def compute_metrics(eval_pred) -> Dict[str, float]:
    """Compute PackGuard evaluation metrics (Precision, Recall, F1, False Alarm Rate)."""
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)

    tn, fp, fn, tp = confusion_matrix(labels, preds, labels=[0, 1]).ravel()
    false_alarm_rate = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0

    return {
        "accuracy": float(accuracy_score(labels, preds)),
        "precision": float(precision_score(labels, preds, pos_label=1, zero_division=0)),
        "recall": float(recall_score(labels, preds, pos_label=1, zero_division=0)),
        "f1": float(f1_score(labels, preds, pos_label=1, zero_division=0)),
        "false_alarm_rate": false_alarm_rate,
    }


def main():
    """Parse arguments, fine-tune ModernBERT-base on Stage 1 chunks, and save final weights."""
    parser = argparse.ArgumentParser(
        description="PackGuard Stage 2: Train ModernBERT-base (8,192 tokens) on NVIDIA T4 / A100"
    )
    parser.add_argument(
        "--data_dir",
        type=str,
        default="./data",
        help="Path to local dataset directory",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default="./checkpoints/packguard-modernbert",
        help="Directory to save model checkpoints and final weights",
    )
    parser.add_argument(
        "--text_column",
        type=str,
        default="text",
        help="Column name for raw package text (if not using Stage 1 `chunks` schema)",
    )
    parser.add_argument(
        "--label_column",
        type=str,
        default="label",
        help="Column name for binary label (0=benign, 1=malicious)",
    )
    parser.add_argument(
        "--max_length",
        type=int,
        default=MAX_SEQ_LENGTH,
        help="Maximum sequence length (default: 8192 for full ModernBERT context)",
    )
    parser.add_argument(
        "--per_device_train_batch_size",
        type=int,
        default=2,
        help="Micro-batch size per GPU at 8,192 tokens (default: 2 for 16GB T4, 4 for 40GB A100)",
    )
    parser.add_argument(
        "--per_device_eval_batch_size",
        type=int,
        default=4,
        help="Evaluation batch size per GPU (default: 4 for 16GB T4, 8 for 40GB A100)",
    )
    parser.add_argument(
        "--gradient_accumulation_steps",
        type=int,
        default=16,
        help="Gradient accumulation steps (effective batch size = 2 * 16 = 32)",
    )
    parser.add_argument(
        "--learning_rate",
        type=float,
        default=5e-5,
        help="Peak learning rate for ModernBERT fine-tuning",
    )
    parser.add_argument(
        "--num_train_epochs",
        type=int,
        default=3,
        help="Total number of training epochs",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    set_seed(args.seed)
    attn_impl = configure_gpu_environment()

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    raw_datasets = load_local_dataset(args.data_dir)

    def preprocess_batch(batch: Dict[str, List[Any]]) -> Dict[str, Any]:
        """Tokenize a batch of Stage 1 package records up to max_length."""
        num_examples = len(batch[args.label_column])
        texts: List[str] = []
        for idx in range(num_examples):
            row = {k: batch[k][idx] for k in batch}
            if args.text_column in row and row[args.text_column] and "chunks" not in row:
                texts.append(str(row[args.text_column]))
            else:
                texts.append(format_scanner_chunks_to_text(row))

        tokenized = tokenizer(
            texts,
            truncation=True,
            max_length=args.max_length,
            padding=False,
        )
        tokenized["labels"] = [parse_label(lbl) for lbl in batch[args.label_column]]
        return tokenized

    tokenized_datasets = raw_datasets.map(
        preprocess_batch,
        batched=True,
        num_proc=min(8, os.cpu_count() or 1),
        remove_columns=raw_datasets["train"].column_names,
        desc=f"Tokenizing packages (max_length={args.max_length})",
    )

    major_cc = torch.cuda.get_device_capability(0)[0] if torch.cuda.is_available() else 0
    use_bf16 = torch.cuda.is_available() and major_cc >= 8 and torch.cuda.is_bf16_supported()
    use_fp16 = torch.cuda.is_available() and not use_bf16
    use_tf32 = torch.cuda.is_available() and major_cc >= 8

    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_ID,
        num_labels=2,
        id2label=ID2LABEL,
        label2id={"benign": 0, "malicious": 1},
        torch_dtype=torch.bfloat16 if use_bf16 else torch.float32,
        attn_implementation=attn_impl,
    )

    data_collator = DataCollatorWithPadding(tokenizer=tokenizer, pad_to_multiple_of=8)

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.num_train_epochs,
        per_device_train_batch_size=args.per_device_train_batch_size,
        per_device_eval_batch_size=args.per_device_eval_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        learning_rate=args.learning_rate,
        weight_decay=0.01,
        warmup_ratio=0.06,
        lr_scheduler_type="cosine",
        bf16=use_bf16,
        fp16=use_fp16,
        tf32=use_tf32,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        optim="adamw_torch_fused" if torch.cuda.is_available() else "adamw_torch",
        dataloader_num_workers=4 if os.name != "nt" else 0,
        dataloader_pin_memory=torch.cuda.is_available(),
        group_by_length=True,
        eval_strategy="steps",
        eval_steps=200,
        save_strategy="steps",
        save_steps=200,
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        logging_steps=25,
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=tokenized_datasets["validation"],
        processing_class=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
    )

    print("[PackGuard] Starting ModernBERT-base fine-tuning (8,192-token context)...")
    trainer.train()

    eval_metrics = trainer.evaluate()
    print(f"[PackGuard] Final Validation Metrics: {eval_metrics}")

    final_dir = Path(args.output_dir) / "final"
    trainer.save_model(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))
    print(f"[PackGuard] Saved fine-tuned model and tokenizer to: {final_dir.resolve()}")


if __name__ == "__main__":
    main()
