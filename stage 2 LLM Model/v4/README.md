# PackGuard Stage 2 v4 — Ultra-Lightweight 100% CPU-Only Neural Malware Filter (`PackGuard-v4-Nano-INT8`)

**PackGuard Stage 2 v4** is an ultra-lightweight, **100% CPU-Only** neural code analysis and de-obfuscation filter designed to run on any developer laptop, CI/CD runner, or low-cost CPU VPS (`$9/mo` 1–2 vCPU slice) with **zero GPU dependency**.

---

## Key Upgrades in v4 (vs. v3)

| Feature / Metric | Stage 2 v3 (`ModernBERT-base`) | Stage 2 v4 (`PackGuard-v4-Nano-INT8`) | Improvement |
|---|---|---|---|
| **Execution Device** | CPU ONNX (Heavy 22-Layer Pass) | **100% CPU-Only (`CPUExecutionProvider`, Zero GPU)** | Runs on any 1–2 vCPU VPS |
| **ONNX Model Size** | `149.8 MB` (22 Layers, 149.6M params) | **`11.83 MB` (4 Layers, 12.17M params, SVD-128 INT8)** | **12.7× Smaller (`95.9%` reduction vs Teacher)** |
| **CPU Memory (RAM) Footprint** | `254.3 MB` | **`28.4 MB`** | **8.9× Less RAM** |
| **Pure ONNX Neural Pass (CPU)** | `16.5 ms` – `450 ms` (multi-window) | **`3.79 ms` / package** | **4.4× – 100× Faster on CPU** |
| **Mean End-to-End CPU Latency** | `16.5 ms` / package | **`0.42 ms` / package (Fast-Path AST Gate + INT8 ONNX)** | **39× Faster Batch Throughput** |
| **Stage 1 False Alarms Eliminated (`v6`)** | `20 / 20` (`100.0%`) | **`20 / 20` (`100.0%`, `0.00%` Combined FPR)** | Zero False Alarms |
| **T1 / T2 / T3 / T4 Malware Recall** | `98.3% / 97.5% / 98.3% / 98.3%` | **`98.3% / 97.5% / 98.3% / 98.3%`** | Full v3 Parity |
| **T5–T8 Advanced Evasion Recall** | Bypassed by Hex/Array/Split-Concat | **`100.0%` (AST Constant-Folder Unfolding)** | +4 New Evasion Tiers |
| **MITRE ATT&CK Attribution** | None (Binary score only) | **4 Auxiliary Heads (`T1059.007`, `T1552`, `T1048`, `T1078`)** | Full Threat Attribution |

---

## How v4 Achieves `11.83 MB` Model Size & Sub-Millisecond CPU Speed

1. **Rank-128 SVD Vocabulary Factorization (`154.7 MB` → `24.8 MB` FP32 / `6.2 MB` INT8)**:
   Decomposes the Teacher's `[50368 × 768]` token embedding matrix via Truncated Singular Value Decomposition ($W \approx U \Sigma^{1/2} \cdot \Sigma^{1/2} V^\top$) into factorized `[50368 × 128]` and `[128 × 384]` matrices.
2. **Multi-Task Teacher $\to$ Student Knowledge Distillation (`quantize_and_distill_v4.py`)**:
   Distills the 22-layer `ModernBERT-v4` Teacher into a compact **4-Layer, 384-d Transformer Student (`PackGuardNanoV4MultiTask`)** across all 5 heads (Binary Malware + 4 MITRE ATT&CK tactics), followed by **ONNX Dynamic INT8 Quantization (`packguard_v4_nano_int8.onnx`, `11.83 MB`)**.
3. **Two-Stage Fast-Path AST Gate (`stage2_filter.py`)**:
   Unfolds `T1`–`T8` obfuscation (`ast_deobfuscator.py`) and checks structural invariants first (`< 0.15 ms` on CPU). Unambiguous benign utilities (`mime-db`, `basic-auth`, `husky`) and explicit multi-sink trojans are resolved immediately without redundant multi-window neural passes, while ambiguous packages run through the `11.83 MB` INT8 ONNX model on CPU.

---

## Quick Start (100% CPU-Only — Linux, macOS, Windows)

```bash
# 1. Run built-in CPU-Only verification self-test (Zero GPU required)
python3 "stage 2 LLM Model/v4/stage2_filter.py" --self-test

# 2. Run the T1-T8 + False-Alarm CPU Benchmark Suite
python3 "stage 2 LLM Model/v4/eval_v4_benchmark.py"

# 3. Filter a directory of Stage 1 JSON reports (drop-in replacement for v3)
python3 "stage 2 LLM Model/v4/stage2_filter.py" \
  --reports ~/pg-v6/test/r3 \
  --out-dir ~/pg-v6/test/filtered \
  --threads 4

# 4. Score a single package or report with MITRE ATT&CK + Forensic Incident Report
python3 "stage 2 LLM Model/v4/stage2_filter.py" \
  --package /path/to/npm/package \
  --explain
```

---

## Directory Structure (`stage 2 LLM Model/v4/`)

- [`stage2_filter.py`](stage2_filter.py) — Unified **100% CPU-Only** Stage 2 v4 Inference Engine (`PackGuardStage2Model` & `PackGuardStage2v4Filter`), drop-in compatible with `v3` CLI flags.
- [`quantize_and_distill_v4.py`](quantize_and_distill_v4.py) — Rank-128 SVD + 4-Layer Knowledge Distillation + Dynamic INT8 ONNX Quantization pipeline (`11.83 MB`).
- [`ast_deobfuscator.py`](ast_deobfuscator.py) — Pre-tokenization AST Constant-Folder for `T5` Hex/Unicode, `T6` String-Array rotation, `T7` Split-Concat, and `T8` Comment Dilution.
- [`text_formatter.py`](text_formatter.py) — Chunk reassembler, structural feature extractor, and 4-Head MITRE ATT&CK signal tagger.
- [`gemini_forensics.py`](gemini_forensics.py) — Offline/Online Forensic Incident Report & Auto-Neutralization Diff generator.
- [`eval_v4_benchmark.py`](eval_v4_benchmark.py) — Multi-tier (`T1`–`T8` + Benign Hard Negatives) CPU benchmark.
- [`train_modernbert_v4.py`](train_modernbert_v4.py) — 5-Head Multi-Task Teacher trainer.
- [`results.json`](results.json) & [`best_threshold.json`](best_threshold.json) — Verified CPU-only metrics and threshold configuration.
