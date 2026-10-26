import argparse
import csv
import json
import os

SCRIPT_FILES = ("install_scripts.txt", "package.json")
MALWARE = ("mal_shape", "mal_stream")
BENIGN = ("ben_general", "ben_scripts")
FIXED = (0.10, 0.19, 0.30)
MIN_JS = (0, 256)
DEFAULT_SCRIPT_THRESHOLD = 0.45


def chunk_kind(chunk):
    """Returns 'install_script' for package.json and install_scripts.txt
    chunks, and 'js' for everything else; a report's kind field wins."""
    kind = chunk.get("kind")
    if kind in ("js", "install_script"):
        return kind
    return "install_script" if os.path.basename(chunk.get("file", "")) in SCRIPT_FILES else "js"


def chunk_bytes(chunk):
    """Returns the chunk length as written, in bytes of UTF-8."""
    return len(chunk.get("text", "").encode())


def ncd(chunk):
    """Returns the chunk NCD, or None when the report wrote null."""
    value = chunk.get("ncd")
    return value if isinstance(value, (int, float)) else None


def js_scores(report, min_js=0):
    """Lists the NCDs of scored JavaScript chunks at least min_js bytes
    long, leaving out ignored chunks."""
    return [ncd(c) for c in report["chunks"]
            if chunk_kind(c) == "js" and not c.get("ignored", False)
            and chunk_bytes(c) >= min_js and ncd(c) is not None]


def script_scores(report):
    """Lists the NCDs of scored install-script chunks."""
    return [ncd(c) for c in report["chunks"]
            if chunk_kind(c) == "install_script" and ncd(c) is not None]


def score(report, min_js=0):
    """Package score from one report: the lowest eligible chunk NCD,
    including install scripts; 1.0 when nothing was scored."""
    values = js_scores(report, min_js) + script_scores(report)
    return min(values) if values else 1.0


def lowest(values):
    """Returns the lowest value, or None for an empty list."""
    return min(values) if values else None


def flagged(report, js_threshold, script_threshold, min_js=0):
    """Returns 1 when the package's JavaScript score is at or below
    js_threshold or its install-script score is at or below
    script_threshold, otherwise 0."""
    js = lowest(js_scores(report, min_js))
    script = lowest(script_scores(report))
    return int((js is not None and js <= js_threshold)
               or (script is not None and script <= script_threshold))


def auc(pos, neg):
    """Probability that a random malicious package scores lower than a
    random benign one (ties count half)."""
    if not pos or not neg:
        return None
    wins = sum((p < n) + 0.5 * (p == n) for p in pos for n in neg)
    return wins / (len(pos) * len(neg))


def load_meta(work):
    """Reads every manifest_*.json in work and maps <category>__<package>
    to its target metadata."""
    meta = {}
    for name in os.listdir(work):
        if name.startswith("manifest_") and name.endswith(".json"):
            for m in json.load(open(os.path.join(work, name))):
                cat, pkg = m["dir"].split("/", 1)
                meta[f"{cat}__{pkg}"] = m
    return meta


def load_runs(work, tags):
    """Reads reports/<tag>.run.json for the requested tags, or for every
    run file when tags is empty, sorted by tag."""
    reports = os.path.join(work, "reports")
    if not tags:
        tags = sorted(f[:-9] for f in os.listdir(reports) if f.endswith(".run.json"))
    return [(tag, json.load(open(os.path.join(reports, tag + ".run.json")))) for tag in tags]


