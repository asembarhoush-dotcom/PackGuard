import argparse
import json
import os
import re
import subprocess
import sys
import time

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                 "..", "..", "v2", "scripts")))
from build_dataset import materialize, select

CONFIGS = {"s1_n3_latest": dict(shape_cap=1, name_cap=3, order="latest")}
EXPECTED = {"mal_shape": 300, "mal_stream": 200, "ben_general": 400, "ben_scripts": 64}
DEFAULT_CANDIDATES = 256
DEFAULT_THREADS = 4
DEFAULT_SINCE = "2026-04-01"


def scan_dir(work):
    """Links every target as <category>__<package> in one folder and returns
    the link paths, so reports of packages in two categories never collide."""
    scan = os.path.join(work, "scan")
    os.makedirs(scan, exist_ok=True)
    for name in os.listdir(scan):
        os.unlink(os.path.join(scan, name))
    targets = os.path.join(work, "targets")
    out = []
    counts = {}
    for cat in sorted(os.listdir(targets)):
        for pkg in sorted(os.listdir(os.path.join(targets, cat))):
            link = os.path.join(scan, f"{cat}__{pkg}")
            os.symlink(os.path.join(targets, cat, pkg), link)
            out.append(link)
            counts[cat] = counts.get(cat, 0) + 1
    for cat, expected in EXPECTED.items():
        if counts.get(cat) != expected:
            raise SystemExit(f"{cat}: {counts.get(cat)} targets, expected {expected}")
    return out


def ensure_references(args, name, cfg, recs):
    """Materializes the pinned reference set for name unless its cached list
    matches the packages select() picks now."""
    refs = os.path.join(args.work, "refs", name)
    kept = select(recs, cfg["shape_cap"], cfg["name_cap"], cfg.get("order", "earliest"),
                  before=args.since, scripts=cfg.get("scripts", True))
    ids = [f"{r['shape']}/{r['name']}@{r['version']}" for r in kept]
    list_path = refs + ".list.json"
    if not (os.path.exists(list_path) and json.load(open(list_path)) == ids):
        total = materialize(args.datadog, kept, refs, scripts=cfg.get("scripts", True))
        json.dump(ids, open(list_path, "w"))
        print(name, "references", len(kept), f"{total / 2**20:.1f} MiB", flush=True)
    return refs, kept


def scanner_args(args):
    """Returns the optional scanner options this run asks for, in an order
    that keeps the pinned -j and -p first."""
    extra = ["-j", str(args.threads), "-p", str(args.candidates)]
    if args.js_threshold is not None:
        extra += ["-t", str(args.js_threshold)]
    if args.script_threshold is not None:
        extra += ["-s", str(args.script_threshold)]
    if args.min_js is not None:
        extra += ["-m", str(args.min_js)]
    if args.no_boilerplate:
        extra += ["-b", "0"]
    for arg in args.scanner_arg:
        extra.append(arg)
    return extra


def run(args, name, cfg, recs, targets):
    """Scans every target with the pinned config and writes reports/<tag>
    plus reports/<tag>.run.json."""
    refs, kept = ensure_references(args, name, cfg, recs)
    reports = os.path.join(args.work, "reports", args.tag)
    os.makedirs(reports, exist_ok=True)
    log = os.path.join(args.work, "reports", args.tag + ".log")
    cmd = [args.packguard] + scanner_args(args) + ["-d", reports, refs] + targets
    t0 = time.time()
    with open(log, "wb") as err:
        p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=err)
        _, status, usage = os.wait4(p.pid, 0)
    wall = time.time() - t0
    head = open(log, encoding="utf-8", errors="replace").readline()
    m = re.search(r"(\d+) reference files, (\d+) chunks, (\d+) distinct"
                  r"(?: \((\d+) boilerplate dropped\))?, (\d+) packages, loaded in ([\d.]+) s", head)
    info = {"tag": args.tag, "config": name, **cfg, "ref_packages": len(kept),
            "ref_shapes": len({r["shape"] for r in kept}),
            "ref_files": int(m.group(1)) if m else None, "ref_chunks": int(m.group(2)) if m else None,
            "ref_distinct": int(m.group(3)) if m else None,
            "boilerplate_dropped": int(m.group(4)) if m and m.group(4) else 0,
            "load_seconds": float(m.group(6)) if m else None,
            "wall_seconds": round(wall, 1), "max_rss_mib": round(usage.ru_maxrss / 1024),
            "exit": os.waitstatus_to_exitcode(status), "threads": args.threads,
            "candidates": args.candidates, "min_js": args.min_js,
            "js_threshold": args.js_threshold, "script_threshold": args.script_threshold,
            "no_boilerplate": args.no_boilerplate, "scanner_args": args.scanner_arg,
            "packguard": args.packguard, "targets": len(targets)}
    json.dump(info, open(os.path.join(args.work, "reports", args.tag + ".run.json"), "w"), indent=1)
    print(json.dumps(info), flush=True)
    if info["exit"] != 0:
        raise SystemExit(f"packguard exited with {info['exit']}; see {log}")


def main():
    """Builds the pinned v2 sets once, then scans them under one tag."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default=os.path.expanduser("~/pg-v2"))
    ap.add_argument("--datadog", default=os.path.expanduser("~/packguard-data/datadog"))
    ap.add_argument("--index", default=None)
    ap.add_argument("--packguard", required=True)
    ap.add_argument("--tag", default="v3-baseline")
    ap.add_argument("--config", default="s1_n3_latest", choices=sorted(CONFIGS))
    ap.add_argument("--since", default=DEFAULT_SINCE)
    ap.add_argument("--threads", type=int, default=DEFAULT_THREADS)
    ap.add_argument("--candidates", type=int, default=DEFAULT_CANDIDATES)
    ap.add_argument("--min-js", type=int, default=None)
    ap.add_argument("--js-threshold", type=float, default=None)
    ap.add_argument("--script-threshold", type=float, default=None)
    ap.add_argument("--no-boilerplate", action="store_true")
    ap.add_argument("--scanner-arg", action="append", default=[])
    args = ap.parse_args()
    args.index = args.index or os.path.join(args.work, "index.json")
    recs = json.load(open(args.index))
    targets = scan_dir(args.work)
    print("targets", len(targets), flush=True)
    run(args, args.config, CONFIGS[args.config], recs, targets)


if __name__ == "__main__":
    main()
