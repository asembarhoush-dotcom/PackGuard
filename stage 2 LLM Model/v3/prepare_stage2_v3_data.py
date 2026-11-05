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
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Import v3 text_formatter
sys.path.insert(0, str(Path(__file__).resolve().parent))
from text_formatter import format_scanner_chunks_to_text, clean_and_unfold_js

JS_EXT = (".js", ".cjs", ".mjs")
HOOKS = ("preinstall", "install", "postinstall")

KEYWORDS = {
    "async", "await", "break", "case", "catch", "class", "const", "continue",
    "debugger", "default", "delete", "do", "else", "export", "extends", "false",
    "finally", "for", "from", "function", "get", "if", "import", "in", "instanceof",
    "let", "new", "null", "of", "return", "set", "static", "super", "switch", "this",
    "throw", "true", "try", "typeof", "undefined", "var", "void", "while", "with",
    "yield", "require", "module", "exports", "process", "console", "Buffer", "global",
    "window", "document",
}

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
    "prisma generate || true",
    "playwright install-deps || true",
    "puppeteer-install || node install.mjs",
    "node-pre-gyp install --fallback-to-build",
    "simple-git-hooks || true",
]


def map_code(text: str, ident, string, number) -> str:
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


_SUSPICIOUS_PATTERNS: List[Tuple[re.Pattern, float]] = [
    (re.compile(r"\b(?:child_process|execSync|execFile|spawnSync|exec\s*\(|spawn\s*\(|fork\s*\()", re.I), 5.0),
    (
        re.compile(
            r"\b(?:https?\.request|https?\.get|dns\.lookup|dns\.resolve|net\.Socket|net\.connect|fetch\s*\(|axios|webhook|discord|telegram|oast|burp|interact\.sh|pipedream|requestbin|ngrok)\b",
            re.I,
        ),
        4.5,
    ),
    (
        re.compile(
            r"(?:os\.userInfo|os\.hostname|os\.networkInterfaces|os\.homedir|/etc/passwd|\.ssh|\.npmrc|\.aws|process\.env|whoami|printenv)",
            re.I,
        ),
        4.0,
    ),
    (
        re.compile(
            r"(?:\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(|Buffer\.from\s*\(|fromCharCode|\batob\s*\(|\b_0x[0-9a-fA-F]+)",
        ),
        3.5,
    ),
    (
        re.compile(
            r"(?:\bcurl\s+|\bwget\s+|\bpowershell\b|Invoke-WebRequest|\bsh\s+-c|\bbash\s+-c)",
            re.I,
        ),
        5.0,
    ),
    (re.compile(r"(?:[A-Za-z0-9+/=]{80,}|(?:\\x[0-9a-fA-F]{2}){6,})"), 3.0),
]


def score_code_suspicion(text: str, fname: str) -> float:
    stripped = text.strip()
    if not stripped:
        return -10.0
    # Heavily downvote pure TypeScript empty stubs
    if len(stripped) < 140 and "Object.defineProperty(exports" in stripped and "require" not in stripped:
        return -8.0
    score = 0.0
    for pat, weight in _SUSPICIOUS_PATTERNS:
        if pat.search(stripped):
            score += weight
    lower = fname.lower()
    if lower in ("postinstall.js", "preinstall.js", "install.js", "setup.js"):
        score += 3.0
    elif lower in ("index.js", "main.js", "cli.js", "app.js"):
        score += 1.0
    return score


def extract_package_representative_chunks(pkg_dir: Path) -> List[Dict[str, Any]]:
    """
    Extract multi-file chunks representing the package with smart prioritization:
    1. Install scripts (always included at token 0)
    2. Real active JS files ranked by behavioral suspicion (rejecting empty stubs)
    """
    chunks: List[Dict[str, Any]] = []

    # 1. Install scripts from install_scripts.txt or package.json
    install_txt = pkg_dir / "install_scripts.txt"
    if install_txt.exists():
        txt = install_txt.read_text(encoding="utf-8", errors="replace").strip()
        if txt:
            chunks.append({"file": "install_scripts.txt", "kind": "script", "start": 0, "ncd": 0.05, "flagged": True, "text": txt[:4096]})

    pkg_json = pkg_dir / "package.json"
    if pkg_json.exists():
        try:
            doc = json.loads(pkg_json.read_text(encoding="utf-8", errors="replace"))
            scripts = doc.get("scripts")
            if isinstance(scripts, dict):
                lines = [f"{h}: {scripts[h]}" for h in HOOKS if isinstance(scripts.get(h), str) and scripts.get(h).strip()]
                if lines:
                    chunks.append({"file": "package.json", "kind": "script", "start": 0, "ncd": 0.05, "flagged": True, "text": "\n".join(lines)[:4096]})
        except Exception:
            pass

    # 2. Collect all JS files and rank them
    js_files = [p for p in sorted(pkg_dir.rglob("*")) if p.is_file() and p.name.endswith(JS_EXT)]
    scored_files: List[Tuple[float, Path, str]] = []
    for p in js_files[:30]:
        try:
            txt = p.read_text(encoding="utf-8", errors="replace")
            if not txt.strip():
                continue
            s = score_code_suspicion(txt[:24576], p.name)
            scored_files.append((s, p, txt))
        except Exception:
            continue

    # Sort descending by suspicion score
    scored_files.sort(key=lambda item: item[0], reverse=True)

    # Take the top files up to ~8,192 chars total
    budget = 8192
    for s_score, p, full_txt in scored_files:
        if budget <= 500:
            break
        piece = full_txt[:budget]
        budget -= len(piece)
        chunks.append({
            "file": p.name,
            "kind": "js",
            "start": 0,
            "ncd": 0.15 if s_score > 0 else 0.85,
            "flagged": s_score > 0,
            "text": piece
        })

    return chunks


