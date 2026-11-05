import argparse
import base64
import concurrent.futures
import csv
import io
import json
import multiprocessing
import os
import random
import re
import tarfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from text_formatter import format_scanner_chunks_to_text

JS_EXT = (".js", ".cjs", ".mjs")
HOOKS = ("preinstall", "install", "postinstall")

# Exact JavaScript keyword set from experiments/v4/scripts/mangle.py
KEYWORDS = {
    "async", "await", "break", "case", "catch", "class", "const", "continue",
    "debugger", "default", "delete", "do", "else", "export", "extends", "false",
    "finally", "for", "from", "function", "get", "if", "import", "in", "instanceof",
    "let", "new", "null", "of", "return", "set", "static", "super", "switch", "this",
    "throw", "true", "try", "typeof", "undefined", "var", "void", "while", "with",
    "yield", "require", "module", "exports", "process", "console", "Buffer", "global",
    "window", "document",
}

# Realistic benign npm install/postinstall scripts used in legitimate packages
BENIGN_INSTALL_SCRIPTS = [
    "husky install || true",
    "is-ci || husky install",
    "patch-package",
    "node-gyp rebuild",
    "prebuild-install || node-gyp rebuild",
    "node scripts/postinstall.js",
    "tsc -p tsconfig.build.json",
    "rimraf dist && npm run build",
    "cross-env NODE_ENV=production webpack --mode production",
    "esbuild src/index.ts --bundle --platform=node --outfile=dist/index.js",
    "electron-builder install-app-deps",
    "napi-postinstall || true",
    "opencollective-postinstall || exit 0",
    "node -e \"try{require('./postinstall')}catch(e){}\"",
    "shx mkdir -p dist && shx cp README.md dist/",
    "lerna bootstrap",
    "ngcc --properties es2015 browser module main --first-only --create-ivy-entry-points",
    "prisma generate || true",
    "playwright install-deps || true",
    "puppeteer-install || node install.mjs",
    "node-pre-gyp install --fallback-to-build",
    "lefthook install || true",
    "simple-git-hooks || true",
    "nx Rocket || node ./bin/post-install.js",
    "core-js-pure/postinstall || echo done",
]

# Search queries to harvest live hard-benign npm packages that use system/network/build APIs
LIVE_NPM_HARD_BENIGN_QUERIES = [
    "cli", "child-process", "spawn", "execa", "shelljs",
    "http-client", "fetch", "websocket", "crypto", "buffer",
    "base64", "webpack", "esbuild", "rollup", "babel",
    "terser", "postinstall", "node-gyp", "prebuild", "dotenv",
    "fs-extra", "chokidar", "glob", "minimist", "commander",
    "yargs", "gulp", "character-entities", "timezone", "mime-db",
    "wasm32-wasi", "napi-rs", "ora", "picocolors", "leaflet",
]


def map_code(text: str, ident, string, number) -> str:
    """Exact AST-free token mapper from experiments/v4/scripts/mangle.py."""
    out: List[str] = []
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c in "'\"`":
            quote = c
            j = i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == quote:
                    break
                j += 1
            content = text[i + 1 : j]
            out.append(quote + string(content) + quote)
            i = j + 1 if j < n else n
        elif c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            j = n if j < 0 else j
            out.append(text[i:j])
            i = j
        elif c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(text[i:j])
            i = j
        elif c.isalpha() or c in "_$":
            j = i + 1
            while j < n and (text[j].isalnum() or text[j] in "_$"):
                j += 1
            word = text[i:j]
            out.append(word if word in KEYWORDS else ident(word))
            i = j
        elif c.isdigit():
            j = i + 1
            while j < n and (text[j].isalnum() or text[j] in "._"):
                j += 1
            out.append(number(text[i:j]))
            i = j
        else:
            out.append(c)
            i += 1
    return "".join(out)


def t1_format(text: str, rng: random.Random) -> str:
    lines = text.splitlines()
    return "/* reformatted */\n" + "\n".join("  " + line for line in lines) + "\n"


def t2_mangle(text: str, rng: random.Random) -> str:
    names: Dict[str, str] = {}

    def ident(word: str) -> str:
        if word not in names:
            names[word] = f"v{len(names)}"
        return names[word]

    def string(value: str) -> str:
        if len(value) > 512:
            value = value[:512]
        return "".join(rng.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in value)

    def number(value: str) -> str:
        return str(rng.randint(10000, 99999))

    return map_code(text, ident, string, number)


def t3_pad(text: str, rng: random.Random) -> str:
    dead = "".join(f"function _pg_pad_{i}(){{var x={i};return x;}}\n" for i in range(60))
    return "/* padded */\n" + dead + text + "\n" + dead


def t4_encode(text: str, rng: random.Random) -> str:
    payload = base64.b64encode(text.encode("utf-8", "surrogateescape")).decode("ascii")
    return f'eval(Buffer.from("{payload}","base64").toString());\n'


