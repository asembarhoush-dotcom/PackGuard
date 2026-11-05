import concurrent.futures
import csv
import io
import json
import os
import random
import sys
import tarfile
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO_ROOT = Path("/home/USER/PackGuard")
sys.path.insert(0, str(REPO_ROOT / "stage 2 LLM Model" / "v3"))
sys.path.insert(0, str(REPO_ROOT / "experiments" / "v4" / "scripts"))

import mangle
from stage2_filter import PackGuardStage2Model
from text_formatter import clean_and_unfold_js, extract_structural_features, RE_WINDOW_SUSP

CACHE_DIR = Path("/home/USER/v6_eval_cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)
(CACHE_DIR / "benign").mkdir(parents=True, exist_ok=True)


def fetch_npm_js_files(name: str, version: str) -> List[Tuple[str, str]]:
    safe_key = f"{name.replace('/', '_').replace('@', '')}__{version}"
    cache_file = CACHE_DIR / "benign" / f"{safe_key}.json"
    if cache_file.exists():
        try:
            return [tuple(x) for x in json.loads(cache_file.read_text(encoding="utf-8"))]
        except Exception:
            pass

    encoded_name = urllib.parse.quote(name, safe="@/")
    meta_url = f"https://registry.npmjs.org/{encoded_name}/{version}"
    files: List[Tuple[str, str]] = []
    try:
        req = urllib.request.Request(meta_url, headers={"User-Agent": "PackGuard-V6-Eval/1.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            doc = json.loads(resp.read().decode("utf-8", errors="replace"))
        tarball_url = doc.get("dist", {}).get("tarball")
        if tarball_url:
            t_req = urllib.request.Request(tarball_url, headers={"User-Agent": "PackGuard-V6-Eval/1.0"})
            with urllib.request.urlopen(t_req, timeout=15) as resp:
                blob = resp.read()
            with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tf:
                for member in tf.getmembers():
                    if member.isfile() and member.name.endswith((".js", ".cjs", ".mjs")) and member.size <= 128 * 1024:
                        fobj = tf.extractfile(member)
                        if fobj:
                            files.append((Path(member.name).name, fobj.read().decode("utf-8", errors="replace")))
        if files:
            cache_file.write_text(json.dumps(files), encoding="utf-8")
    except Exception:
        pass
    return files


def extract_v1_v2_malware_lookup(target_pvs: List[str]) -> Dict[str, List[Tuple[str, str]]]:
    wanted = set(target_pvs)
    for pv in list(wanted):
        if "/" in pv:
            wanted.add(pv.replace("/", "_"))
    out: Dict[str, List[Tuple[str, str]]] = {}
    for ds in ("v1", "v2"):
        for zp in sorted((REPO_ROOT / "data" / ds).glob("malware_js_*.zip")):
            with zipfile.ZipFile(zp, "r") as zf:
                zf.setpassword(b"infected")
                for member in zf.namelist():
                    if member.endswith("/"):
                        continue
                    parts = member.split("/", 2)
                    if len(parts) < 3:
                        continue
                    grp, pv, fname = parts[0], parts[1], parts[2]
                    if pv in wanted:
                        txt = zf.read(member).decode("utf-8", errors="replace")
                        out.setdefault(pv, []).append((fname, txt[:32768]))
    return out


def is_executable_malware_package(js_files: List[Tuple[str, str]]) -> bool:
    """
    Exclude the 2 data/v1 placeholder/React-UI-only packages (`my-rei-browser-shim@1.0.0`,
    which is `module.exports = {};`, and `@toptal_picasso-alert@3.0.39`, which has only
    pure React UI files because its malicious package.json hook was not stored in data/v1).
    """
    for fname, txt in js_files:
        if "install_scripts.txt" in fname.lower():
            if txt.strip():
                return True
        if "module.exports = {};" in txt and len(txt.strip()) < 100:
            continue
        feats = extract_structural_features(txt)
        if (
            feats["has_cp"]
            or feats["has_net"]
            or feats["has_os_fs"]
            or feats["process"] > 0
            or feats["buffer"] > 0
            or feats["eval"] > 0
            or feats["exec"] > 0
            or feats["net"] > 0
            or feats["trojan"] > 0
            or len(RE_WINDOW_SUSP.findall(txt)) > 0
        ):
            return True
    return False


def build_stage1_v6_report(pkg_name: str, js_files: List[Tuple[str, str]], tier: str, rng: random.Random) -> Dict[str, Any]:
    """
    Simulate the exact Stage 1 C17 scanner report structure:
    - Full files are transformed by `mangle.TRANSFORMS[tier]`
    - Large files are emitted as 8,192-byte chunks with `start = offset` so `format_scanner_chunks_to_text`
      reassembles them by `start` offset before unfolding `T4` Base64!
    """
    chunks: List[Dict[str, Any]] = []
    script_files = [(n, t) for n, t in js_files if "install_scripts.txt" in n.lower()]
    code_files = [(n, t) for n, t in js_files if "install_scripts.txt" not in n.lower()]

    for orig_name, raw_text in script_files:
        if raw_text.strip():
            chunks.append({
                "file": "install_scripts.txt",
                "kind": "script",
                "start": 0,
                "ncd": 0.10,
                "flagged": True,
                "text": raw_text.strip(),
            })

    for idx, (orig_name, raw_text) in enumerate(code_files[:12]):
        transformed = mangle.TRANSFORMS[tier](raw_text, rng) if tier in mangle.TRANSFORMS else raw_text
        fname = f"file_{idx:02d}{os.path.splitext(orig_name)[1] or '.js'}" if tier == "T2" else orig_name
        # Emit 8 KiB chunks with exact byte offsets just like Stage 1 packguard C17 scanner
        for start_off in range(0, len(transformed), 8192):
            piece = transformed[start_off : start_off + 8192]
            chunks.append({
                "file": fname,
                "kind": "js",
                "start": start_off,
                "ncd": 0.20 if idx == 0 else 0.50,
                "flagged": (idx == 0),
                "text": piece,
            })

    return {
        "package": pkg_name,
        "version": "1.0.0",
        "tier": tier,
        "score": 0.25,
        "flagged": True,
        "chunks": chunks,
    }


def main():
    print("[v6 + Stage 2 v3 Real-Life Server Eval] Initializing PackGuard Stage 2 v3 Ensemble (v2 + v3 ONNX)...")
    s2 = PackGuardStage2Model(
        model_dir=Path("/home/USER/stage2_v3_onnx"),
        max_length=1024,
        threshold=0.62,
        threads=24,
    )

    # 1. Load v6 Test & Validation specs
    v1_csv = REPO_ROOT / "experiments" / "v1" / "results" / "packages.csv"
    test_ben_specs, test_mal_pvs = [], []
    with v1_csv.open("r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            cat = row["category"]
            pkg, ver = row["package"], row["version"]
            if cat.startswith("ben_"):
                test_ben_specs.append((pkg, ver, cat))
            else:
                test_mal_pvs.append(f"{pkg}@{ver}")

    val_ben_json = json.loads((REPO_ROOT / "experiments" / "v6" / "results" / "validation_manifest_benign.json").read_text(encoding="utf-8"))
    val_ben_specs = [(x["name"], x["version"], x["category"]) for x in val_ben_json]

    val_mal_json = json.loads((REPO_ROOT / "experiments" / "v6" / "results" / "validation_manifest_malware.json").read_text(encoding="utf-8"))
    val_mal_pvs = [f"{x['name']}@{x['version']}" for x in val_mal_json]

    extra_fa = [("hasown", "2.0.2", "ben_popular"), ("date-format-php", "1.0.2", "ben_longtail")]
    all_ben = list({(n, v): c for n, v, c in (test_ben_specs + val_ben_specs + extra_fa)}.items())
    ben_map = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=32) as ex:
        futs = {ex.submit(fetch_npm_js_files, n, v): (n, v) for (n, v), _ in all_ben}
        for fut in concurrent.futures.as_completed(futs):
            nv = futs[fut]
            res = fut.result()
            if res:
                ben_map[nv] = res

    mal_map = extract_v1_v2_malware_lookup(test_mal_pvs + val_mal_pvs)

    # Filter to executable JS malware packages
    exec_test_mal = [pv for pv in test_mal_pvs if pv in mal_map and is_executable_malware_package(mal_map[pv])]
    exec_val_mal = [pv for pv in val_mal_pvs if pv in mal_map and is_executable_malware_package(mal_map[pv])]
    all_exec_mal = list(dict.fromkeys(exec_test_mal + exec_val_mal))

    print(f"Loaded {len(ben_map)} benign npm packages and {len(all_exec_mal)} executable v6 malware packages (Test={len(exec_test_mal)}, Val={len(exec_val_mal)}).")

    # 2. Evaluate Stage 1 v6 False Alarms (Test + Val)
    test_budget = json.loads((REPO_ROOT / "experiments" / "v6" / "results" / "test_budget.json").read_text(encoding="utf-8"))
    val_budget = json.loads((REPO_ROOT / "experiments" / "v6" / "results" / "validation_budget.json").read_text(encoding="utf-8"))
    stage1_fas = [("TEST", x) for x in test_budget["false_alarms"] + ["T2/ben_popular/hasown@2.0.2", "T4/ben_longtail/date-format-php@1.0.2"]] + [("VAL", x) for x in val_budget["false_alarms"]]

    rng = random.Random(20261105)
    print("\n=== 1. STAGE 1 v6 FALSE ALARM ELIMINATION (REAL SERVER TEST) ===")
    fa_vetoed, fa_total = 0, 0
    for split, item in stage1_fas:
        tier, cat, pkg_ver = item.split("/", 2)
        raw_name, ver = pkg_ver.rsplit("@", 1)
        npm_name = raw_name.replace("_", "/", 1) if (raw_name.startswith("@") and "_" in raw_name) else raw_name
        jfiles = ben_map.get((npm_name, ver))
        if not jfiles:
            continue
        rep = build_stage1_v6_report(pkg_ver, jfiles, tier, rng)
        is_mal, prob = s2.predict_record(rep)
        fa_total += 1
        if not is_mal:
            fa_vetoed += 1
        status = "ELIMINATED (BENIGN)" if not is_mal else "FALSE ALARM REMAINING"
        print(f"  [{split:<4} {status}] {item:<52} prob={prob:.4f}")
    print(f"--> Stage 1 v6 False Alarms Eliminated: {fa_vetoed}/{fa_total} ({fa_vetoed/fa_total*100:.2f}%) -> Combined FPR: {(fa_total-fa_vetoed)/fa_total*100:.2f}%")

    # 3. Full Tier-by-Tier Evaluation (T1, T2, T3, T4)
    print("\n=== 2. TIER-BY-TIER REAL-LIFE BENCHMARK (T1, T2, T3, T4) ===")
    tier_summary = {}
    for tier in ("T1", "T2", "T3", "T4"):
        ben_reps = [build_stage1_v6_report(f"{n}@{v}", ben_map[(n, v)], tier, rng) for (n, v), _ in all_ben if (n, v) in ben_map]
        mal_reps = [build_stage1_v6_report(pv, mal_map[pv], tier, rng) for pv in all_exec_mal]

        ben_preds = s2.predict_records_batch(ben_reps, batch_size=32)
        mal_preds = s2.predict_records_batch(mal_reps, batch_size=32)

        fp = sum(1 for im, _ in ben_preds if im)
        tn = len(ben_preds) - fp
        tp = sum(1 for im, _ in mal_preds if im)
        fn = len(mal_preds) - tp

        spec = tn / max(1, len(ben_preds))
        fpr = fp / max(1, len(ben_preds))
        rec = tp / max(1, len(mal_preds))
        bal_acc = 0.5 * (spec + rec)

        missed_pvs = [(all_exec_mal[i], mal_preds[i][1]) for i in range(len(mal_preds)) if not mal_preds[i][0]]
        fp_pvs = [(all_ben[i][0], ben_preds[i][1]) for i in range(len(ben_preds)) if ben_preds[i][0]]

        tier_summary[tier] = {
            "malware_recall": round(rec, 6),
            "malware_tp": tp,
            "malware_total": len(mal_preds),
            "benign_specificity": round(spec, 6),
            "benign_fpr": round(fpr, 6),
            "benign_tn": tn,
            "benign_fp": fp,
            "benign_total": len(ben_preds),
            "balanced_accuracy": round(bal_acc, 6),
        }
        print(
            f"  [{tier}] Malware Recall: {tp}/{len(mal_preds)} ({rec*100:.2f}%) | "
            f"Benign Specificity: {tn}/{len(ben_preds)} ({spec*100:.2f}%, FPR={fpr*100:.2f}%) | "
            f"Balanced Acc: {bal_acc*100:.2f}%"
        )
        if missed_pvs:
            print(f"       Missed ({len(missed_pvs)}): {missed_pvs[:5]}")
        if fp_pvs:
            print(f"       False Alarms ({len(fp_pvs)}): {fp_pvs[:5]}")

    out_doc = {
        "false_alarm_elimination": {
            "eliminated": fa_vetoed,
            "total": fa_total,
            "elimination_rate": round(fa_vetoed / max(1, fa_total), 6),
        },
        "tiers": tier_summary,
    }
    Path("/home/USER/v3_benchmark_results.json").write_text(json.dumps(out_doc, indent=2), encoding="utf-8")
    print("\nSaved server benchmark results to /home/USER/v3_benchmark_results.json")


if __name__ == "__main__":
    main()
