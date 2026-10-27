import argparse
import json
import os
import re
import subprocess
import sys
import time

MODES = {
    "v3": ["-c", "0", "-n", "0"],
    "v4": ["-c", "1", "-n", "1", "-e", "1"],
    "v4c2": ["-c", "2", "-n", "1", "-e", "1"],
}


def scan_links(work, limit):
    """Returns the sorted scan links, optionally limited."""
    scan = os.path.join(os.path.expanduser(work), "scan")
    links = sorted(os.path.join(scan, name) for name in os.listdir(scan))
    return links[:limit] if limit else links


def run(args, mode, targets):
    """Runs one scanner mode and writes its reports, log and run file."""
    work = os.path.expanduser(args.work)
    refs = os.path.expanduser(args.refs)
    tag = args.tag or mode
    reports = os.path.join(work, "reports", tag)
    os.makedirs(reports, exist_ok=True)
    log = os.path.join(work, "reports", tag + ".log")
    flags = ["-j", str(args.threads), "-p", str(args.candidates),
             "-m", str(args.min_js), "-b", "1",
             "-t", str(args.js_threshold), "-s", str(args.script_threshold)]
    cmd = [args.packguard] + flags + MODES[mode] + ["-d", reports, refs] + targets
    started = time.time()
    with open(log, "wb") as err:
        process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=err)
        _, status, usage = os.wait4(process.pid, 0)
    wall = time.time() - started
    text = open(log, encoding="utf-8", errors="replace").read()
    first = text.splitlines()[0] if text else ""
    match = re.search(r"(\d+) reference files, (\d+) chunks, (\d+) distinct"
                      r"(?: \((\d+) boilerplate dropped\))?, (\d+) packages, loaded in ([\d.]+) s", first)
    norm = re.search(r"normalised view: (\d+) reference files, (\d+) chunks, (\d+) distinct, "
                     r"(\d+) packages, loaded in ([\d.]+) s", text)
    info = {
        "tag": tag,
        "mode": mode,
        "refs": refs,
        "ref_files": int(match.group(1)) if match else None,
        "ref_chunks": int(match.group(2)) if match else None,
        "ref_distinct": int(match.group(3)) if match else None,
        "boilerplate_dropped": int(match.group(4)) if match and match.group(4) else 0,
        "ref_packages": int(match.group(5)) if match else None,
        "load_seconds": float(match.group(6)) if match else None,
        "norm_ref_files": int(norm.group(1)) if norm else None,
        "norm_ref_chunks": int(norm.group(2)) if norm else None,
        "norm_ref_distinct": int(norm.group(3)) if norm else None,
        "norm_ref_packages": int(norm.group(4)) if norm else None,
        "norm_load_seconds": float(norm.group(5)) if norm else None,
        "wall_seconds": round(wall, 1),
        "max_rss_mib": round(usage.ru_maxrss / 1024),
        "targets": len(targets),
        "threads": args.threads,
        "candidates": args.candidates,
        "js_threshold": args.js_threshold,
        "script_threshold": args.script_threshold,
        "exit": os.waitstatus_to_exitcode(status),
        "packguard": args.packguard,
    }
    with open(os.path.join(work, "reports", tag + ".run.json"), "w", encoding="utf-8") as handle:
        json.dump(info, handle, indent=1)
    print(json.dumps(info), flush=True)
    if info["exit"] != 0:
        raise SystemExit("packguard exited with %d; see %s" % (info["exit"], log))
    return info


def main():
    """Parses arguments and runs the requested scanner mode."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", default=os.path.expanduser("~/pg-v4"))
    parser.add_argument("--refs", default=os.path.expanduser("~/packguard-data/v1/malware_js"))
    parser.add_argument("--packguard", default=os.path.join(os.getcwd(), "build", "packguard"))
    parser.add_argument("--mode", choices=sorted(MODES), required=True)
    parser.add_argument("--tag", default=None)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--candidates", type=int, default=256)
    parser.add_argument("--min-js", type=int, default=256)
    parser.add_argument("--js-threshold", type=float, default=0.19)
    parser.add_argument("--script-threshold", type=float, default=0.45)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    targets = scan_links(args.work, args.limit)
    print("mode", args.mode, "targets", len(targets), flush=True)
    run(args, args.mode, targets)


if __name__ == "__main__":
    sys.exit(main())
