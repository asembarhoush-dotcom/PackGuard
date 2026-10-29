import argparse
import glob
import itertools
import json
import os

TIERS = ("T1", "T2", "T3", "T4")
GOAL = {"T1": 0.95, "T2": 0.94, "T3": 0.91, "T4": 0.94}
MAX_FPR = 0.05


def load(report_dir):
    """Reads every report into a compact record: tier, category, raw chunks and normalised chunks."""
    rows = []
    for path in sorted(glob.glob(os.path.join(os.path.expanduser(report_dir), "*.json"))):
        tier, cat, pkg = os.path.basename(path)[:-5].split("__", 2)
        r = json.load(open(path, encoding="utf-8"))
        raw = [(c.get("kind"), bool(c.get("ignored")), c["ncd"], c.get("benign_ncd"), len(c.get("text", "")))
               for c in r["chunks"] if c["ncd"] is not None]
        norm = [(c["length"], c["ncd"], c.get("benign_ncd"), "#payload" in c["file"])
                for c in r.get("normalized_chunks", []) if c["ncd"] is not None]
        rows.append({"tier": tier, "cat": cat, "pkg": pkg, "mal": cat.startswith("mal"), "raw": raw,
                     "norm": norm, "score": r.get("score")})
    return rows


def ok_margin(m, b, margin, ratio=1.0):
    """Returns True when malware distance m is below benign distance b minus margin and below ratio * b (no benign: True)."""
    return b is None or (m + margin < b and m < ratio * b)


def flagged(row, p):
    """Applies the stage-1 rule with parameters p to one record."""
    for kind, ignored, m, b, _ in row["raw"]:
        if ignored:
            continue
        if kind == "install_script":
            if m <= p["s"]:
                return True
        elif m <= p["t"] and ok_margin(m, b, p["g"], p.get("gr", 1.0)):
            return True
    for length, m, b, _ in row["norm"]:
        limit = p["u"] if length >= p["L"] else p["us"]
        if m <= limit and ok_margin(m, b, p["G"], p.get("Gr", 1.0)):
            return True
    return False


def evaluate(rows, p):
    """Returns per-tier recall, per-tier and overall benign false-alarm rates for parameters p."""
    out = {}
    fp = n_ben = 0
    for t in TIERS:
        mal = [r for r in rows if r["tier"] == t and r["mal"]]
        ben = [r for r in rows if r["tier"] == t and not r["mal"]]
        out[t] = sum(flagged(r, p) for r in mal) / max(1, len(mal))
        f = sum(flagged(r, p) for r in ben)
        out["FPR_" + t] = f / max(1, len(ben))
        fp += f
        n_ben += len(ben)
    out["FPR"] = fp / max(1, n_ben)
    return out


def slack(o):
    """Returns the smallest margin by which the result meets the goal (negative when it misses)."""
    return min([o[t] - GOAL[t] for t in TIERS] + [MAX_FPR - o["FPR"]])


def fmt(o):
    """Formats one evaluation as a single line."""
    return " ".join("%s=%.1f" % (k, v * 100) for k, v in o.items() if not k.startswith("FPR_")) + \
        "  per-tier FPR " + "/".join("%.1f" % (o["FPR_" + t] * 100) for t in TIERS)


def main():
    """Grid-searches the stage-1 rule on validation reports and prints the best settings."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--reports", required=True)
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--eval", default="")
    ap.add_argument("--out", default="")
    args = ap.parse_args()
    rows = load(args.reports)
    print("targets", len(rows), "malware", sum(r["mal"] for r in rows))
    if args.eval:
        p = json.loads(args.eval)
        print(fmt(evaluate(rows, p)))
        table = []
        for t in TIERS:
            for cat in sorted({r["cat"] for r in rows}):
                sel = [r for r in rows if r["tier"] == t and r["cat"] == cat]
                hit = sum(flagged(r, p) for r in sel)
                table.append({"tier": t, "category": cat, "flagged": hit, "total": len(sel)})
                print("%s %-13s %3d/%3d" % (t, cat, hit, len(sel)))
        for cat in sorted({r["cat"] for r in rows}):
            sel = [r for r in rows if r["cat"] == cat]
            print("ALL %-13s %3d/%3d" % (cat, sum(flagged(r, p) for r in sel), len(sel)))
        misses = [r for r in rows if r["mal"] and not flagged(r, p)]
        alarms = [r for r in rows if not r["mal"] and flagged(r, p)]
        print("missed:", " ".join("%s/%s" % (r["tier"], r["pkg"]) for r in misses))
        print("false alarms:", " ".join("%s/%s" % (r["tier"], r["pkg"]) for r in alarms))
        if args.out:
            json.dump({"params": p, "summary": evaluate(rows, p), "table": table,
                       "missed": ["%s/%s/%s" % (r["tier"], r["cat"], r["pkg"]) for r in misses],
                       "false_alarms": ["%s/%s/%s" % (r["tier"], r["cat"], r["pkg"]) for r in alarms]},
                      open(os.path.expanduser(args.out), "w"), indent=1)
        return
    grid = {
        "t": [0.50, 0.55, 0.60, 0.65, 0.70],
        "s": [0.50],
        "u": [0.50, 0.55, 0.60, 0.65, 0.70],
        "us": [0.0, 0.20],
        "L": [0, 64],
        "g": [0.0, 0.05, 0.10],
        "gr": [1.0, 0.9],
        "G": [0.0, 0.05, 0.10],
        "Gr": [1.0, 0.95, 0.9],
    }
    results = []
    keys = list(grid)
    for values in itertools.product(*(grid[k] for k in keys)):
        p = dict(zip(keys, values))
        if p["L"] == 0 and p["us"] != 0.0:
            continue
        o = evaluate(rows, p)
        recall = sum(o[t] for t in TIERS) / len(TIERS)
        results.append((slack(o), recall - 2 * o["FPR"], o, p))
    results.sort(key=lambda x: (-x[0], -x[1]))
    results = [(s, o, p) for s, _, o, p in results]
    for s, o, p in results[:args.top]:
        print("%.3f" % s, json.dumps(p), fmt(o))


if __name__ == "__main__":
    main()
