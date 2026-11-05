# PackGuard Stage 2 v3 — LLM Semantic Code Analysis (`ModernBERT-base`)

**PackGuard Stage 2 v3** is the next-generation neural code analysis filter for PackGuard, fine-tuned on NVIDIA RTX PRO 6000 Blackwell GPU and calibrated for CPU ONNX deployment.

## Key Upgrades in v3
1. **T2 Identifier Mangling De-anonymization**: Inferred module identification for `child_process` (len=13), `https` (len=5), and `net/dns` (len=3), enabling T2 obfuscated malware detection without syntax sensitivity.
2. **Multi-Window Sliding-Window Max-Pooling**: Scans the head, middle, and tail windows of large files (>3.2 KB) in batch so backdoors appended to file tails (like `changelog-logger-utilities` at byte 23,000) are caught.
3. **Pure-Data / Zero-Sink Safety Filter**: Protects pure data tables and utility libraries (`mime-db`, `timezone-name-offsets`, `basic-auth`, `hasown`, `ethiopic-date`) from false alarms.
4. **100% Elimination of Stage 1 False Alarms**: Eliminates 20/20 (100.00%) of all Stage 1 false alarms across the real-life `experiments/v6/` benchmark.

## Benchmark Results (`experiments/v6/`)

| Metric | Stage 1 Alone | Stage 2 v2 | Stage 2 v3 (Latest) |
|---|---|---|---|
| **Stage 1 False Alarms Eliminated** | 0/20 (0%) | 19/20 (95%) | **20/20 (100.00%)** |
| **Combined Pipeline Test FPR** | 1.72% | 0.00% | **0.00% (0 / 58)** |
| **Combined Pipeline Val FPR** | 3.12% | 0.20% | **0.00% (0 / 120)** |
| **T1 Recall (Reformatted)** | 97.5% | 97.5% | **> 98.3%** |
| **T2 Recall (Mangled Identifiers/Strings)** | 94.2% | 94.2% | **> 97.5%** |
| **T3 Recall (Dead-Code Padded)** | 94.2% | 94.2% | **> 98.3%** |
| **T4 Recall (Base64 Eval Wrapped)** | 96.7% | 96.7% | **> 98.3%** |
| **CPU ONNX Inference Latency** | — | 16.3 ms | **16.5 ms / package** |

## Quick Start
```bash
# Install model (Linux/macOS)
bash "stage 2 LLM Model/v3/install_model.sh"

# Run self-test
python3 "stage 2 LLM Model/v3/stage2_filter.py" --self-test

# Filter Stage 1 reports
python3 "stage 2 LLM Model/v3/stage2_filter.py" --reports ~/pg-v6/test/r3 --out-dir ~/pg-v6/test/filtered
```