def extract_malware_packages(
    repo_root: Path,
    out_dir: Path,
    max_packages: int = 4500,
    seed: int = 42,
) -> List[Path]:
    """Extract malware packages across distinct code shapes from encrypted data/v2 and data/v1 zips."""
    if out_dir.exists():
        existing_dirs = [p for p in sorted(out_dir.iterdir()) if p.is_dir() and any(p.iterdir())]
        if len(existing_dirs) >= max_packages:
            print(
                f"[Stage2 v2 Dataset] Reusing {len(existing_dirs[:max_packages])} cached malicious packages in {out_dir}",
                flush=True,
            )
            return existing_dirs[:max_packages]

    rng = random.Random(seed)
    zip_files: List[Tuple[str, Path]] = []
    for ds_ver in ("v2", "v1"):
        zdir = repo_root / "data" / ds_ver
        if zdir.exists():
            for zp in sorted(zdir.glob("malware_js_*.zip")):
                zip_files.append((ds_ver, zp))

    if not zip_files:
        raise FileNotFoundError(f"No malware_js_*.zip found in {repo_root / 'data'}")

    pkg_entries: Dict[str, List[Tuple[Path, str]]] = {}
    seen_pkg_vers: Set[str] = set()
    for ds_ver, zpath in zip_files:
        with zipfile.ZipFile(zpath, "r") as zf:
            for name in zf.namelist():
                if name.endswith("/"):
                    continue
                parts = name.split("/")
                if len(parts) < 3:
                    continue
                pkg_ver = parts[1]
                pkg_key = f"{ds_ver}_{parts[0]}/{pkg_ver}"
                pkg_entries.setdefault(pkg_key, []).append((zpath, name))

    # Deduplicate by package@version while preferring v2
    unique_keys: List[str] = []
    for key in sorted(pkg_entries.keys(), key=lambda k: (0 if k.startswith("v2_") else 1, k)):
        _, pkg_ver = key.split("/", 1)
        if pkg_ver not in seen_pkg_vers:
            seen_pkg_vers.add(pkg_ver)
            unique_keys.append(key)

    rng.shuffle(unique_keys)
    selected_keys = unique_keys[:max_packages]

    out_dir.mkdir(parents=True, exist_ok=True)
    by_zip: Dict[Path, List[Tuple[str, str]]] = {}
    for key in selected_keys:
        shape_id, pkg_ver = key.split("/", 1)
        safe_pkg = f"{shape_id}__{pkg_ver.replace('/', '_')}"
        pkg_path = out_dir / safe_pkg
        if pkg_path.is_dir() and any(pkg_path.iterdir()):
            continue
        for zpath, member in pkg_entries[key]:
            by_zip.setdefault(zpath, []).append((key, member))

    for zpath, items in by_zip.items():
        with zipfile.ZipFile(zpath, "r") as zf:
            zf.setpassword(b"infected")
            for key, member in items:
                shape_id, pkg_ver = key.split("/", 1)
                rel_file = member.split("/", 2)[2]
                safe_pkg = f"{shape_id}__{pkg_ver.replace('/', '_')}"
                dest = out_dir / safe_pkg / rel_file
                dest.parent.mkdir(parents=True, exist_ok=True)
                try:
                    dest.write_bytes(zf.read(member))
                except Exception:
                    pass

    extracted_dirs: List[Path] = []
    for key in selected_keys:
        shape_id, pkg_ver = key.split("/", 1)
        safe_pkg = f"{shape_id}__{pkg_ver.replace('/', '_')}"
        pkg_path = out_dir / safe_pkg
        if pkg_path.is_dir() and any(pkg_path.iterdir()):
            extracted_dirs.append(pkg_path)

    print(f"[Stage2 v2 Dataset] Extracted {len(extracted_dirs)} unique malicious packages in {out_dir}")
    return extracted_dirs


def fetch_live_npm_hard_benign_specs(
    existing_specs: Dict[Tuple[str, str], str],
    max_live: int = 1500,
) -> List[Tuple[Tuple[str, str], str]]:
    """Query live npm registry search API for hard-benign CLI/build/system/network packages."""
    live_items: List[Tuple[Tuple[str, str], str]] = []
    seen = set(existing_specs.keys())

    def _query_one(q: str) -> List[Tuple[Tuple[str, str], str]]:
        found: List[Tuple[Tuple[str, str], str]] = []
        url = f"https://registry.npmjs.org/-/v1/search?text={urllib.parse.quote(q)}&size=100"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "PackGuard-Research/2.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
            for obj in data.get("objects", []):
                pkg = obj.get("package", {})
                name = pkg.get("name", "")
                ver = pkg.get("version", "")
                if name and ver:
                    found.append(((name, ver), "ben_live_hard"))
        except Exception:
            pass
        return found

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
        futs = [ex.submit(_query_one, q) for q in LIVE_NPM_HARD_BENIGN_QUERIES]
        for fut in concurrent.futures.as_completed(futs):
            for (name, ver), tag in fut.result():
                if (name, ver) not in seen:
                    seen.add((name, ver))
                    live_items.append(((name, ver), tag))
                    if len(live_items) >= max_live:
                        return live_items
    return live_items


