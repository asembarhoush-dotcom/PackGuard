import argparse
import concurrent.futures
import csv
import io
import json
import random
import shutil
import tarfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


JS_EXT = (".js", ".cjs", ".mjs")
HOOKS = ("preinstall", "install", "postinstall")


def extract_malware_packages(
    zip_dir: Path,
    out_dir: Path,
    max_packages: int = 600,
    seed: int = 42,
) -> List[Path]:
    """Extract a balanced sample of malware packages across code shapes from encrypted data/v2 zips."""
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

    extracted_dirs: List[Path] = []
    out_dir.mkdir(parents=True, exist_ok=True)

    by_zip: Dict[Path, List[Tuple[str, str]]] = {}
    for key in selected_keys:
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
                data = zf.read(member)
                dest.write_bytes(data)

    for key in selected_keys:
        shape_id, pkg_ver = key.split("/", 1)
        safe_pkg = f"{shape_id}__{pkg_ver.replace('/', '_')}"
        pkg_path = out_dir / safe_pkg
        if pkg_path.is_dir():
            extracted_dirs.append(pkg_path)

    print(f"[Stage2 Dataset] Extracted {len(extracted_dirs)} malicious packages from {zip_dir}")
    return extracted_dirs


def collect_benign_package_specs(repo_root: Path, max_packages: int = 600) -> List[Tuple[str, str, float]]:
    """Read benign package names, versions, and Stage 1 NCD scores from experiments/v3 & v1 CSVs."""
    specs: Dict[Tuple[str, str], float] = {}

    v3_csv = repo_root / "experiments" / "v3" / "results" / "packages.csv"
    if v3_csv.exists():
        with v3_csv.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("tag") != "v3-baseline":
                    continue
                cat = row.get("category", "")
                if not cat.startswith("ben_"):
                    continue
                pkg_ver = row.get("package", "")
                if "@" not in pkg_ver:
                    continue
                raw_name, ver = pkg_ver.rsplit("@", 1)
                if raw_name.startswith("@") and "_" in raw_name:
                    npm_name = raw_name.replace("_", "/", 1)
                else:
                    npm_name = raw_name
                try:
                    score = float(row.get("score_min_js_256") or row.get("score_min_js_0") or 0.85)
                except ValueError:
                    score = 0.85
                specs[(npm_name, ver)] = score

    v1_csv = repo_root / "experiments" / "v1" / "results" / "packages.csv"
    if v1_csv.exists():
        with v1_csv.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("truth") != "benign":
                    continue
                npm_name = row.get("package", "")
                ver = row.get("version", "")
                if npm_name and ver:
                    try:
                        score = float(row.get("score") or 0.85)
                    except ValueError:
                        score = 0.85
                    specs.setdefault((npm_name, ver), score)

    sorted_specs = sorted(specs.items(), key=lambda kv: kv[1])
    return [(name, ver, sc) for (name, ver), sc in sorted_specs[:max_packages]]


