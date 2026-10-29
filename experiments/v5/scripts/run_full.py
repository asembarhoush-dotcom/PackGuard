import glob
import json
import os
import shutil
import subprocess
import time

HOME = os.path.expanduser("~")
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SCANNER = os.path.join(REPO, "build", "packguard")

JOBS = [
    {
        "tag": "known-v4",
        "mode": "known",
        "scan": os.path.join(HOME, "pg-v4", "scan"),
        "refs": os.path.join(HOME, "packguard-data", "v1", "malware_js"),
        "baseline": os.path.join(HOME, "pg-v4", "reports", "v4c2"),
        "kind": "v4",
        "primitives": 0,
    },
    {
        "tag": "new-v4",
        "mode": "new",
        "scan": os.path.join(HOME, "pg-v4", "scan"),
        "refs": os.path.join(HOME, "packguard-data", "v1", "malware_js"),
        "baseline": os.path.join(HOME, "pg-v4", "reports", "v4c2"),
        "kind": "v4",
        "primitives": 1,
    },
    {
        "tag": "known-newcamp",
        "mode": "known",
        "scan": os.path.join(HOME, "pg-v2", "scan"),
        "refs": os.path.join(HOME, "pg-v2", "refs", "s1_n3_latest"),
        "baseline": os.path.join(HOME, "pg-v2", "reports", "newcamp-v4c2"),
        "kind": "newcamp",
        "primitives": 0,
    },
    {
        "tag": "new-newcamp",
        "mode": "new",
        "scan": os.path.join(HOME, "pg-v2", "scan"),
        "refs": os.path.join(HOME, "pg-v2", "refs", "s1_n3_latest"),
        "baseline": os.path.join(HOME, "pg-v2", "reports", "newcamp-v4c2"),
        "kind": "newcamp",
        "primitives": 1,
    },
]


def run(job):
    reports = os.path.join(HOME, "pg-v5", job["tag"])
    shutil.rmtree(reports, ignore_errors=True)
    os.makedirs(reports)
    links = sorted(os.path.join(job["scan"], name) for name in os.listdir(job["scan"]))
    command = [SCANNER, "--mode", job["mode"], "-j", "4", "-p", "256",
               "-m", "256", "-d", reports, job["refs"]] + links
    log_path = os.path.join(HOME, "pg-v5", job["tag"] + ".log")
    with open(log_path, "wb") as log:
        process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=log)
        started = time.time()
        while process.poll() is None:
            print(job["tag"], "reports",
                  len(glob.glob(os.path.join(reports, "*.json"))),
                  "elapsed", int(time.time() - started), flush=True)
            time.sleep(15)
        print(job["tag"], "exit", process.returncode,
              "elapsed", int(time.time() - started), flush=True)
    return reports


def load(folder):
    out = {}
    for path in glob.glob(os.path.join(folder, "*.json")):
        name = os.path.basename(path)[:-5]
        if name.endswith(".run"):
            continue
        try:
            with open(path, encoding="utf-8") as handle:
                out[name] = json.load(handle)
        except (OSError, ValueError):
            pass
    return out


def flagged(report, threshold, use_primitives):
    if report is None:
        return False
    score = report.get("score")
    if score is not None and score <= threshold:
        return True
    return bool(use_primitives and report.get("primitive_flagged"))


def split_v4(reports):
    groups = {}
    for name, report in reports.items():
        parts = name.split("__", 2)
        if len(parts) != 3:
            continue
        groups.setdefault((parts[0], parts[1]), []).append((name, report))
    return groups


def split_newcamp(reports):
    groups = {}
    for name, report in reports.items():
        groups.setdefault(name.split("__", 1)[0], []).append((name, report))
    return groups


