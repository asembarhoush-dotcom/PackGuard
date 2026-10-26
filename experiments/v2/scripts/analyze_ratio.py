import argparse, csv, json, os

SCRIPT_FILES = ("install_scripts.txt", "package.json")
MALWARE = ("mal_shape", "mal_stream")
BENIGN = ("ben_general", "ben_scripts")
FIXED = (0.10, 0.19, 0.30)
MIN_JS = (0, 256)


def scores(report, with_scripts, min_js=0):
    """Package score from one report: the lowest chunk NCD, optionally
    leaving out install-script chunks and JavaScript chunks shorter than
    min_js bytes. 1.0 when nothing was scored."""
    vals = [c["ncd"] for c in report["chunks"]
            if (os.path.basename(c["file"]) in SCRIPT_FILES and with_scripts)
            or (os.path.basename(c["file"]) not in SCRIPT_FILES and len(c["text"].encode()) >= min_js)]
    return min(vals) if vals else 1.0


def auc(pos, neg):
    """Probability that a random malicious package scores lower than a
    random benign one (ties count half)."""
    if not pos or not neg:
        return None
    wins = sum((p < n) + 0.5 * (p == n) for p in pos for n in neg)
    return wins / (len(pos) * len(neg))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    meta = {}
    for name in os.listdir(args.work):
        if name.startswith("manifest_") and name.endswith(".json"):
            for m in json.load(open(os.path.join(args.work, name))):
                cat, pkg = m["dir"].split("/", 1)
                meta[f"{cat}__{pkg}"] = m

    rows, summary = [], []
    reports_root = os.path.join(args.work, "reports")
    for run_file in sorted(f for f in os.listdir(reports_root) if f.endswith(".run.json")):
        run = json.load(open(os.path.join(reports_root, run_file)))
        cfg = run["config"]
        with_scripts = run.get("scripts", True)
        folder = os.path.join(reports_root, cfg)
        per_cat = {v: {c: [] for c in MALWARE + BENIGN} for v in MIN_JS}
        scan_seconds = 0.0
        for f in sorted(os.listdir(folder)):
            key = f[:-5]
            cat = key.split("__", 1)[0]
            if cat not in MALWARE + BENIGN:
                continue
            rep = json.load(open(os.path.join(folder, f)))
            scan_seconds += rep.get("seconds", 0.0)
            m = meta.get(key, {})
            row = {"config": cfg, "category": cat, "package": key.split("__", 1)[1],
                   "scripts_only": m.get("scripts_only", ""), "shape_seen": m.get("shape_seen", ""),
                   "chunks": len(rep["chunks"])}
            for v in MIN_JS:
                s = scores(rep, with_scripts, v)
                per_cat[v][cat].append((s, m))
                row[f"score_min_js_{v}"] = round(s, 4)
            rows.append(row)

        for v in MIN_JS:
            pc = per_cat[v]
            benign = [s for c in BENIGN for s, _ in pc[c]]
            floor = min(benign) if benign else 1.0
            out = {"config": cfg, "min_js_bytes": v, "ref_packages": run["ref_packages"],
                   "ref_shapes": run["ref_shapes"], "ref_distinct_chunks": run["ref_distinct"],
                   "load_seconds": run["load_seconds"],
                   "scan_wall_seconds": round(run["wall_seconds"] - (run["load_seconds"] or 0), 1),
                   "chunk_seconds_sum": round(scan_seconds, 1),
                   "max_rss_mib": run["max_rss_mib"], "lowest_benign": round(floor, 4)}
            for cat in MALWARE:
                mal = [s for s, _ in pc[cat]]
                out[f"{cat}_n"] = len(mal)
                out[f"{cat}_recall_no_fa"] = round(sum(s < floor for s in mal) / len(mal), 4) if mal else None
                for t in FIXED:
                    out[f"{cat}_recall_{t:.2f}"] = round(sum(s <= t for s in mal) / len(mal), 4) if mal else None
                out[f"{cat}_auc"] = round(auc(mal, benign), 4) if mal and benign else None
                so = [s for s, m in pc[cat] if m.get("scripts_only")]
                out[f"{cat}_scripts_only_n"] = len(so)
                out[f"{cat}_scripts_only_recall_0.19"] = round(sum(s <= 0.19 for s in so) / len(so), 4) if so else None
            for cat in BENIGN:
                ben = [s for s, _ in pc[cat]]
                out[f"{cat}_n"] = len(ben)
                for t in FIXED:
                    out[f"{cat}_fa_{t:.2f}"] = sum(s <= t for s in ben)
            summary.append(out)
            print(json.dumps(out))

    with open(os.path.join(args.out, "summary.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(summary[0]))
        w.writeheader()
        w.writerows(summary)
    with open(os.path.join(args.out, "packages.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main()
