# Dataset index

Where the PackGuard datasets live.

## v1 malware set

| | |
|---|---|
| Location | `data/v1/malware_js_0.zip` to `malware_js_f.zip` in this repository: 16 zips, 123.8 MiB |
| Extract | Inside WSL only: `unzip -P infected data/v1/malware_js_0.zip -d <dir>`. On Windows, antivirus quarantines the files and many paths exceed 260 characters. |
| Layout | `<code-shape-id>/<package>@<version>/<file>.js`, in the zip named after the first character of `<code-shape-id>` |
| Size | 5,904 packages, 39,119 JavaScript files, about 708 MiB extracted |
| Built | 2026-10-23 |

### Source

- DataDog malicious-software-packages-dataset, `samples/npm/malicious_intent/`.
- Only sample zips of 1 MiB or less: 23,825 of 25,460. The 1,635 larger zips (about 21.6 GB) were skipped.

### Filtering (static ratios)

1. Packages whose JavaScript is identical to an already kept one, ignoring whitespace, are dropped (5,342).
2. At most 3 packages per code shape: the code with strings, numbers, comments and `_0x…` obfuscator names blanked out (5,089 dropped).
3. At most 3 versions per package name (3,632 dropped).
4. The earliest published samples are kept first.

Also dropped: 2,970 packages whose malware lives only in a `package.json` install script, 883 with no JavaScript, and 5 unreadable zips (`marked-cs`, `marked-ps`).

### Safety

- Only `.js`, `.cjs` and `.mjs` files are kept, outside `node_modules`.
- No `package.json` is kept, so npm lifecycle scripts cannot run.
- The zips are encrypted (ZipCrypto, password `infected`, the same convention as DataDog), so antivirus and accidental runs can't reach the files.
- No file has an execute bit, and git stores the zips byte for byte (`-text`).
- The files are real malware. Read them as text only and never run them with `node`, `npm` or Windows Script Host.

### Size profile

- Median package: about 2.9 KB of JavaScript.
- 4,538 packages (77%) have 16 KiB or less, 13.7 MiB in total. A few large packages hold most of the bytes.

### Kept packages by publish year

| Year | Packages |
|---|---|
| 2018–2022 | 11 |
| 2024 | 515 |
| 2025 | 3,371 |
| 2026 | 2,007 |

## Not yet collected (v2)

- DataDog `compromised_lib` samples: real libraries with injected code, need a diff against the clean version.
- The 1,635 DataDog zips over 1 MiB.
- Install-script-only malware (`package.json` scripts).
- Backstabber's Knife Collection and MalwareBench: access on request.
- MalOSS: the repository has package-name lists only; samples come from the authors.
- OpenSSF malicious-packages: reports only, used to confirm live-scan detections.
- Benign packages from the npm registry.
