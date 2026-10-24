import argparse, collections, csv, json, os

SPLIT, SIZE, STEP = 16384, 8192, 4096


def chunk_lengths(size):
    if size == 0:
        return []
    if size <= SPLIT:
        return [size]
    n = (size - SIZE + STEP - 1) // STEP + 1
    return [min(SIZE, size - i * STEP) for i in range(n)]


def leave_out(chunks, excluded):
    best, censored = None, False
    for c in chunks:
        kept = [n["ncd"] for n in c.get("near", []) if n["group"] not in excluded]
        if kept:
            v, cen = kept[0], False
        else:
            v, cen = (c["near"][-1]["ncd"] if c.get("near") else None), True
        if v is not None and (best is None or v < best):
            best, censored = v, cen
    return best, censored


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--reports", default="reports")
    args = ap.parse_args()
    t = args.test
    os.makedirs(args.out, exist_ok=True)

    v1 = json.load(open(os.path.join(t, "v1_index.json")))
    groups_by_name = collections.defaultdict(set)
    for p in v1.values():
        groups_by_name[p["name"]].add(p["group"])
    manifest = json.load(open(os.path.join(t, "manifest_malware.json"))) + \
        json.load(open(os.path.join(t, "manifest_benign.json")))
    order = [l.strip() for l in open(os.path.join(t, "order.txt")) if l.strip()]
    rank = {d: i for i, d in enumerate(order)}

    pkg_rows, chunk_rows = [], []
    for m in sorted(manifest, key=lambda m: rank.get(m["dir"], 1 << 30)):
        rp = os.path.join(t, args.reports, os.path.basename(m["dir"]) + ".json")
        if not os.path.exists(rp):
            continue
        r = json.load(open(rp, encoding="utf-8"))
        cat = m["category"]
        name_key = m["name"].replace("/", "_")
        same_name = groups_by_name.get(name_key, set())
        own = {m["v1_group"]} if cat == "mal_known" else set()
        identical = set(m.get("files_identical_to_v1", {}))
        novel = {c["file"] for c in r["chunks"] if c["file"] not in identical}
        lno, lno_c = leave_out(r["chunks"], same_name)
        lfo, lfo_c = leave_out(r["chunks"], same_name | own)
        nov = min((c["ncd"] for c in r["chunks"] if c["file"] in novel), default=None)
        match_groups = [c["match"]["file"].split("/")[0] for c in r["chunks"]]
        best_i = min(range(len(r["chunks"])), key=lambda i: r["chunks"][i]["ncd"]) if r["chunks"] else None
        sizes = {}
        root = os.path.join(t, "targets", m["dir"])
        for c in r["chunks"]:
            if c["file"] not in sizes:
                sizes[c["file"]] = chunk_lengths(os.path.getsize(os.path.join(root, c["file"])))
        pkg_rows.append({
            "category": cat,
            "truth": "malicious" if cat.startswith("mal_") else "benign",
            "package": m["name"], "version": m["version"], "published": m.get("date", ""),
            "js_bytes": m["js_bytes"], "files": len(sizes), "chunks": len(r["chunks"]),
            "score": r["score"], "seconds": r.get("seconds"),
            "match_file": r["chunks"][best_i]["match"]["file"] if best_i is not None else "",
            "match_group": match_groups[best_i] if best_i is not None else "",
            "match_same_name": int(best_i is not None and match_groups[best_i] in same_name),
            "match_own_group": int(best_i is not None and match_groups[best_i] in own),
            "score_leave_name_out": lno, "leave_name_out_censored": int(lno_c),
            "score_leave_family_out": lfo, "leave_family_out_censored": int(lfo_c),
            "files_identical_to_v1": len(identical & set(sizes)),
            "score_novel_files": nov,
        })
        for c in r["chunks"]:
            idx = [x["start"] for x in r["chunks"] if x["file"] == c["file"]].index(c["start"])
            near = c.get("near", [])
            chunk_rows.append({
                "category": cat, "package": m["name"], "version": m["version"],
                "file": c["file"], "start": c["start"], "length": sizes[c["file"]][idx],
                "ncd": c["ncd"], "match_file": c["match"]["file"], "match_start": c["match"]["start"],
                "identical_to_v1": int(c["file"] in identical),
                "near_groups": len(near),
                "near2_ncd": near[1]["ncd"] if len(near) > 1 else "",
                "near5_ncd": near[4]["ncd"] if len(near) > 4 else "",
                "near32_ncd": near[31]["ncd"] if len(near) > 31 else "",
            })

    for name, rows in (("packages.csv", pkg_rows), ("chunks.csv", chunk_rows)):
        with open(os.path.join(args.out, name), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
    print("packages", len(pkg_rows), "chunks", len(chunk_rows))


if __name__ == "__main__":
    main()
