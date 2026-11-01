import argparse
import base64
import concurrent.futures
import csv
import io
import json
import os
import random
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
    zip_dir: Path,
    out_dir: Path,
    max_packages: int = 2500,
    seed: int = 42,
) -> List[Path]:
    """Extract malware packages across distinct code shapes from encrypted data/v2 zips."""
    rng = random.Random(seed)
    zip_files = sorted(zip_dir.glob("malware_js_*.zip"))
    if not zip_files:
        raise FileNotFoundError(f"No malware_js_*.zip found in {zip_dir}")

    pkg_entries: Dict[str, List[Tuple[Path, str]]] = {}
    for zpath in zip_files:
        with zipfile.ZipFile(zpath, "r") as zf:
            for name in zf.namelist():
                if name.endswith("/"):
                    continue
                parts = name.split("/")
                if len(parts) < 3:
                    continue
                pkg_key = f"{parts[0]}/{parts[1]}"
                pkg_entries.setdefault(pkg_key, []).append((zpath, name))

    all_keys = sorted(pkg_entries.keys())
    rng.shuffle(all_keys)
    selected_keys = all_keys[:max_packages]

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
                dest.write_bytes(zf.read(member))

    extracted_dirs: List[Path] = []
    for key in selected_keys:
        shape_id, pkg_ver = key.split("/", 1)
        safe_pkg = f"{shape_id}__{pkg_ver.replace('/', '_')}"
        pkg_path = out_dir / safe_pkg
        if pkg_path.is_dir():
            extracted_dirs.append(pkg_path)

    print(f"[Stage2 v2 Dataset] Ready {len(extracted_dirs)} malicious packages in {out_dir}")
    return extracted_dirs


