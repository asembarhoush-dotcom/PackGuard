import glob
import json
import os
import shutil
import subprocess
import time

HOME = os.path.expanduser("~")
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SCANNER = os.path.join(REPO, "build", "packguard")


def pick(names, count):
    if len(names) <= count:
        return names
    step = len(names) / float(count)
    return [names[int(i * step)] for i in range(count)]


def make_links(source, destination, per_group):
    shutil.rmtree(destination, ignore_errors=True)
    os.makedirs(destination)
    groups = {}
    for name in sorted(os.listdir(source)):
        parts = name.split("__")
        key = "__".join(parts[:2]) if name.startswith("T") else parts[0]
        groups.setdefault(key, []).append(name)
    selected = []
    for key in sorted(groups):
        wanted = per_group.get(key, 0) if isinstance(per_group, dict) else per_group
        selected.extend(pick(groups[key], wanted))
    for name in selected:
        os.symlink(os.path.realpath(os.path.join(source, name)), os.path.join(destination, name))
    print("selected", len(selected), "links in", destination, flush=True)
    return selected


def run_scan(tag, refs, scan, reports):
    shutil.rmtree(reports, ignore_errors=True)
    os.makedirs(reports)
    links = sorted(os.path.join(scan, name) for name in os.listdir(scan))
    command = [SCANNER, "-j", "4", "-p", "256", "-m", "256", "-b", "1",
               "-t", "0.19", "-s", "0.45", "-c", "2", "-n", "1", "-e", "1",
               "-d", reports, refs] + links
    log_path = os.path.join(os.path.dirname(reports), tag + ".log")
    with open(log_path, "wb") as log:
        process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=log)
        started = time.time()
        while process.poll() is None:
            print(tag, "reports", len(glob.glob(os.path.join(reports, "*.json"))),
                  "elapsed", int(time.time() - started), flush=True)
            time.sleep(15)
        print(tag, "exit", process.returncode, "elapsed", int(time.time() - started), flush=True)
    return process.returncode


def load_report(folder, name):
    try:
        with open(os.path.join(folder, name + ".json"), encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def score(report):
    return report.get("score") if report else None


def report_v4(names, baseline, current):
    rows = {}
    for name in names:
        parts = name.split("__", 2)
        if len(parts) != 3:
            continue
        key = (parts[0], parts[1])
        rows.setdefault(key, []).append(
            (score(load_report(baseline, name)), score(load_report(current, name))))
    print("\nV4 SUBSET (baseline v4c2 -> new stub filter)", flush=True)
    print("%-4s %-12s %4s %10s %10s %10s %10s" % (
        "tier", "category", "n", "base.19", "new.19", "base.30", "new.30"), flush=True)
    for (tier, category), values in sorted(rows.items()):
        n = len(values)
        b19 = sum(b is not None and b <= 0.19 for b, w in values)
        w19 = sum(w is not None and w <= 0.19 for b, w in values)
        b30 = sum(b is not None and b <= 0.30 for b, w in values)
        w30 = sum(w is not None and w <= 0.30 for b, w in values)
        print("%-4s %-12s %4d %9.1f%% %9.1f%% %9.1f%% %9.1f%%" % (
            tier, category, n, 100.0 * b19 / n, 100.0 * w19 / n,
            100.0 * b30 / n, 100.0 * w30 / n), flush=True)
    for tier in ("T1", "T2", "T3", "T4"):
        mal = [(b, w) for (t, c), values in rows.items() if t == tier and c.startswith("mal")
               for b, w in values]
        ben = [(b, w) for (t, c), values in rows.items() if t == tier and c.startswith("ben")
               for b, w in values]
        if not mal and not ben:
            continue
        print("%s overall: mal %d/%d -> %d/%d at .19; benign %d/%d -> %d/%d at .19" % (
            tier,
            sum(b is not None and b <= 0.19 for b, w in mal), len(mal),
            sum(w is not None and w <= 0.19 for b, w in mal), len(mal),
            sum(b is not None and b <= 0.19 for b, w in ben), len(ben),
            sum(w is not None and w <= 0.19 for b, w in ben), len(ben)), flush=True)
    exact_b = sum(1 for name in names if (load_report(baseline, name) or {}).get("score_normalized") == 0)
    exact_w = sum(1 for name in names if (load_report(current, name) or {}).get("score_normalized") == 0)
    print("normalised exact-zero: baseline %d -> new %d" % (exact_b, exact_w), flush=True)


def report_newcamp(names, baseline, current):
    rows = {}
    for name in names:
        category = name.split("__", 1)[0]
        rows.setdefault(category, []).append(
            (score(load_report(baseline, name)), score(load_report(current, name))))
    print("\nNEW-CAMPAIGN SUBSET (baseline newcamp-v4c2 -> new stub filter)", flush=True)
    print("%-12s %4s %10s %10s %10s %10s %10s" % (
        "category", "n", "base.19", "new.19", "base.30", "new.30", "new FA"), flush=True)
    for category in sorted(rows):
        values = rows[category]
        n = len(values)
        b19 = sum(b is not None and b <= 0.19 for b, w in values)
        w19 = sum(w is not None and w <= 0.19 for b, w in values)
        b30 = sum(b is not None and b <= 0.30 for b, w in values)
        w30 = sum(w is not None and w <= 0.30 for b, w in values)
        print("%-12s %4d %9.1f%% %9.1f%% %9.1f%% %9.1f%% %10d" % (
            category, n, 100.0 * b19 / n, 100.0 * w19 / n,
            100.0 * b30 / n, 100.0 * w30 / n, w19), flush=True)
    mal = [(b, w) for c, values in rows.items() if c.startswith("mal") for b, w in values]
    ben = [(b, w) for c, values in rows.items() if c.startswith("ben") for b, w in values]
    for threshold in (0.19, 0.30, 0.50):
        print("all: baseline %d/%d -> new %d/%d at %.2f; benign baseline %d/%d -> new %d/%d" % (
            sum(b is not None and b <= threshold for b, w in mal), len(mal),
            sum(w is not None and w <= threshold for b, w in mal), len(mal), threshold,
            sum(b is not None and b <= threshold for b, w in ben), len(ben),
            sum(w is not None and w <= threshold for b, w in ben), len(ben)), flush=True)


def main():
    v4_source = os.path.join(HOME, "pg-v4", "scan")
    v4_scan = os.path.join(HOME, "pg-v4-subset", "scan")
    v4_reports = os.path.join(HOME, "pg-v4-subset", "reports")
    v4_names = make_links(v4_source, v4_scan, 10)
    run_scan("v4-subset", os.path.join(HOME, "packguard-data", "v1", "malware_js"),
             v4_scan, v4_reports)
    report_v4(v4_names, os.path.join(HOME, "pg-v4", "reports", "v4c2"), v4_reports)

    v2_source = os.path.join(HOME, "pg-v2", "scan")
    v2_scan = os.path.join(HOME, "pg-v2-subset", "scan")
    v2_reports = os.path.join(HOME, "pg-v2-subset", "reports")
    v2_names = make_links(v2_source, v2_scan, {
        "mal_shape": 75, "mal_stream": 50, "ben_general": 100, "ben_scripts": 16})
    run_scan("newcamp-subset", os.path.join(HOME, "pg-v2", "refs", "s1_n3_latest"),
             v2_scan, v2_reports)
    report_newcamp(v2_names, os.path.join(HOME, "pg-v2", "reports", "newcamp-v4c2"), v2_reports)


if __name__ == "__main__":
    main()
