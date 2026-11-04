# PackGuard CLI / TUI frontend

A small Rust wrapper around the C stage-1 scanner. It does not implement detection: it runs `packguard`, reads the JSON reports, and prints a ranked table. `--tui` opens a full-screen terminal interface built with [Cursive](https://github.com/gyscos/cursive) in the white-on-blue style of a classic ncurses application.

The known/mangled mode (v6) uses thresholds **0.70** raw, **0.65** normalised and **0.50** for install scripts, and needs benign references (`--benign`) for its veto: a chunk only counts when it is closer to malware than to benign code by a margin (0.10 raw, 0.07 normalised). The new-campaign mode uses **0.50** plus behavioural primitives. Stage 2, which is built and committed on `main`, filters the remaining false alarms; `--stage2` runs it on the reports of the same command.

## Build

```bash
cd frontend
cargo build --release
```

The first build fetches Cursive 0.21 and its dependencies from crates.io and updates `Cargo.lock`.

The C scanner must already be built:

```bash
# Linux / WSL
make -j4
# Windows
.\scripts\build-windows.ps1
```

The default scanner is `packguard` from `PATH` (`packguard.exe` on Windows), so either add the scanner's output directory to `PATH` or pass `--packguard ../build/packguard`.

## CLI

```bash
./target/release/packguard-cli --mode new \
    --refs <reference_dir> \
    --scan-dir <directory-of-packages>

./target/release/packguard-cli --mode known \
    --refs <reference_dir> \
    --benign <benign_reference_dir> \
    --package <one-package-dir>

./target/release/packguard-cli --mode known \
    --refs <reference_dir> --benign <benign_reference_dir> \
    --scan-dir <directory-of-packages> \
    --stage2 --stage2-model "stage 2 LLM Model/v2/model_int8"
```

Options:

| Option | Meaning |
|---|---|
| `--mode known\|new` | `known` = v6: raw + normalised views, payload files, repeat collapsing, 0.70 / 0.65 / 0.50 thresholds; `new` = raw NCD + behavioural primitives at 0.50 |
| `--refs` | Malware reference directory |
| `--benign` | Benign reference directory, passed to the scanner as `-B` (known mode's benign veto) |
| `--scan-dir` | Scan every package directly inside this directory |
| `--package` | Scan one package; repeatable |
| `--packguard` | Path to the C scanner; defaults to `packguard` from `PATH` (`packguard.exe` on Windows) |
| `--threads` | Worker threads, default 4 |
| `--reports` | Keep the JSON reports in this directory instead of a temp directory |
| `--stage2` | Pass the reports through the stage 2 ONNX filter after stage 1 finishes |
| `--stage2-model` | Directory holding `packguard_modernbert_v2_int8.onnx`, the tokenizer and `best_threshold.json`; default `model_int8` next to `stage2_filter.py` |
| `--stage2-python` | Interpreter used for `stage2_filter.py`; default `stage 2 LLM Model/v2/.venv-stage2` when the installer created it, otherwise `python3` (POSIX) or `python` (Windows) |
| `--stage2-script` | Path to `stage2_filter.py`; by default it is looked up in the repository around the current directory and the binary |
| `--tui` | Full-screen terminal interface (Cursive) |

The table shows package, version, NCD score, primitive score, the stage 2 probability, the final flag and the primitive hits. Reports with `--reports` can be handed to stage 2, and a `--stage2` run leaves the stage 2 fields in them.

## Stage 2

`--stage2` chains the two stages in one command. After `packguard` writes the JSON reports, the CLI runs the Python filter:

```bash
<python> "stage 2 LLM Model/v2/stage2_filter.py" \
    --reports <report_dir> --out-dir <report_dir> \
    --model-dir <model_dir> --threads <threads>
```

The filter scores the packages stage 1 flagged, adds `stage2_prob` and `stage2_flagged` to each report and sets `flagged` to the stage 1 result **and** the stage 2 verdict. The CLI then reads the updated reports, so the `S2` column shows the model's probability (and the footer counts stage 1 flags against stage 2 confirmations) and `FLAGGED` is the final verdict. Packages stage 1 cleared are not sent to the model; their `S2` column shows `-`.

Install the model once before the first `--stage2` run:

```bash
bash "stage 2 LLM Model/v2/install_model.sh"          # Linux / WSL
powershell -ExecutionPolicy Bypass -File "stage 2 LLM Model\v2\install_model.ps1"
```

The default model directory is `stage 2 LLM Model/v2/model_int8`; use `--stage2-model` when the ONNX files live elsewhere, and `--stage2-python` when the interpreter or virtual environment is in another place. Stage 2 runs on the CPU through ONNX Runtime and needs no GPU.

## TUI

```bash
./target/release/packguard-cli --tui --packguard ../build/packguard
```

`--tui` opens a full-screen Cursive interface modelled on `make menuconfig` / `mconf`, using the terminal's own colors: default background and foreground (black and white in a normal terminal), a bold centred title, a full-width menu with an inverse-video selected row, and the key legend along the bottom.

The main menu is a Kconfig-style list. Entries shown as `(value)` open an edit dialog, `--->` entries open a submenu, and `[*]` marks the active mode, the stage 2 filter or a flagged package. The settings cover the mode, malware and benign reference directories, scan directory, extra packages (separated by `;`), scanner path, thread count, report directory, the stage 2 filter and its model directory.

| Key | Action |
|---|---|
| `Up` / `Down` | Move through the menu |
| `Space` / `Enter` | Open a submenu, edit a value, or run the action |
| `Esc` | Leave the current menu; quits from the main menu |
| `S` | Run a scan |
| `R` | View results |
| `H` | Help |
| `Q` | Quit |

The results menu ranks flagged packages first, then lowest NCD; `Enter` opens a package's details, including the stage 1 flag and the stage 2 probability when `--stage2` ran. Scans run on a background thread, so the interface keeps redrawing and the status line above the key legend shows elapsed time, progress and errors. The TUI reads the same JSON reports as the CLI, so `--reports <dir>` still keeps them for stage 2.

## Safety

On Windows, scan only benign code. Malware must be handled inside WSL, as in the main project. The wrapper follows the same rule: it runs whatever `packguard` binary you give it and never executes package code.
