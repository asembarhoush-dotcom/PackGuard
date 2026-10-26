import argparse, json, os, re, subprocess, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_dataset import materialize, select

CONFIGS = {
    "s1_n3": dict(shape_cap=1, name_cap=3),
    "s2_n3": dict(shape_cap=2, name_cap=3),
    "s3_n3": dict(shape_cap=3, name_cap=3),
    "s5_n3": dict(shape_cap=5, name_cap=3),
    "s10_n3": dict(shape_cap=10, name_cap=3),
    "s0_n3": dict(shape_cap=0, name_cap=3),
    "s3_n0": dict(shape_cap=3, name_cap=0),
    "s0_n0": dict(shape_cap=0, name_cap=0),
    "s3_n3_latest": dict(shape_cap=3, name_cap=3, order="latest"),
    "s1_n3_latest": dict(shape_cap=1, name_cap=3, order="latest"),
    "s3_n3_noscripts": dict(shape_cap=3, name_cap=3, scripts=False),
}


def scan_dir(work):
    """Links every target as <category>__<package> in one folder, so that
    reports of packages that appear in two categories don't collide."""
    scan = os.path.join(work, "scan")
    os.makedirs(scan, exist_ok=True)
    for name in os.listdir(scan):
        os.unlink(os.path.join(scan, name))
    targets = os.path.join(work, "targets")
    out = []
    for cat in sorted(os.listdir(targets)):
        for pkg in sorted(os.listdir(os.path.join(targets, cat))):
            link = os.path.join(scan, f"{cat}__{pkg}")
            os.symlink(os.path.join(targets, cat, pkg), link)
            out.append(link)
    return out


def run(args, name, cfg, recs, targets):
    refs = os.path.join(args.work, "refs", name)
    kept = select(recs, cfg["shape_cap"], cfg["name_cap"], cfg.get("order", "earliest"),
                  before=args.since, scripts=cfg.get("scripts", True))
    ids = [f"{r['shape']}/{r['name']}@{r['version']}" for r in kept]
    list_path = refs + ".list.json"
    if not (os.path.exists(list_path) and json.load(open(list_path)) == ids):
        total = materialize(args.datadog, kept, refs, scripts=cfg.get("scripts", True))
        json.dump(ids, open(list_path, "w"))
        print(name, "references", len(kept), f"{total / 2**20:.1f} MiB", flush=True)

    reports = os.path.join(args.work, "reports", name)
    os.makedirs(reports, exist_ok=True)
    log = os.path.join(args.work, "reports", name + ".log")
    t0 = time.time()
    with open(log, "wb") as err:
        p = subprocess.Popen([args.packguard, "-j", str(args.threads), "-d", reports, refs] + targets,
                             stdout=subprocess.DEVNULL, stderr=err)
        _, status, usage = os.wait4(p.pid, 0)
    wall = time.time() - t0
    head = open(log, encoding="utf-8", errors="replace").readline()
    m = re.search(r"(\d+) reference files, (\d+) chunks, (\d+) distinct, (\d+) packages, loaded in ([\d.]+) s", head)
    info = {"config": name, **{k: v for k, v in cfg.items()}, "ref_packages": len(kept),
            "ref_shapes": len({r["shape"] for r in kept}),
            "ref_files": int(m.group(1)) if m else None, "ref_chunks": int(m.group(2)) if m else None,
            "ref_distinct": int(m.group(3)) if m else None, "load_seconds": float(m.group(5)) if m else None,
            "wall_seconds": round(wall, 1), "max_rss_mib": round(usage.ru_maxrss / 1024),
            "exit": os.waitstatus_to_exitcode(status), "threads": args.threads}
    json.dump(info, open(os.path.join(args.work, "reports", name + ".run.json"), "w"), indent=1)
    print(json.dumps(info), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--datadog", required=True)
    ap.add_argument("--index", required=True)
    ap.add_argument("--packguard", required=True)
    ap.add_argument("--since", default="2026-04-01")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("configs", nargs="*")
    args = ap.parse_args()
    recs = json.load(open(args.index))
    targets = scan_dir(args.work)
    print("targets", len(targets), flush=True)
    for name in args.configs or CONFIGS:
        run(args, name, CONFIGS[name], recs, targets)


if __name__ == "__main__":
    main()
