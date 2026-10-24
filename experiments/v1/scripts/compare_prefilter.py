import argparse, csv, json, os


def load_reports(d):
    out = {}
    for f in os.listdir(d):
        if f.endswith(".json"):
            out[f[:-5]] = json.load(open(os.path.join(d, f), encoding="utf-8"))
    return out


def auc(pos, neg):
    if not pos or not neg:
        return float("nan")
    s = sum((p < n) + 0.5 * (p == n) for p in pos for n in neg)
    return s / (len(pos) * len(neg))


def category_of(test, name):
    for cat in ("mal_known", "mal_newver", "mal_newname", "ben_popular", "ben_longtail"):
        if os.path.isdir(os.path.join(test, "targets", cat, name)):
            return cat
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", required=True)
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--runs", nargs="+", required=True, help="N=dir pairs")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    base = load_reports(args.baseline)
    cats = {k: category_of(args.test, k) for k in base}
    base_time = sum(r["seconds"] for r in base.values())
    base_pos = [r["score"] for k, r in base.items() if cats[k].startswith("mal_")]
    base_neg = [r["score"] for k, r in base.items() if cats[k].startswith("ben_")]
    rows = [{"candidates": "all (brute force)", "packages": len(base),
             "chunks": sum(len(r["chunks"]) for r in base.values()),
             "chunk_exact": 1.0, "chunk_within_0.01": 1.0, "chunk_mean_diff": 0.0, "chunk_max_diff": 0.0,
             "package_exact": 1.0, "package_within_0.01": 1.0, "package_max_diff": 0.0,
             "same_closest_package": 1.0, "scan_seconds": round(base_time, 1), "speedup": 1.0,
             "auc": round(auc(base_pos, base_neg), 4)}]
    detail = []
    for spec in args.runs:
        n, d = spec.split("=", 1)
        run = load_reports(d)
        keys = sorted(set(run) & set(base))
        cd, pd, same_pkg, t = [], [], 0, 0.0
        for k in keys:
            b, r = base[k], run[k]
            t += r["seconds"]
            for cb, cr in zip(b["chunks"], r["chunks"]):
                cd.append(cr["ncd"] - cb["ncd"])
            pd.append(r["score"] - b["score"])
            bm = b["chunks"][min(range(len(b["chunks"])), key=lambda i: b["chunks"][i]["ncd"])]["match"]["file"]
            rm = r["matched_packages"][0]["package"] if r.get("matched_packages") else ""
            same_pkg += int(bm.split("/")[1] == rm if bm.count("/") >= 2 else False)
            detail.append({"candidates": n, "package": k, "category": cats[k], "baseline_score": b["score"],
                           "prefilter_score": r["score"], "diff": round(r["score"] - b["score"], 4),
                           "baseline_match": bm, "prefilter_closest_package": rm,
                           "baseline_seconds": b["seconds"], "prefilter_seconds": r["seconds"]})
        pos = [run[k]["score"] for k in keys if cats[k].startswith("mal_")]
        neg = [run[k]["score"] for k in keys if cats[k].startswith("ben_")]
        bt = sum(base[k]["seconds"] for k in keys)
        rows.append({"candidates": n, "packages": len(keys), "chunks": len(cd),
                     "chunk_exact": round(sum(abs(x) < 1e-9 for x in cd) / len(cd), 4),
                     "chunk_within_0.01": round(sum(x < 0.01 for x in cd) / len(cd), 4),
                     "chunk_mean_diff": round(sum(cd) / len(cd), 4), "chunk_max_diff": round(max(cd), 4),
                     "package_exact": round(sum(abs(x) < 1e-9 for x in pd) / len(pd), 4),
                     "package_within_0.01": round(sum(x < 0.01 for x in pd) / len(pd), 4),
                     "package_max_diff": round(max(pd), 4),
                     "same_closest_package": round(same_pkg / len(keys), 4),
                     "scan_seconds": round(t, 1), "speedup": round(bt / t, 1) if t else 0,
                     "auc": round(auc(pos, neg), 4)})

    os.makedirs(args.out, exist_ok=True)
    for name, data in (("prefilter_summary.csv", rows), ("prefilter_packages.csv", detail)):
        with open(os.path.join(args.out, name), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(data[0].keys()))
            w.writeheader()
            w.writerows(data)
    for r in rows:
        print(r)


if __name__ == "__main__":
    main()