def collect_benign_package_specs(
    repo_root: Path,
    max_packages: int = 2500,
    seed: int = 42,
) -> List[Tuple[str, str, str]]:
    """
    Collect up to `max_packages` benign npm package specs `(name, version, source)` from:
    1. experiments/v6/results/validation_manifest_benign.json (120 packages)
    2. experiments/v3/results/packages.csv (464 packages, including ben_scripts)
    3. experiments/v1/results/packages.csv (116+ packages, including v4 test benign)
    4. experiments/v6/results/benign_refs_manifest.json (5,211 packages: popular + longtail)
    """
    rng = random.Random(seed)
    specs: Dict[Tuple[str, str], str] = {}

    # 1. v6 validation manifest
    v6_val = repo_root / "experiments" / "v6" / "results" / "validation_manifest_benign.json"
    if v6_val.exists():
        for item in json.loads(v6_val.read_text(encoding="utf-8")):
            name, ver = item.get("name", ""), item.get("version", "")
            if name and ver:
                specs[(name, ver)] = f"v6_val_{item.get('source', 'popular')}"

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
                specs.setdefault((npm_name, ver), f"v3_{cat}")

    # 3. v1 packages.csv
    v1_csv = repo_root / "experiments" / "v1" / "results" / "packages.csv"
    if v1_csv.exists():
        with v1_csv.open("r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("truth") != "benign":
                    continue
                npm_name, ver = row.get("package", ""), row.get("version", "")
                if npm_name and ver:
                    specs.setdefault((npm_name, ver), f"v1_{row.get('category', 'benign')}")

    priority_items = list(specs.items())

    # 4. v6 5,211 benign_refs_manifest.json
    v6_refs = repo_root / "experiments" / "v6" / "results" / "benign_refs_manifest.json"
    extra_items: List[Tuple[Tuple[str, str], str]] = []
    if v6_refs.exists():
        for item in json.loads(v6_refs.read_text(encoding="utf-8")):
            name, ver = item.get("name", ""), item.get("version", "")
            if name and ver and (name, ver) not in specs:
                extra_items.append(((name, ver), f"v6_ref_{item.get('source', 'popular')}"))

    rng.shuffle(extra_items)
    combined = priority_items + extra_items
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
        with urllib.request.urlopen(req, timeout=15) as resp:
            doc = json.loads(resp.read().decode("utf-8", errors="replace"))
        tarball_url = doc.get("dist", {}).get("tarball")
        if not tarball_url:
            return None

        t_req = urllib.request.Request(tarball_url, headers={"User-Agent": "PackGuard-Research/2.0"})
        with urllib.request.urlopen(t_req, timeout=25) as resp:
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
    workers: int = 32,
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
            if idx % 250 == 0 or idx == len(futures):
                print(
                    f"[Stage2 v2 Dataset] Benign progress: {idx}/{len(futures)} "
                    f"(ok={len(results)})"
                )
    return results


def build_package_record(
    pkg_dir: Path,
    label: int,
    tier: str = "T0",
    rng: Optional[random.Random] = None,
    inject_benign_script: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Build a training/evaluation record from a package directory, optionally applying
    T1, T2, T3, or T4 transforms so ModernBERT learns complete invariance to mangling.
    """
    if rng is None:
        rng = random.Random(42)

    chunks: List[Dict[str, Any]] = []

    # 1. Check install_scripts.txt or package.json install hooks
    install_txt = pkg_dir / "install_scripts.txt"
    if install_txt.exists():
        txt = install_txt.read_text(encoding="utf-8", errors="replace").strip()
        if txt:
            chunks.append(
                {
                    "file": "install_scripts.txt",
                    "kind": "script",
                    "start": 0,
                    "ncd": 0.15,
                    "flagged": True,
                    "text": txt[:8192],
                }
            )

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
                    chunks.append(
                        {
                            "file": "package.json",
                            "kind": "script",
                            "start": 0,
                            "ncd": 0.20,
                            "flagged": True,
                            "text": "\n".join(hook_lines)[:8192],
                        }
                    )
        except Exception:
            pass

    if inject_benign_script and label == 0 and not chunks:
        chunks.append(
            {
                "file": "package.json",
                "kind": "script",
                "start": 0,
                "ncd": 0.25,
                "flagged": True,
                "text": f"postinstall: {inject_benign_script}",
            }
        )

    # 2. Read JS files (up to 8 files, smallest/entrypoint first)
    js_files = [
        p for p in sorted(pkg_dir.rglob("*")) if p.is_file() and p.name.endswith(JS_EXT)
    ]
    js_files.sort(
        key=lambda p: (
            0 if p.name in ("index.js", "main.js", "cli.js", "app.js") else 1,
            p.stat().st_size,
        )
    )

    for idx, js_path in enumerate(js_files[:8]):
        raw_text = js_path.read_text(encoding="utf-8", errors="replace")
        if not raw_text.strip():
            continue
        # Cap individual file before transform so T2/T4 remain fast
        raw_text = raw_text[:16384]

        if tier == "T1":
            transformed = t1_format(raw_text, rng)
            fname = js_path.name
        elif tier == "T2":
            transformed = t2_mangle(raw_text, rng)
            fname = f"file_{idx:02d}{js_path.suffix}"
        elif tier == "T3":
            transformed = t3_pad(raw_text, rng)
            fname = js_path.name
        elif tier == "T4":
            transformed = t4_encode(raw_text, rng)
            fname = js_path.name
        else:
            transformed = raw_text
            fname = js_path.name

        # Simulate Stage 1 8 KiB sliding windows (4 KiB step) so reassembly is exercised
        raw_bytes = transformed.encode("utf-8", errors="replace")
        step = 4096
        win = 8192
        if len(raw_bytes) <= win:
            chunks.append(
                {
                    "file": fname,
                    "kind": "js",
                    "start": 0,
                    "ncd": 0.25,
                    "flagged": True,
                    "text": transformed,
                }
            )
        else:
            for offset in range(0, min(len(raw_bytes), 32768), step):
                piece = raw_bytes[offset : offset + win].decode("utf-8", errors="replace")
                chunks.append(
                    {
                        "file": fname,
                        "kind": "js",
                        "start": offset,
                        "ncd": 0.25,
                        "flagged": offset == 0,
                        "text": piece,
                    }
                )
                if offset + win >= len(raw_bytes):
                    break

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
        "label": int(label),
        "text": formatted_text,
    }


def write_jsonl(records: List[Dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Continuous dataset harvester + T1-T4 hard-negative builder for PackGuard Stage 2 v2."
    )
    parser.add_argument("--repo_root", type=str, default="../..")
    parser.add_argument("--out_dir", type=str, default="./data_v2")
    parser.add_argument("--max_malware", type=int, default=2000)
    parser.add_argument("--max_benign", type=int, default=2200)
    parser.add_argument("--val_ratio", type=float, default=0.12)
    parser.add_argument("--workers", type=int, default=32)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    repo_root = Path(args.repo_root).resolve()
    out_dir = Path(args.out_dir).resolve()

    zip_dir = repo_root / "data" / "v2"
    raw_mal_dir = out_dir / "raw_malware"
    raw_ben_dir = out_dir / "raw_benign"

    mal_dirs = extract_malware_packages(
        zip_dir=zip_dir,
        out_dir=raw_mal_dir,
        max_packages=args.max_malware,
        seed=args.seed,
    )

    ben_specs = collect_benign_package_specs(
        repo_root=repo_root,
        max_packages=args.max_benign,
        seed=args.seed,
    )
    print(f"[Stage2 v2 Dataset] Collected {len(ben_specs)} benign npm package specs.")
    ben_items = download_benign_corpus(
        specs=ben_specs,
        out_dir=raw_ben_dir,
        workers=args.workers,
    )

    # Strict family/package split BEFORE applying T0-T4 augmentations
    rng.shuffle(mal_dirs)
    rng.shuffle(ben_items)

    n_val_mal = max(150, int(len(mal_dirs) * args.val_ratio))
    n_val_ben = max(150, int(len(ben_items) * args.val_ratio))

    val_mal_dirs = mal_dirs[:n_val_mal]
    train_mal_dirs = mal_dirs[n_val_mal:]

    val_ben_items = ben_items[:n_val_ben]
    train_ben_items = ben_items[n_val_ben:]

    train_records: List[Dict[str, Any]] = []
    val_records: List[Dict[str, Any]] = []
    hard_benign_val_records: List[Dict[str, Any]] = []

    # Build Training Set: T0 + T1/T3/T4 unfolded + hard-negative benign install scripts
    for idx, pdir in enumerate(train_mal_dirs):
        rec_t0 = build_package_record(pdir, label=1, tier="T0", rng=rng)
        if rec_t0:
            train_records.append(rec_t0)
        if idx % 3 == 0:
            tier_choice = ("T1", "T3", "T4")[idx % 3]
            rec_tx = build_package_record(pdir, label=1, tier=tier_choice, rng=rng)
            if rec_tx:
                train_records.append(rec_tx)

    for idx, (pdir, _src) in enumerate(train_ben_items):
        inject_script = BENIGN_INSTALL_SCRIPTS[idx % len(BENIGN_INSTALL_SCRIPTS)] if (idx % 4 == 0) else None
        rec_t0 = build_package_record(
            pdir, label=0, tier="T0", rng=rng, inject_benign_script=inject_script
        )
        if rec_t0:
            train_records.append(rec_t0)
        if idx % 3 == 0:
            tier_choice = ("T1", "T3", "T4")[idx % 3]
            rec_tx = build_package_record(pdir, label=0, tier=tier_choice, rng=rng)
            if rec_tx:
                train_records.append(rec_tx)

    # Build Held-Out Validation Set across T0, T1, T3, T4 + Hard Benign Controls
    for idx, pdir in enumerate(val_mal_dirs):
        rec_t0 = build_package_record(pdir, label=1, tier="T0", rng=rng)
        if rec_t0:
            val_records.append(rec_t0)
        tier_tx = ("T1", "T3", "T4")[idx % 3]
        rec_tx = build_package_record(pdir, label=1, tier=tier_tx, rng=rng)
        if rec_tx:
            val_records.append(rec_tx)

    for idx, (pdir, _src) in enumerate(val_ben_items):
        inject_script = BENIGN_INSTALL_SCRIPTS[idx % len(BENIGN_INSTALL_SCRIPTS)] if (idx % 4 == 0) else None
        rec_t0 = build_package_record(
            pdir, label=0, tier="T0", rng=rng, inject_benign_script=inject_script
        )
        if rec_t0:
            val_records.append(rec_t0)
            if inject_script:
                hard_benign_val_records.append(rec_t0)

        for tier_tx in ("T1", "T3", "T4"):
            rec_tx = build_package_record(pdir, label=0, tier=tier_tx, rng=rng)
            if rec_tx:
                hard_benign_val_records.append(rec_tx)
                if tier_tx == ("T1", "T3", "T4")[idx % 3]:
                    val_records.append(rec_tx)

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
    print(f"[Stage2 v2 Dataset] Summary:\n{json.dumps(summary, indent=2)}")


if __name__ == "__main__":
    main()