def collect_benign_package_specs(
    repo_root: Path,
    max_packages: int = 6000,
    seed: int = 42,
) -> List[Tuple[str, str, str]]:
    """
    Collect up to `max_packages` benign npm package specs `(name, version, source)` from:
    1. experiments/v6/results/validation_manifest_benign.json (120 packages)
    2. experiments/v3/results/packages.csv (464 packages, including ben_scripts)
    3. experiments/v1/results/packages.csv (116+ packages, including v4 test benign)
    4. experiments/v6/results/benign_refs_manifest.json (5,211 packages: popular + longtail)
    5. Live npm registry search API for hard-benign CLI/build/network/system packages
    """
    rng = random.Random(seed)
    specs: Dict[Tuple[str, str], str] = {}

    # 1. v6 validation manifest
    v6_val = repo_root / "experiments" / "v6" / "results" / "validation_manifest_benign.json"
    if v6_val.exists():
        for item in json.loads(v6_val.read_text(encoding="utf-8")):
            name, ver = item.get("name", ""), item.get("version", "")
            if name and ver:
                specs[(name, ver)] = f"ben_{item.get('source', 'popular')}"

    # 2. v3 packages.csv
    v3_csv = repo_root / "experiments" / "v3" / "results" / "packages.csv"
    if v3_csv.exists():
        with v3_csv.open("r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("tag") != "v3-baseline":
                    continue
                cat = row.get("category", "")
                if not cat.startswith("ben_"):
                    continue
                pkg_ver = row.get("package", "")
                if "@" not in pkg_ver:
                    continue
                raw_name, ver = pkg_ver.rsplit("@", 1)
                npm_name = raw_name.replace("_", "/", 1) if (raw_name.startswith("@") and "_" in raw_name) else raw_name
                specs.setdefault((npm_name, ver), cat)

    # 3. v1 packages.csv
    v1_csv = repo_root / "experiments" / "v1" / "results" / "packages.csv"
    if v1_csv.exists():
        with v1_csv.open("r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("truth") != "benign":
                    continue
                npm_name, ver = row.get("package", ""), row.get("version", "")
                if npm_name and ver:
                    specs.setdefault((npm_name, ver), row.get("category", "ben_popular"))

    priority_items = list(specs.items())

    # 4. v6 5,211 benign_refs_manifest.json
    v6_refs = repo_root / "experiments" / "v6" / "results" / "benign_refs_manifest.json"
    extra_items: List[Tuple[Tuple[str, str], str]] = []
    if v6_refs.exists():
        for item in json.loads(v6_refs.read_text(encoding="utf-8")):
            name, ver = item.get("name", ""), item.get("version", "")
            if name and ver and (name, ver) not in specs:
                extra_items.append(((name, ver), f"ben_{item.get('source', 'popular')}"))
                specs[(name, ver)] = f"ben_{item.get('source', 'popular')}"

    # 5. Live npm hard-benign packages
    live_items = fetch_live_npm_hard_benign_specs(specs, max_live=1200)
    print(f"[Stage2 v2 Dataset] Harvested {len(live_items)} additional live hard-benign npm specs.")

    rng.shuffle(extra_items)
    rng.shuffle(live_items)
    combined = priority_items + live_items + extra_items
    selected = combined[:max_packages]
    return [(name, ver, src) for (name, ver), src in selected]


def download_one_benign(
    spec: Tuple[str, str, str],
    out_dir: Path,
) -> Optional[Tuple[Path, str]]:
    """Download a single benign npm package tarball and extract its JS + package.json."""
    npm_name, ver, source_tag = spec
    safe_dir_name = f"{npm_name.replace('/', '_')}@{ver}"
    pkg_dir = out_dir / safe_dir_name
    if pkg_dir.exists() and any(pkg_dir.iterdir()):
        return pkg_dir, source_tag

    encoded_name = urllib.parse.quote(npm_name, safe="@/")
    meta_url = f"https://registry.npmjs.org/{encoded_name}/{ver}"
    try:
        req = urllib.request.Request(meta_url, headers={"User-Agent": "PackGuard-Research/2.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            doc = json.loads(resp.read().decode("utf-8", errors="replace"))
        tarball_url = doc.get("dist", {}).get("tarball")
        if not tarball_url:
            return None

        t_req = urllib.request.Request(tarball_url, headers={"User-Agent": "PackGuard-Research/2.0"})
        with urllib.request.urlopen(t_req, timeout=20) as resp:
            blob = resp.read()

        extracted_any = False
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tf:
            for member in tf.getmembers():
                if not member.isfile() or member.size <= 0 or member.size > 256 * 1024:
                    continue
                parts = Path(member.name).parts
                rel_parts = parts[1:] if len(parts) > 1 else parts
                if not rel_parts or "node_modules" in rel_parts:
                    continue
                rel_path = "/".join(rel_parts)
                is_root_pkg_json = rel_path == "package.json"
                is_js = rel_path.endswith(JS_EXT)
                if not (is_root_pkg_json or is_js):
                    continue

                fobj = tf.extractfile(member)
                if fobj is None:
                    continue
                data = fobj.read()
                flat_name = rel_path.replace("/", "__")
                dest = pkg_dir / flat_name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                extracted_any = True

        if extracted_any:
            return pkg_dir, source_tag
    except Exception:
        return None
    return None


def download_benign_corpus(
    specs: List[Tuple[str, str, str]],
    out_dir: Path,
    workers: int = 96,
) -> List[Tuple[Path, str]]:
    """Download benign npm packages concurrently."""
    out_dir.mkdir(parents=True, exist_ok=True)
    results: List[Tuple[Path, str]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(download_one_benign, spec, out_dir) for spec in specs]
        for idx, fut in enumerate(concurrent.futures.as_completed(futures), 1):
            res = fut.result()
            if res is not None:
                results.append(res)
            if idx % 500 == 0 or idx == len(futures):
                print(
                    f"[Stage2 v2 Dataset] Benign download progress: {idx}/{len(futures)} "
                    f"(ok={len(results)})",
                    flush=True,
                )
    return results


_SUSPICIOUS_PATTERNS: List[Tuple[re.Pattern, float]] = [
    (re.compile(r"\b(?:child_process|execSync|execFile|spawnSync|exec\s*\(|spawn\s*\()", re.I), 4.5),
    (
        re.compile(
            r"\b(?:https?\.request|dns\.lookup|dns\.resolve|net\.Socket|fetch\s*\(|axios|webhook|discord|telegram|oast|burp|interact\.sh|pipedream|requestbin|ngrok|trycloudflare)\b",
            re.I,
        ),
        4.0,
    ),
    (
        re.compile(
            r"(?:os\.userInfo|os\.hostname|os\.networkInterfaces|os\.homedir|/etc/passwd|/etc/shadow|\.ssh|\.npmrc|\.aws|process\.env|whoami|printenv|uname\s+-a)",
            re.I,
        ),
        3.5,
    ),
    (
        re.compile(
            r"(?:\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(|vm\.runIn|Buffer\.from\s*\(|fromCharCode|\batob\s*\(|\b_0x[0-9a-fA-F]+)",
        ),
        3.0,
    ),
    (
        re.compile(
            r"(?:\bcurl\s+|\bwget\s+|\bpowershell\b|Invoke-WebRequest|\bcertutil\b|\bbase64\s+-d|\bsh\s+-c|\bbash\s+-c)",
            re.I,
        ),
        4.5,
    ),
    (re.compile(r"(?:[A-Za-z0-9+/=]{80,}|(?:\\x[0-9a-fA-F]{2}){6,}|(?:\\u00[0-9a-fA-F]{2}){6,})"), 2.5),
]

_BENIGN_STUB_MARKERS = (
    "security research placeholder",
    "non-functional placeholder",
    "simple placeholder npm library",
)

# Cache per-package extracted script hooks and ranked JS windows:
# pkg_dir -> (has_script, script_chunks, max_susp_score, ranked_js_windows[(fname, window_text, susp_score)])
_PACKAGE_WINDOW_CACHE: Dict[
    Path, Tuple[bool, List[Tuple[str, str]], float, List[Tuple[str, str, float]]]
] = {}


def score_js_window_suspicion(text: str, fname: str) -> float:
    """Score a 6 KiB JS window using Stage-1 behavioral and obfuscation indicators."""
    stripped = text.strip()
    if not stripped:
        return -5.0
    score = 0.0
    for pat, weight in _SUSPICIOUS_PATTERNS:
        if pat.search(stripped):
            score += weight
    # Non-ASCII obfuscated identifiers combined with hex/obfuscator patterns
    if any(ord(c) > 127 for c in stripped[:600]) and ("_0x" in stripped or "0x" in stripped):
        score += 3.5
    lower_name = fname.lower()
    if lower_name in ("index.js", "main.js", "cli.js", "app.js", "postinstall.js", "install.js", "preinstall.js"):
        score += 0.8
    if any(cfg in lower_name for cfg in ("eslint", "prettier", "jest.config", "babel.config", "ncu.config", ".test.", ".spec.")):
        score -= 2.0
    if len(stripped) < 110 and score == 0.0:
        score -= 2.5
    return score


def _get_package_Ranked_content(
    pkg_dir: Path,
) -> Tuple[bool, List[Tuple[str, str]], float, List[Tuple[str, str, float]]]:
    """Extract and cache install scripts and suspicion-ranked JS windows for a package."""
    cached = _PACKAGE_WINDOW_CACHE.get(pkg_dir)
    if cached is not None:
        return cached

    script_items: List[Tuple[str, str]] = []
    install_txt = pkg_dir / "install_scripts.txt"
    if install_txt.exists():
        txt = install_txt.read_text(encoding="utf-8", errors="replace").strip()
        if txt:
            script_items.append(("install_scripts.txt", txt[:8192]))

    pkg_json = pkg_dir / "package.json"
    if pkg_json.exists():
        try:
            doc = json.loads(pkg_json.read_text(encoding="utf-8", errors="replace"))
            scripts = doc.get("scripts")
            if isinstance(scripts, dict):
                hook_lines = [
                    f"{h}: {scripts[h]}"
                    for h in HOOKS
                    if isinstance(scripts.get(h), str) and scripts.get(h).strip()
                ]
                if hook_lines:
                    script_items.append(("package.json", "\n".join(hook_lines)[:8192]))
        except Exception:
            pass

    js_files = [
        p for p in sorted(pkg_dir.rglob("*")) if p.is_file() and p.name.endswith(JS_EXT)
    ]
    js_files.sort(
        key=lambda p: (
            0 if p.name in ("postinstall.js", "preinstall.js", "install.js", "index.js", "main.js", "cli.js", "app.js") else 1,
            p.stat().st_size,
        )
    )

    candidate_windows: List[Tuple[float, int, str, str]] = []
    max_susp = 0.0
    for f_idx, js_path in enumerate(js_files[:24]):
        try:
            full_text = js_path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        if not full_text.strip():
            continue

        # Scan up to 48 KB per file in 6 KB windows (4 KB step) so backdoors at the bottom of bundled files are found
        capped = full_text[:49152]
        if len(capped) <= 6144:
            s_score = score_js_window_suspicion(capped, js_path.name)
            max_susp = max(max_susp, s_score)
            candidate_windows.append((s_score, -f_idx, js_path.name, capped))
        else:
            best_w_score = -1e9
            best_w_text = capped[:6144]
            for off in range(0, len(capped), 4096):
                w_text = capped[off : off + 6144]
                if not w_text.strip():
                    continue
                w_score = score_js_window_suspicion(w_text, js_path.name)
                if w_score > best_w_score:
                    best_w_score = w_score
                    best_w_text = w_text
                if off + 6144 >= len(capped):
                    break
            max_susp = max(max_susp, best_w_score)
            candidate_windows.append((best_w_score, -f_idx, js_path.name, best_w_text))

    candidate_windows.sort(key=lambda item: (item[0], item[1]), reverse=True)
    ranked_js: List[Tuple[str, str, float]] = []
    seen_snippets: Set[int] = set()
    for s_score, _neg_idx, fname, w_text in candidate_windows:
        h = hash(w_text.strip())
        if h in seen_snippets:
            continue
        seen_snippets.add(h)
        ranked_js.append((fname, w_text, s_score))
        if len(ranked_js) >= 5:
            break

    res = (bool(script_items), script_items, max_susp, ranked_js)
    _PACKAGE_WINDOW_CACHE[pkg_dir] = res
    return res


def build_package_record(
    pkg_dir: Path,
    label: int,
    tier: str = "T0",
    category: str = "general",
    rng: Optional[random.Random] = None,
    inject_benign_script: Optional[str] = None,
    raw_mode: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Build a training/evaluation record from a package directory across T0, T1, T2, T3, T4.
    When `raw_mode=True`, emits raw chunk/file text WITHOUT `text_formatter.py` headers or
    pre-stripping so the ONNX model also works when a caller feeds raw JS or raw Stage 1
    chunks directly to `tokenizer.json`.
    """
    if rng is None:
        rng = random.Random(42)

    has_script, script_items, max_susp, ranked_js = _get_package_Ranked_content(pkg_dir)

    # Filter out pure-benign stubs / empty barrel placeholders from label=1 (malicious)
    # so we never teach the model that `"use strict"; Object.defineProperty(exports, "__esModule", ...)` is malware
    if label == 1 and not has_script:
        if not ranked_js:
            return None
        combined_js = "\n".join(w for _, w, _ in ranked_js).strip()
        lower_js = combined_js.lower()
        if max_susp <= 0.5 and (
            len(combined_js) < 160
            or any(m in lower_js for m in _BENIGN_STUB_MARKERS)
        ):
            return None

    chunks: List[Dict[str, Any]] = []
    raw_pieces: List[str] = []

    for s_fname, s_txt in script_items:
        chunks.append(
            {
                "file": s_fname,
                "kind": "script",
                "start": 0,
                "ncd": 0.12 if s_fname == "install_scripts.txt" else 0.18,
                "flagged": True,
                "text": s_txt,
            }
        )
        raw_pieces.append(s_txt[:4096])

    if inject_benign_script and label == 0 and not chunks:
        hook_str = f"postinstall: {inject_benign_script}"
        chunks.append(
            {
                "file": "package.json",
                "kind": "script",
                "start": 0,
                "ncd": 0.25,
                "flagged": True,
                "text": hook_str,
            }
        )
        raw_pieces.append(hook_str)

    for idx, (orig_name, raw_text, s_score) in enumerate(ranked_js):
        if tier == "T1":
            transformed = t1_format(raw_text, rng)
            fname = orig_name
        elif tier == "T2":
            transformed = t2_mangle(raw_text, rng)
            ext = Path(orig_name).suffix or ".js"
            fname = f"file_{idx:02d}{ext}"
        elif tier == "T3":
            transformed = t3_pad(raw_text, rng)
            fname = orig_name
        elif tier == "T4":
            transformed = t4_encode(raw_text, rng)
            fname = orig_name
        else:
            transformed = raw_text
            fname = orig_name

        # Unique file key per ranked window so text_formatter preserves ranked order
        chunk_file_key = f"{idx:02d}_{fname}"
        ncd_val = round(max(0.05, 0.35 - 0.04 * min(max(s_score, 0.0), 7.0)), 3)

        if raw_mode:
            # In raw mode for T3/T4, keep wrapper header short (~60 tokens) + actual code
            # so the 512-token window sees BOTH the wrapper and the payload!
            if tier == "T4":
                raw_pieces.append(transformed[:200] + "\n" + raw_text[:4096])
            elif tier == "T3":
                dead_short = "".join(f"function _pg_pad_{i}(){{var x={i};return x;}}\n" for i in range(4))
                raw_pieces.append("/* padded */\n" + dead_short + raw_text[:4096])
            else:
                raw_pieces.append(transformed[:6144])
            continue

        raw_bytes = transformed.encode("utf-8", errors="replace")
        step = 4096
        win = 8192
        if len(raw_bytes) <= win:
            chunks.append(
                {
                    "file": chunk_file_key,
                    "kind": "js",
                    "start": 0,
                    "ncd": ncd_val,
                    "flagged": idx == 0 or s_score > 0.0,
                    "text": transformed,
                }
            )
        else:
            for offset in range(0, min(len(raw_bytes), 32768), step):
                piece = raw_bytes[offset : offset + win].decode("utf-8", errors="replace")
                chunks.append(
                    {
                        "file": chunk_file_key,
                        "kind": "js",
                        "start": offset,
                        "ncd": ncd_val,
                        "flagged": (idx == 0 and offset == 0) or s_score > 0.0,
                        "text": piece,
                    }
                )
                if offset + win >= len(raw_bytes):
                    break

    if raw_mode:
        final_text = "\n\n".join(p for p in raw_pieces if p.strip()).strip()
        if not final_text:
            return None
        return {
            "package": pkg_dir.name,
            "tier": f"{tier}_raw",
            "category": category,
            "label": int(label),
            "text": final_text,
        }

    if not chunks:
        return None

    raw_record = {
        "package": pkg_dir.name,
        "version": "1.0.0",
        "score": 0.25,
        "flagged": True,
        "chunks": chunks,
    }
    formatted_text = format_scanner_chunks_to_text(raw_record)
    if not formatted_text or formatted_text == "// [EMPTY_PACKAGE]":
        return None

    return {
        "package": pkg_dir.name,
        "tier": tier,
        "category": category,
        "label": int(label),
        "text": formatted_text,
    }


def write_jsonl(records: List[Dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def _worker_train_mal(task: Tuple[int, str, int]) -> List[Dict[str, Any]]:
    idx, pdir_str, seed = task
    pdir = Path(pdir_str)
    local_rng = random.Random(seed + idx * 31)
    out: List[Dict[str, Any]] = []
    rec_t0 = build_package_record(pdir, label=1, tier="T0", category="mal_T0", rng=local_rng)
    if rec_t0:
        out.append(rec_t0)
    # Generate T2 for 100% of malicious packages so identifier/string mangled payloads have full recall
    rec_t2 = build_package_record(pdir, label=1, tier="T2", category="mal_T2", rng=local_rng)
    if rec_t2:
        out.append(rec_t2)
    other_tier = ("T1", "T3", "T4")[idx % 3]
    rec_tx = build_package_record(pdir, label=1, tier=other_tier, category=f"mal_{other_tier}", rng=local_rng)
    if rec_tx:
        out.append(rec_tx)
    if idx % 2 == 0:
        raw_tier = ("T0", "T1", "T2", "T3", "T4")[idx % 5]
        rec_raw = build_package_record(
            pdir, label=1, tier=raw_tier, category="mal_raw", rng=local_rng, raw_mode=True
        )
        if rec_raw:
            out.append(rec_raw)
    return out


def _worker_train_ben(task: Tuple[int, str, str, int]) -> List[Dict[str, Any]]:
    idx, pdir_str, src_cat, seed = task
    pdir = Path(pdir_str)
    local_rng = random.Random(seed + 100000 + idx * 37)
    out: List[Dict[str, Any]] = []
    inject_script = (
        BENIGN_INSTALL_SCRIPTS[idx % len(BENIGN_INSTALL_SCRIPTS)] if (idx % 3 == 0) else None
    )
    cat_name = "ben_scripts" if inject_script else src_cat
    rec_t0 = build_package_record(
        pdir,
        label=0,
        tier="T0",
        category=cat_name,
        rng=local_rng,
        inject_benign_script=inject_script,
    )
    if rec_t0:
        out.append(rec_t0)

    # Generate T2 for 100% of benign packages so T2 benign packages never trigger false alarms
    rec_t2 = build_package_record(pdir, label=0, tier="T2", category="ben_T2", rng=local_rng)
    if rec_t2:
        out.append(rec_t2)

    other_tier = ("T1", "T3", "T4")[idx % 3]
    rec_tx = build_package_record(pdir, label=0, tier=other_tier, category=f"ben_{other_tier}", rng=local_rng)
    if rec_tx:
        out.append(rec_tx)

    if idx % 2 == 0:
        raw_tier = ("T0", "T1", "T2", "T3", "T4")[idx % 5]
        rec_raw = build_package_record(
            pdir,
            label=0,
            tier=raw_tier,
            category="ben_raw",
            rng=local_rng,
            inject_benign_script=inject_script,
            raw_mode=True,
        )
        if rec_raw:
            out.append(rec_raw)
    return out


def _worker_val_mal(task: Tuple[int, str, int]) -> List[Dict[str, Any]]:
    idx, pdir_str, seed = task
    pdir = Path(pdir_str)
    local_rng = random.Random(seed + 200000 + idx * 41)
    out: List[Dict[str, Any]] = []
    rec_t0 = build_package_record(pdir, label=1, tier="T0", category="mal_T0", rng=local_rng)
    if rec_t0:
        out.append(rec_t0)
    tier_tx = ("T1", "T2", "T3", "T4")[idx % 4]
    rec_tx = build_package_record(pdir, label=1, tier=tier_tx, category=f"mal_{tier_tx}", rng=local_rng)
    if rec_tx:
        out.append(rec_tx)
    if idx % 2 == 0:
        raw_tier = ("T0", "T1", "T2", "T3", "T4")[idx % 5]
        rec_raw = build_package_record(
            pdir, label=1, tier=raw_tier, category="mal_raw", rng=local_rng, raw_mode=True
        )
        if rec_raw:
            out.append(rec_raw)
    return out


def _worker_val_ben(
    task: Tuple[int, str, str, int],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    idx, pdir_str, src_cat, seed = task
    pdir = Path(pdir_str)
    local_rng = random.Random(seed + 300000 + idx * 43)
    val_out: List[Dict[str, Any]] = []
    hard_out: List[Dict[str, Any]] = []
    inject_script = (
        BENIGN_INSTALL_SCRIPTS[idx % len(BENIGN_INSTALL_SCRIPTS)] if (idx % 4 == 0) else None
    )
    cat_name = "ben_scripts" if inject_script else src_cat
    rec_t0 = build_package_record(
        pdir,
        label=0,
        tier="T0",
        category=cat_name,
        rng=local_rng,
        inject_benign_script=inject_script,
    )
    if rec_t0:
        val_out.append(rec_t0)
        if inject_script or src_cat == "ben_live_hard":
            hard_out.append(rec_t0)

    all_obf_tiers = ("T1", "T2", "T3", "T4")
    for tier_tx in all_obf_tiers:
        rec_tx = build_package_record(pdir, label=0, tier=tier_tx, category=f"ben_{tier_tx}", rng=local_rng)
        if rec_tx:
            hard_out.append(rec_tx)
            if tier_tx == all_obf_tiers[idx % 4]:
                val_out.append(rec_tx)

    if idx % 2 == 0:
        raw_tier = ("T0", "T1", "T2", "T3", "T4")[idx % 5]
        rec_raw = build_package_record(
            pdir,
            label=0,
            tier=raw_tier,
            category="ben_raw",
            rng=local_rng,
            inject_benign_script=inject_script,
            raw_mode=True,
        )
        if rec_raw:
            val_out.append(rec_raw)
            hard_out.append(rec_raw)
    return val_out, hard_out


def main() -> None:
    parser = argparse.ArgumentParser(
        description="High-speed 48-vCPU dataset harvester + T0-T4 & Raw multi-format builder for PackGuard Stage 2 v2."
    )
    parser.add_argument("--repo_root", type=str, default="../..")
    parser.add_argument("--out_dir", type=str, default="./data_v2")
    parser.add_argument("--max_malware", type=int, default=6500)
    parser.add_argument("--max_benign", type=int, default=6500)
    parser.add_argument("--val_ratio", type=float, default=0.12)
    parser.add_argument("--workers", type=int, default=128)
    parser.add_argument("--cpu_cores", type=int, default=min(48, os.cpu_count() or 16))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    repo_root = Path(args.repo_root).resolve()
    out_dir = Path(args.out_dir).resolve()

    raw_mal_dir = out_dir / "raw_malware"
    raw_ben_dir = out_dir / "raw_benign"
    ben_cache_file = out_dir / "benign_specs_cache.json"

    mal_dirs = extract_malware_packages(
        repo_root=repo_root,
        out_dir=raw_mal_dir,
        max_packages=args.max_malware,
        seed=args.seed,
    )

    if raw_ben_dir.exists() and len([p for p in raw_ben_dir.iterdir() if p.is_dir()]) >= int(args.max_benign * 0.92):
        existing_ben_dirs = [p for p in sorted(raw_ben_dir.iterdir()) if p.is_dir() and any(p.iterdir())]
        print(f"[Stage2 v2 Dataset] Reusing {len(existing_ben_dirs)} cached benign packages in {raw_ben_dir}", flush=True)
        ben_items = [
            (
                p,
                "ben_live_hard" if idx % 4 == 0 else ("ben_longtail" if idx % 3 == 0 else "ben_popular"),
            )
            for idx, p in enumerate(existing_ben_dirs[: args.max_benign])
        ]
        ben_specs = []
    else:
        ben_specs = collect_benign_package_specs(
            repo_root=repo_root,
            max_packages=args.max_benign,
            seed=args.seed,
        )
        out_dir.mkdir(parents=True, exist_ok=True)
        ben_cache_file.write_text(json.dumps(ben_specs), encoding="utf-8")
        print(f"[Stage2 v2 Dataset] Collected {len(ben_specs)} total benign npm package specs.", flush=True)
        ben_items = download_benign_corpus(
            specs=ben_specs,
            out_dir=raw_ben_dir,
            workers=args.workers,
        )

    # Strict family/package split BEFORE applying T0-T4 augmentations
    rng.shuffle(mal_dirs)
    rng.shuffle(ben_items)

    n_val_mal = max(250, int(len(mal_dirs) * args.val_ratio))
    n_val_ben = max(350, int(len(ben_items) * args.val_ratio))

    val_mal_dirs = mal_dirs[:n_val_mal]
    train_mal_dirs = mal_dirs[n_val_mal:]

    val_ben_items = ben_items[:n_val_ben]
    train_ben_items = ben_items[n_val_ben:]

    train_records: List[Dict[str, Any]] = []
    val_records: List[Dict[str, Any]] = []
    hard_benign_val_records: List[Dict[str, Any]] = []

    print(
        f"[Stage2 v2 Dataset] Building T0-T4 + Raw JSONL records across {args.cpu_cores} CPU cores in parallel...",
        flush=True,
    )
    with multiprocessing.Pool(processes=args.cpu_cores) as pool:
        mal_train_tasks = [(idx, str(p), args.seed) for idx, p in enumerate(train_mal_dirs)]
        for batch in pool.imap_unordered(_worker_train_mal, mal_train_tasks, chunksize=32):
            train_records.extend(batch)

        ben_train_tasks = [
            (idx, str(p), cat, args.seed) for idx, (p, cat) in enumerate(train_ben_items)
        ]
        for batch in pool.imap_unordered(_worker_train_ben, ben_train_tasks, chunksize=32):
            train_records.extend(batch)

        mal_val_tasks = [(idx, str(p), args.seed) for idx, p in enumerate(val_mal_dirs)]
        for batch in pool.imap_unordered(_worker_val_mal, mal_val_tasks, chunksize=32):
            val_records.extend(batch)

        ben_val_tasks = [
            (idx, str(p), cat, args.seed) for idx, (p, cat) in enumerate(val_ben_items)
        ]
        for v_batch, h_batch in pool.imap_unordered(_worker_val_ben, ben_val_tasks, chunksize=32):
            val_records.extend(v_batch)
            hard_benign_val_records.extend(h_batch)

    rng.shuffle(train_records)
    rng.shuffle(val_records)

    train_path = out_dir / "train.jsonl"
    val_path = out_dir / "validation.jsonl"
    hard_ben_path = out_dir / "hard_benign_val.jsonl"

    write_jsonl(train_records, train_path)
    write_jsonl(val_records, val_path)
    write_jsonl(hard_benign_val_records, hard_ben_path)

    summary = {
        "raw_malicious_packages": len(mal_dirs),
        "raw_benign_packages": len(ben_items),
        "total_raw_packages": len(mal_dirs) + len(ben_items),
        "train_examples": len(train_records),
        "train_malicious": sum(1 for r in train_records if r["label"] == 1),
        "train_benign": sum(1 for r in train_records if r["label"] == 0),
        "val_examples": len(val_records),
        "val_malicious": sum(1 for r in val_records if r["label"] == 1),
        "val_benign": sum(1 for r in val_records if r["label"] == 0),
        "hard_benign_val_examples": len(hard_benign_val_records),
    }
    (out_dir / "dataset_summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    print(f"[Stage2 v2 Dataset] Summary:\n{json.dumps(summary, indent=2)}", flush=True)


if __name__ == "__main__":
    main()
