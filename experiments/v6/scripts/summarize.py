import argparse
import collections
import glob
import json
import os
import re

TIERS = ("T1", "T2", "T3", "T4")


def run_stats(log_path):
    """Returns wall time, peak memory and load times parsed from a scanner log written under /usr/bin/time -v."""
    out = {}
    if not os.path.exists(log_path):
        return out
    text = open(log_path, encoding="utf-8", errors="replace").read()
    m = re.search(r"Elapsed \(wall clock\) time \(h:mm:ss or m:ss\): ([\d:.]+)", text)
    if m:
        parts = [float(x) for x in m.group(1).split(":")]
        out["wall_seconds"] = sum(v * 60 ** (len(parts) - 1 - i) for i, v in enumerate(parts))
    m = re.search(r"Maximum resident set size \(kbytes\): (\d+)", text)
    if m:
        out["peak_mib"] = int(m.group(1)) / 1024
    loads = [float(x) for x in re.findall(r"loaded in ([\d.]+) s", text)]
    if loads:
        out["load_seconds"] = sum(loads)
    return out


def main():
    """Summarises stage-1 reports by the scanner's own flagged field: recall per tier, false alarms and time."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--reports", required=True)
    ap.add_argument("--log", default="")
    ap.add_argument("--out", default="")
    args = ap.parse_args()
    counts = collections.defaultdict(lambda: [0, 0])
    seconds = 0.0
    for path in sorted(glob.glob(os.path.join(os.path.expanduser(args.reports), "*.json"))):
        name = os.path.basename(path)[:-5]
        parts = name.split("__", 2)
        tier, cat = (parts[0], parts[1]) if parts[0] in TIERS else ("ALL", parts[0])
        r = json.load(open(path, encoding="utf-8"))
        hit = bool(r.get("flagged"))
        seconds += r.get("seconds") or 0.0
        label = "mal" if cat.startswith("mal") else "ben"
        for key in {(tier, cat), (tier, label), ("ALL", label), ("ALL", cat)}:
            counts[key][0] += hit
            counts[key][1] += 1
    summary = {"%s/%s" % k: {"flagged": v[0], "total": v[1], "rate": v[0] / v[1]} for k, v in sorted(counts.items())}
    for k, v in summary.items():
        print("%-20s %4d/%4d  %5.1f%%" % (k, v["flagged"], v["total"], 100 * v["rate"]))
    stats = run_stats(os.path.expanduser(args.log)) if args.log else {}
    stats["scan_seconds_sum"] = seconds
    print(json.dumps(stats))
    if args.out:
        json.dump({"summary": summary, "run": stats}, open(os.path.expanduser(args.out), "w"), indent=1)


if __name__ == "__main__":
    main()
