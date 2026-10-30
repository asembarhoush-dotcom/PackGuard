# PackGuard CLI / TUI frontend

A small Rust wrapper around the C stage-1 scanner. It does not implement detection: it runs `packguard`, reads the JSON reports, and prints a ranked table. `--tui` opens a full-screen terminal interface built with [Cursive](https://github.com/gyscos/cursive) in the white-on-blue style of a classic ncurses application.

The known/mangled mode (v6) uses thresholds **0.70** raw, **0.65** normalised and **0.50** for install scripts, and needs benign references (`--benign`) for its veto: a chunk only counts when it is closer to malware than to benign code by a margin (0.10 raw, 0.07 normalised). The new-campaign mode uses **0.50** plus behavioural primitives. Stage 2, which is built and committed on `main`, filters the remaining false alarms.

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
| `--tui` | Full-screen terminal interface (Cursive) |

The table shows package, version, NCD score, primitive score, the final flag and the primitive hits. Reports with `--reports` can be handed to stage 2.

## TUI

```bash
./target/release/packguard-cli --tui --packguard ../build/packguard
```

`--tui` opens a full-screen Cursive interface modelled on `make menuconfig` / `mconf`, using the terminal's own colors: default background and foreground (black and white in a normal terminal), a bold centred title, a full-width menu with an inverse-video selected row, and the key legend along the bottom.

The main menu is a Kconfig-style list. Entries shown as `(value)` open an edit dialog, `--->` entries open a submenu, and `[*]` marks the active mode or a flagged package. The settings cover the mode, malware and benign reference directories, scan directory, extra packages (separated by `;`), scanner path, thread count and report directory.

| Key | Action |
|---|---|
| `Up` / `Down` | Move through the menu |
| `Space` / `Enter` | Open a submenu, edit a value, or run the action |
| `Esc` | Leave the current menu; quits from the main menu |
| `S` | Run a scan |
| `R` | View results |
| `H` | Help |
| `Q` | Quit |

The results menu ranks flagged packages first, then lowest NCD; `Enter` opens a package's details. Scans run on a background thread, so the interface keeps redrawing and the status line above the key legend shows elapsed time, progress and errors. The TUI reads the same JSON reports as the CLI, so `--reports <dir>` still keeps them for stage 2.

## Safety

On Windows, scan only benign code. Malware must be handled inside WSL, as in the main project. The wrapper follows the same rule: it runs whatever `packguard` binary you give it and never executes package code.