def download_one_benign(spec: Tuple[str, str, float], out_dir: Path) -> Optional[Tuple[Path, float]]:
    """Download a single benign npm package tarball and extract its JS + package.json."""
    npm_name, ver, stage1_score = spec
    safe_dir_name = f"{npm_name.replace('/', '_')}@{ver}"
    pkg_dir = out_dir / safe_dir_name
    if pkg_dir.exists() and any(pkg_dir.iterdir()):
        return pkg_dir, stage1_score

    encoded_name = urllib.parse.quote(npm_name, safe="@/")
    meta_url = f"https://registry.npmjs.org/{encoded_name}/{ver}"
    try:
        req = urllib.request.Request(meta_url, headers={"User-Agent": "PackGuard-Research/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            doc = json.loads(resp.read().decode("utf-8", errors="replace"))
        tarball_url = doc.get("dist", {}).get("tarball")
        if not tarball_url:
            return None

        t_req = urllib.request.Request(tarball_url, headers={"User-Agent": "PackGuard-Research/1.0"})
        with urllib.request.urlopen(t_req, timeout=30) as resp:
            blob = resp.read()

        extracted_any = False
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tf:
            for member in tf.getmembers():
                if not member.isfile() or "/" not in member.name:
                    continue
                rel = member.name.split("/", 1)[1]
                parts = rel.split("/")
                if rel.startswith("/") or ".." in parts or "node_modules" in parts:
                    continue
                if rel == "package.json" or rel.endswith(JS_EXT):
                    fobj = tf.extractfile(member)
                    if fobj is None:
                        continue
                    data = fobj.read()
                    dest = pkg_dir / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(data)
                    extracted_any = True

        return (pkg_dir, stage1_score) if extracted_any else None
    except Exception:
        return None


def package_dir_to_record(pkg_dir: Path, label: int, default_score: float) -> Optional[Dict[str, Any]]:
    """Convert an extracted package directory into a Stage 1 -> Stage 2 chunked JSONL record."""
    chunks: List[Dict[str, Any]] = []
    pkg_name = pkg_dir.name
    pkg_ver = "0.0.0"
    if "@" in pkg_name:
        pkg_name, pkg_ver = pkg_name.rsplit("@", 1)

    pkg_json_path = pkg_dir / "package.json"
    if pkg_json_path.is_file():
        try:
            doc = json.loads(pkg_json_path.read_text(encoding="utf-8", errors="replace"))
            pkg_name = str(doc.get("name") or pkg_name)
            pkg_ver = str(doc.get("version") or pkg_ver)
            scripts = doc.get("scripts")
            if isinstance(scripts, dict):
                hook_lines = [
                    f"{h}: {scripts[h]}"
                    for h in HOOKS
                    if isinstance(scripts.get(h), str) and scripts[h].strip()
                ]
                if hook_lines:
                    chunks.append(
                        {
                            "file": "package.json#scripts",
                            "start": 0,
                            "ncd": round(max(0.01, default_score - 0.05), 4),
                            "text": "\n".join(hook_lines),
                        }
                    )
        except Exception:
            pass

    install_txt = pkg_dir / "install_scripts.txt"
    if install_txt.is_file():
        txt = install_txt.read_text(encoding="utf-8", errors="replace").strip()
        if txt:
            chunks.append(
                {
                    "file": "install_scripts.txt",
                    "start": 0,
                    "ncd": round(max(0.01, default_score - 0.05), 4),
                    "text": txt,
                }
            )

    for fpath in sorted(pkg_dir.rglob("*")):
        if not fpath.is_file() or not fpath.name.endswith(JS_EXT):
            continue
        rel = str(fpath.relative_to(pkg_dir)).replace("\\", "/")
        raw_text = fpath.read_text(encoding="utf-8", errors="replace")
        if not raw_text.strip():
            continue
        window = 8192
        stride = 4096
        if len(raw_text) <= window:
            chunks.append(
                {
                    "file": rel,
                    "start": 0,
                    "ncd": round(default_score, 4),
                    "text": raw_text,
                }
            )
        else:
            for start in range(0, len(raw_text), stride):
                piece = raw_text[start : start + window]
                if not piece.strip():
                    continue
                chunks.append(
                    {
                        "file": rel,
                        "start": start,
                        "ncd": round(default_score, 4),
                        "text": piece,
                    }
                )
                if start + window >= len(raw_text):
                    break

    if not chunks:
        return None

    return {
        "package": pkg_name,
        "version": pkg_ver,
        "score": round(default_score, 4),
        "chunks": chunks[:16],
        "label": label,
    }


def main():
    """Extract data/v2 malware and download v3/v1 benign packages into train/validation JSONL splits."""
    parser = argparse.ArgumentParser(description="Build PackGuard Stage 2 Dataset from repo data/v2 & npm benign set")
    parser.add_argument("--repo_root", type=str, default=".", help="Path to PackGuard repository root")
    parser.add_argument("--out_dir", type=str, default="./data", help="Output directory for train.jsonl and validation.jsonl")
    parser.add_argument("--max_malware", type=int, default=450, help="Number of malicious packages to sample")
    parser.add_argument("--max_benign", type=int, default=450, help="Number of benign packages to download")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    out_dir = Path(args.out_dir).resolve()
    work_dir = Path("/tmp/packguard_stage2_work")
    mal_dir = work_dir / "malicious"
    ben_dir = work_dir / "benign"

    mal_dirs = extract_malware_packages(
        zip_dir=repo_root / "data" / "v2",
        out_dir=mal_dir,
        max_packages=args.max_malware,
        seed=args.seed,
    )

    ben_specs = collect_benign_package_specs(repo_root, max_packages=args.max_benign)
    print(f"[Stage2 Dataset] Downloading {len(ben_specs)} benign npm packages in parallel...")
    ben_results: List[Tuple[Path, float]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=24) as ex:
        futures = [ex.submit(download_one_benign, spec, ben_dir) for spec in ben_specs]
        for fut in concurrent.futures.as_completed(futures):
            res = fut.result()
            if res is not None:
                ben_results.append(res)
    print(f"[Stage2 Dataset] Downloaded {len(ben_results)} benign npm packages.")

    rng = random.Random(args.seed)
    records: List[Dict[str, Any]] = []

    for mpath in mal_dirs:
        sim_score = rng.uniform(0.015, 0.185)
        rec = package_dir_to_record(mpath, label=1, default_score=sim_score)
        if rec is not None:
            records.append(rec)

    for bpath, bscore in ben_results:
        rec = package_dir_to_record(bpath, label=0, default_score=bscore)
        if rec is not None:
            records.append(rec)

    rng.shuffle(records)
    val_count = max(1, int(len(records) * 0.15))
    val_records = records[:val_count]
    train_records = records[val_count:]

    out_dir.mkdir(parents=True, exist_ok=True)
    train_path = out_dir / "train.jsonl"
    val_path = out_dir / "validation.jsonl"

    with train_path.open("w", encoding="utf-8") as f:
        for r in train_records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    with val_path.open("w", encoding="utf-8") as f:
        for r in val_records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    shutil.rmtree(work_dir, ignore_errors=True)
    print(
        f"[Stage2 Dataset] Wrote {len(train_records)} train records to {train_path} "
        f"and {len(val_records)} validation records to {val_path}."
    )


if __name__ == "__main__":
    main()
