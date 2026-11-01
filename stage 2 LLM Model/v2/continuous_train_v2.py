import argparse
import concurrent.futures
import json
import subprocess
import sys
import time
from pathlib import Path

from prepare_stage2_v2_data import (
    collect_benign_package_specs,
    download_benign_corpus,
    extract_malware_packages,
)


def background_prefetch(
    repo_root: Path,
    out_dir: Path,
    target_malware: int,
    target_benign: int,
    workers: int,
    seed: int,
) -> dict:
    """Prefetch additional malware and benign npm packages in the background while GPU trains."""
    t0 = time.time()
    print(
        f"[Continuous Harvester] Background prefetch started: "
        f"target_malware={target_malware}, target_benign={target_benign}"
    )
    mal_dirs = extract_malware_packages(
        zip_dir=repo_root / "data" / "v2",
        out_dir=out_dir / "raw_malware",
        max_packages=target_malware,
        seed=seed,
    )
    ben_specs = collect_benign_package_specs(
        repo_root=repo_root,
        max_packages=target_benign,
        seed=seed,
    )
    ben_items = download_benign_corpus(
        specs=ben_specs,
        out_dir=out_dir / "raw_benign",
        workers=workers,
    )
    elapsed = round(time.time() - t0, 2)
    print(
        f"[Continuous Harvester] Background prefetch finished in {elapsed}s: "
        f"malware={len(mal_dirs)}, benign={len(ben_items)}"
    )
    return {
        "prefetched_malware": len(mal_dirs),
        "prefetched_benign": len(ben_items),
        "prefetch_seconds": elapsed,
    }


def run_cmd(cmd: list[str]) -> None:
    print(f"[Continuous Trainer] Executing: {' '.join(cmd)}", flush=True)
    subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Simultaneous background dataset harvesting + multi-round ModernBERT v2 GPU training."
    )
    parser.add_argument("--repo_root", type=str, default="../..")
    parser.add_argument("--data_dir", type=str, default="./data_v2")
    parser.add_argument("--round1_mal", type=int, default=1600)
    parser.add_argument("--round1_ben", type=int, default=1800)
    parser.add_argument("--round2_mal", type=int, default=3000)
    parser.add_argument("--round2_ben", type=int, default=3200)
    parser.add_argument("--round1_epochs", type=int, default=3)
    parser.add_argument("--round2_epochs", type=int, default=3)
    parser.add_argument("--max_length", type=int, default=2048)
    parser.add_argument("--batch_size", type=int, default=8)
    parser.add_argument("--grad_accum", type=int, default=4)
    parser.add_argument("--benign_weight", type=float, default=2.5)
    parser.add_argument("--workers", type=int, default=32)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    data_dir = Path(args.data_dir).resolve()
    py = sys.executable

    overall_start = time.time()

    # Step 1: Prepare Round 1 dataset
    print("\n=== [ROUND 1] Building Initial Dataset ===")
    run_cmd(
        [
            py,
            "prepare_stage2_v2_data.py",
            "--repo_root",
            str(repo_root),
            "--out_dir",
            str(data_dir),
            "--max_malware",
            str(args.round1_mal),
            "--max_benign",
            str(args.round1_ben),
            "--workers",
            str(args.workers),
            "--seed",
            str(args.seed),
        ]
    )

    round1_ds_summary = json.loads((data_dir / "dataset_summary.json").read_text(encoding="utf-8"))

    # Step 2: Launch background harvester for Round 2 AT THE SAME TIME as GPU trains Round 1!
    print("\n=== [ROUND 1 GPU TRAINING + SIMULTANEOUS ROUND 2 DATA HARVESTING] ===")
    round1_out = Path("./modernbert_v2_round1").resolve()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as bg_pool:
        prefetch_future = bg_pool.submit(
            background_prefetch,
            repo_root,
            data_dir,
            args.round2_mal,
            args.round2_ben,
            args.workers,
            args.seed,
        )

        # While background thread downloads new npm packages, train Round 1 on the Tesla T4 GPU
        run_cmd(
            [
                py,
                "train_modernbert_v2.py",
                "--data_dir",
                str(data_dir),
                "--init_model",
                "answerdotai/ModernBERT-base",
                "--output_dir",
                str(round1_out),
                "--max_length",
                str(args.max_length),
                "--batch_size",
                str(args.batch_size),
                "--grad_accum",
                str(args.grad_accum),
                "--epochs",
                str(args.round1_epochs),
                "--lr",
                "2.5e-5",
                "--benign_weight",
                str(args.benign_weight),
                "--seed",
                str(args.seed),
            ]
        )

        prefetch_stats = prefetch_future.result()

    round1_metrics = json.loads(
        (round1_out / "final_model" / "calibration_metrics.json").read_text(encoding="utf-8")
    )

    # Step 3: Build Round 2 expanded JSONL splits using the newly harvested packages
    print("\n=== [ROUND 2] Building Expanded Dataset from Newly Harvested Packages ===")
    run_cmd(
        [
            py,
            "prepare_stage2_v2_data.py",
            "--repo_root",
            str(repo_root),
            "--out_dir",
            str(data_dir),
            "--max_malware",
            str(args.round2_mal),
            "--max_benign",
            str(args.round2_ben),
            "--workers",
            str(args.workers),
            "--seed",
            str(args.seed),
        ]
    )
    round2_ds_summary = json.loads((data_dir / "dataset_summary.json").read_text(encoding="utf-8"))

    # Step 4: Warm-start Round 2 training from Round 1 checkpoint + Export INT8 ONNX model
    print("\n=== [ROUND 2 GPU TRAINING (WARM-START) + ONNX INT8 EXPORT] ===")
    round2_out = Path("./modernbert_v2_round2").resolve()
    onnx_out = Path("./model_int8").resolve()
    run_cmd(
        [
            py,
            "train_modernbert_v2.py",
            "--data_dir",
            str(data_dir),
            "--init_model",
            str(round1_out / "final_model"),
            "--output_dir",
            str(round2_out),
            "--max_length",
            str(args.max_length),
            "--batch_size",
            str(args.batch_size),
            "--grad_accum",
            str(args.grad_accum),
            "--epochs",
            str(args.round2_epochs),
            "--lr",
            "1.2e-5",
            "--benign_weight",
            str(args.benign_weight),
            "--export_onnx",
            "--onnx_dir",
            str(onnx_out),
            "--seed",
            str(args.seed),
        ]
    )

    round2_metrics = json.loads(
        (round2_out / "final_model" / "calibration_metrics.json").read_text(encoding="utf-8")
    )
    onnx_stats = json.loads(
        (round2_out / "final_model" / "onnx_export_stats.json").read_text(encoding="utf-8")
    )

    total_seconds = round(time.time() - overall_start, 2)
    full_report = {
        "total_pipeline_seconds": total_seconds,
        "round1_dataset": round1_ds_summary,
        "round1_metrics": round1_metrics,
        "background_prefetch": prefetch_stats,
        "round2_dataset": round2_ds_summary,
        "round2_metrics": round2_metrics,
        "onnx_export": onnx_stats,
    }
    Path("./v2_training_report.json").write_text(
        json.dumps(full_report, indent=2),
        encoding="utf-8",
    )
    print(f"\n=== [COMPLETE] Stage 2 v2 Multi-Round Training Report ===\n{json.dumps(full_report, indent=2)}")


if __name__ == "__main__":
    main()