def _process_one_package(args: Tuple[str, str, int, int]) -> List[Dict[str, Any]]:
    pkg_path_str, category, label, seed = args
    pkg_dir = Path(pkg_path_str)
    rng = random.Random(seed)

    raw_chunks = extract_package_representative_chunks(pkg_dir)
    if not raw_chunks:
        return []

    results: List[Dict[str, Any]] = []

    # 1. T0 / Baseline
    doc_t0 = {
        "package": pkg_dir.name,
        "tier": "T0",
        "category": category,
        "label": label,
        "chunks": raw_chunks,
    }
    doc_t0["text"] = format_scanner_chunks_to_text(doc_t0)
    results.append(doc_t0)

    # 2. T2 Mangle (Every package gets T2)
    t2_chunks: List[Dict[str, Any]] = []
    for ch in raw_chunks:
        t2_ch = dict(ch)
        if ch.get("kind") == "js":
            t2_ch["text"] = t2_mangle(ch["text"], rng)
        t2_chunks.append(t2_ch)
    doc_t2 = {
        "package": f"{pkg_dir.name}_t2",
        "tier": "T2",
        "category": category,
        "label": label,
        "chunks": t2_chunks,
    }
    doc_t2["text"] = format_scanner_chunks_to_text(doc_t2)
    results.append(doc_t2)

    # 3. Alternate tier (T1, T3, T4)
    alt_tier = ("T1", "T3", "T4")[seed % 3]
    tf_fn = {"T1": t1_format, "T3": t3_pad, "T4": t4_encode}[alt_tier]
    alt_chunks: List[Dict[str, Any]] = []
    for ch in raw_chunks:
        ach = dict(ch)
        if ch.get("kind") == "js":
            ach["text"] = tf_fn(ch["text"], rng)
        alt_chunks.append(ach)
    doc_alt = {
        "package": f"{pkg_dir.name}_{alt_tier.lower()}",
        "tier": alt_tier,
        "category": category,
        "label": label,
        "chunks": alt_chunks,
    }
    doc_alt["text"] = format_scanner_chunks_to_text(doc_alt)
    results.append(doc_alt)

    # 4. Raw Unformatted mode
    first_js = next((c["text"] for c in raw_chunks if c.get("kind") == "js"), "")
    if first_js:
        results.append({
            "package": f"{pkg_dir.name}_raw",
            "tier": "tier_T0_raw",
            "category": category,
            "label": label,
            "text": first_js[:4096]
        })

    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--malware-dir", default="/home/USER/stage2_v2_data/raw_malware")
    parser.add_argument("--benign-dir", default="/home/USER/stage2_v2_data/raw_benign")
    parser.add_argument("--out-dir", default="/home/USER/stage2_v3_data")
    parser.add_argument("--cores", type=int, default=48)
    args = parser.parse_args()

    mal_dir = Path(args.malware_dir)
    ben_dir = Path(args.benign_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    mal_pkgs = sorted([p for p in mal_dir.iterdir() if p.is_dir()])
    ben_pkgs = sorted([p for p in ben_dir.iterdir() if p.is_dir()])
    print(f"[v3 Data Prep] Found {len(mal_pkgs)} malware and {len(ben_pkgs)} benign packages.")

    tasks: List[Tuple[str, str, int, int]] = []
    for idx, p in enumerate(mal_pkgs):
        tasks.append((str(p), "malware", 1, idx + 1000))
    for idx, p in enumerate(ben_pkgs):
        tasks.append((str(p), "benign", 0, idx + 50000))

    print(f"[v3 Data Prep] Processing {len(tasks)} packages across {args.cores} CPU cores...")
    all_docs: List[Dict[str, Any]] = []
    with multiprocessing.Pool(processes=args.cores) as pool:
        for batch_res in pool.imap_unordered(_process_one_package, tasks, chunksize=64):
            all_docs.extend(batch_res)

    print(f"[v3 Data Prep] Generated {len(all_docs)} total examples.")

    rng = random.Random(20261105)
    rng.shuffle(all_docs)

    # Split into train, val, hard_benign_val
    val_size = int(len(all_docs) * 0.08)
    val_docs = all_docs[:val_size]
    train_docs = all_docs[val_size:]
    hard_benign = [d for d in val_docs if d["label"] == 0 and d.get("tier") in ("T1", "T2", "T3", "T4", "tier_T0_raw")]

    def write_jsonl(path: Path, docs: List[Dict[str, Any]]):
        with open(path, "w", encoding="utf-8") as f:
            for d in docs:
                f.write(json.dumps(d) + "\n")
        print(f"  Wrote {len(docs)} records to {path}")

    print("[v3 Data Prep] Saving splits to disk...")
    write_jsonl(out_dir / "train.jsonl", train_docs)
    write_jsonl(out_dir / "validation.jsonl", val_docs)
    write_jsonl(out_dir / "hard_benign_val.jsonl", hard_benign)
    print("[v3 Data Prep] Dataset preparation complete!")


if __name__ == "__main__":
    main()