def v4_table(title, reports, baseline, use_primitives):
    groups = split_v4(reports)
    base_groups = split_v4(baseline)
    print("\n" + title, flush=True)
    print("%-4s %-12s %4s %17s %17s %17s" % (
        "tier", "category", "n", "new .19/.30/.50", "base .19/.30/.50", "benign new"), flush=True)
    for key in sorted(groups):
        rows = groups[key]
        base_rows = base_groups.get(key, [])
        counts = []
        for threshold in (0.19, 0.30, 0.50):
            counts.append(sum(flagged(report, threshold, use_primitives) for _, report in rows))
        base_counts = []
        for threshold in (0.19, 0.30, 0.50):
            base_counts.append(sum(flagged(report, threshold, 0) for _, report in base_rows))
        print("%-4s %-12s %4d %5d/%2d/%2d %17s %17s" % (
            key[0], key[1], len(rows), counts[0], counts[1], counts[2],
            "%d/%d/%d" % tuple(base_counts),
            "%d/%d/%d" % (counts[0], counts[1], counts[2])
            if key[1].startswith("ben") else "-"), flush=True)
    for tier in ("T1", "T2", "T3", "T4"):
        mal = [(n, r) for (t, c), rows in groups.items() if t == tier and c.startswith("mal")
               for n, r in rows]
        ben = [(n, r) for (t, c), rows in groups.items() if t == tier and c.startswith("ben")
               for n, r in rows]
        if not mal and not ben:
            continue
        print("%s overall: mal %d/%d -> %d/%d -> %d/%d at .19/.30/.50; benign %d/%d -> %d/%d -> %d/%d" % (
            tier,
            sum(flagged(r, 0.19, use_primitives) for _, r in mal), len(mal),
            sum(flagged(r, 0.30, use_primitives) for _, r in mal), len(mal),
            sum(flagged(r, 0.50, use_primitives) for _, r in mal), len(mal),
            sum(flagged(r, 0.19, use_primitives) for _, r in ben), len(ben),
            sum(flagged(r, 0.30, use_primitives) for _, r in ben), len(ben),
            sum(flagged(r, 0.50, use_primitives) for _, r in ben), len(ben)), flush=True)


def newcamp_table(title, reports, baseline, use_primitives):
    groups = split_newcamp(reports)
    base_groups = split_newcamp(baseline)
    print("\n" + title, flush=True)
    print("%-12s %4s %20s %20s %10s" % (
        "category", "n", "new .19/.30/.50", "base .19/.30/.50", "prim-only .19"), flush=True)
    for key in sorted(groups):
        rows = groups[key]
        base_rows = base_groups.get(key, [])
        counts = [sum(flagged(r, t, use_primitives) for _, r in rows) for t in (0.19, 0.30, 0.50)]
        base_counts = [sum(flagged(r, t, 0) for _, r in base_rows) for t in (0.19, 0.30, 0.50)]
        prim_only = sum(bool(r.get("primitive_flagged"))
                        and not (r.get("score") is not None and r["score"] <= 0.19)
                        for _, r in rows)
        print("%-12s %4d %20s %20s %10d" % (
            key, len(rows), "%d/%d/%d" % tuple(counts), "%d/%d/%d" % tuple(base_counts),
            prim_only), flush=True)
    mal = [(n, r) for c, rows in groups.items() if c.startswith("mal") for n, r in rows]
    ben = [(n, r) for c, rows in groups.items() if c.startswith("ben") for n, r in rows]
    for threshold in (0.19, 0.30, 0.50):
        print("all at %.2f: malware %d/%d, benign %d/%d; primitive-flagged %d" % (
            threshold,
            sum(flagged(r, threshold, use_primitives) for _, r in mal), len(mal),
            sum(flagged(r, threshold, use_primitives) for _, r in ben), len(ben),
            sum(bool(r.get("primitive_flagged")) for _, r in mal)), flush=True)


def main():
    os.makedirs(os.path.join(HOME, "pg-v5"), exist_ok=True)
    results = {}
    for job in JOBS:
        results[job["tag"]] = run(job)
    for job in JOBS:
        reports = load(results[job["tag"]])
        baseline = load(job["baseline"])
        use_primitives = bool(job["primitives"])
        if job["kind"] == "v4":
            v4_table(job["tag"].upper(), reports, baseline, use_primitives)
        else:
            newcamp_table(job["tag"].upper(), reports, baseline, use_primitives)


if __name__ == "__main__":
    main()