def analyze(work, out, tags):
    """Writes summary.csv, packages.csv and chunks.csv for the run tags and
    prints one summary row per tag and min_js setting."""
    meta = load_meta(work)
    reports_root = os.path.join(work, "reports")
    rows, summary = [], []
    chunk_rows = []
    for tag, run in load_runs(work, tags):
        folder = os.path.join(reports_root, tag)
        per_cat = {v: {c: [] for c in MALWARE + BENIGN} for v in MIN_JS}
        per_cat_v3 = {t: {c: [] for c in MALWARE + BENIGN} for t in FIXED}
        scan_seconds = 0.0
        for f in sorted(os.listdir(folder)):
            key = f[:-5]
            cat = key.split("__", 1)[0]
            if cat not in MALWARE + BENIGN:
                continue
            rep = json.load(open(os.path.join(folder, f)))
            scan_seconds += rep.get("seconds", 0.0)
            m = meta.get(key, {})
            package = key.split("__", 1)[1]
            script = lowest(script_scores(rep))
            row = {"tag": tag, "category": cat, "package": package,
                   "scripts_only": m.get("scripts_only", ""), "shape_seen": m.get("shape_seen", ""),
                   "chunks": len(rep["chunks"]), "script_score": script}
            for v in MIN_JS:
                s = score(rep, v)
                js = lowest(js_scores(rep, v))
                per_cat[v][cat].append((s, m))
                row[f"score_min_js_{v}"] = round(s, 4)
                row[f"js_score_min_js_{v}"] = round(js, 4) if js is not None else None
            script_threshold = run.get("script_threshold")
            script_threshold = DEFAULT_SCRIPT_THRESHOLD if script_threshold is None else script_threshold
            for t in FIXED:
                flag = flagged(rep, t, script_threshold, 256)
                per_cat_v3[t][cat].append((flag, m))
                row[f"flagged_{t:.2f}"] = flag
            row["low_confidence"] = int(bool(rep.get("low_confidence", False)))
            rows.append(row)
            for c in rep["chunks"]:
                chunk_rows.append({
                    "tag": tag, "category": cat, "package": package,
                    "file": c.get("file", ""), "start": c.get("start"),
                    "kind": chunk_kind(c), "bytes": chunk_bytes(c), "ncd": ncd(c),
                    "match_file": c.get("match", {}).get("file"),
                    "match_package": c.get("match", {}).get("package"),
                    "match_start": c.get("match", {}).get("start"),
                    "ignored": int(bool(c.get("ignored", False))),
                    "low_confidence": int(bool(rep.get("low_confidence", False))),
                })

        for v in MIN_JS:
            pc = per_cat[v]
            benign = [s for c in BENIGN for s, _ in pc[c]]
            floor = min(benign) if benign else 1.0
            out_row = {"tag": tag, "config": run.get("config"), "min_js_bytes": v,
                       "ref_packages": run.get("ref_packages"), "ref_shapes": run.get("ref_shapes"),
                       "ref_distinct_chunks": run.get("ref_distinct"),
                       "load_seconds": run.get("load_seconds"),
                       "scan_wall_seconds": round(run.get("wall_seconds", 0) - (run.get("load_seconds") or 0), 1),
                       "chunk_seconds_sum": round(scan_seconds, 1),
                       "max_rss_mib": run.get("max_rss_mib"), "lowest_benign": round(floor, 4),
                       "script_threshold": run.get("script_threshold")}
            for cat in MALWARE:
                mal = [s for s, _ in pc[cat]]
                out_row[f"{cat}_n"] = len(mal)
                out_row[f"{cat}_recall_no_fa"] = round(sum(s < floor for s in mal) / len(mal), 4) if mal else None
                for t in FIXED:
                    out_row[f"{cat}_recall_{t:.2f}"] = round(sum(s <= t for s in mal) / len(mal), 4) if mal else None
                out_row[f"{cat}_auc"] = round(auc(mal, benign), 4) if mal and benign else None
                so = [s for s, m in pc[cat] if m.get("scripts_only")]
                out_row[f"{cat}_scripts_only_n"] = len(so)
                out_row[f"{cat}_scripts_only_recall_0.19"] = round(sum(s <= 0.19 for s in so) / len(so), 4) if so else None
            for cat in BENIGN:
                ben = [s for s, _ in pc[cat]]
                out_row[f"{cat}_n"] = len(ben)
                for t in FIXED:
                    out_row[f"{cat}_fa_{t:.2f}"] = sum(s <= t for s in ben)
            for t in FIXED:
                out_row[f"v3_{t:.2f}_mal_shape_recall"] = (
                    round(sum(flag for flag, _ in per_cat_v3[t]["mal_shape"]) / len(per_cat_v3[t]["mal_shape"]), 4)
                    if per_cat_v3[t]["mal_shape"] else None)
                out_row[f"v3_{t:.2f}_mal_stream_recall"] = (
                    round(sum(flag for flag, _ in per_cat_v3[t]["mal_stream"]) / len(per_cat_v3[t]["mal_stream"]), 4)
                    if per_cat_v3[t]["mal_stream"] else None)
                out_row[f"v3_{t:.2f}_ben_general_fa"] = sum(flag for flag, _ in per_cat_v3[t]["ben_general"])
                out_row[f"v3_{t:.2f}_ben_scripts_fa"] = sum(flag for flag, _ in per_cat_v3[t]["ben_scripts"])
                so = [flag for flag, m in per_cat_v3[t]["mal_shape"] + per_cat_v3[t]["mal_stream"]
                      if m.get("scripts_only")]
                out_row[f"v3_{t:.2f}_scripts_only_recall"] = round(sum(so) / len(so), 4) if so else None
            summary.append(out_row)
            print(json.dumps(out_row))

    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "summary.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(summary[0]))
        w.writeheader()
        w.writerows(summary)
    with open(os.path.join(out, "packages.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    with open(os.path.join(out, "chunks.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(chunk_rows[0]))
        w.writeheader()
        w.writerows(chunk_rows)


def main():
    """Analyzes one or more run tags and writes the three CSV files."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default=os.path.expanduser("~/pg-v2"))
    ap.add_argument("--out", required=True)
    ap.add_argument("tags", nargs="*")
    args = ap.parse_args()
    analyze(args.work, args.out, args.tags)


if __name__ == "__main__":
    main()
