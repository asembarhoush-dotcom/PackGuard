# PackGuard CLI / TUI frontend

A small Rust wrapper around the C stage-1 scanner. It does not implement detection: it runs `packguard`, reads the JSON reports, and prints a ranked table. `--tui` opens a simple interactive menu.

The known/mangled mode (v6) uses thresholds **0.70** raw, **0.65** normalised and **0.50** for install scripts, and needs benign references (`--benign`) for its veto: a chunk only counts when it is closer to malware than to benign code by a margin (0.10 raw, 0.07 normalised). The new-campaign mode uses **0.50** plus behavioural primitives. Stage 2, which is built and committed on `main`, filters the remaining false alarms.

## Build

```bash
cd frontend
cargo build --release
```

The C scanner must already be built:

```bash
# Linux / WSL
make -j4
# Windows
.\scripts\build-windows.ps1
```

## CLI

```bash
./target/release/packguard-cli --mode new \
    --refs <reference_dir> \
    --scan-dir <directory-of-packages>

./target/release/packguard-cli --mode known \
    --refs <reference_dir> \
    --benign <benign_reference_dir> \
    --package <one-package-dir>
```

Options:

| Option | Meaning |
|---|---|
| `--mode known\|new` | `known` = v6: raw + normalised views, payload files, repeat collapsing, 0.70 / 0.65 / 0.50 thresholds; `new` = raw NCD + behavioural primitives at 0.50 |
| `--refs` | Malware reference directory |
| `--benign` | Benign reference directory, passed to the scanner as `-B` (known mode's benign veto) |
| `--scan-dir` | Scan every package directly inside this directory |
| `--package` | Scan one package; repeatable |
| `--packguard` | Path to the C scanner; defaults to `build/packguard` (`build/packguard.exe` on Windows) |
| `--threads` | Worker threads, default 4 |
| `--reports` | Keep the JSON reports in this directory instead of a temp directory |
| `--tui` | Interactive menu |

The table shows package, version, NCD score, primitive score, the final flag and the primitive hits. Reports with `--reports` can be handed to stage 2.

## TUI

```bash
./target/release/packguard-cli --tui --packguard ../build/packguard
```

The menu lets you change the mode, reference directory, scan directory, scanner path and benign reference directory, run a scan, and inspect the table. It is a line-based ANSI menu, not a full-screen terminal application.

## Safety

On Windows, scan only benign code. Malware must be handled inside WSL, as in the main project. The wrapper follows the same rule: it runs whatever `packguard` binary you give it and never executes package code.
