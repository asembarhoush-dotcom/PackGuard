import argparse
import hashlib
import io
import json
import os
import random
import re
import shutil
import tarfile

JS_EXT = (".js", ".cjs", ".mjs")
VAL_LIMIT = 32 * 1024


def js_members(path, max_file):
    """Returns [(relative path, bytes)] for the JavaScript files of an npm tarball outside node_modules."""
    out = []
    try:
        with tarfile.open(path, mode="r:gz") as t:
            for m in t.getmembers():
                if not m.isfile() or "/" not in m.name or not m.name.endswith(JS_EXT):
                    continue
                rel = m.name.split("/", 1)[1]
                parts = rel.split("/")
                if rel.startswith("/") or ".." in parts or "node_modules" in parts:
                    continue
                if m.size == 0 or m.size > max_file:
                    continue
                out.append((rel, t.extractfile(m).read()))
    except Exception:
        return None
    return sorted(out)


def ws_key(data):
    """Returns the whitespace-insensitive content hash used to drop repeated files."""
    return hashlib.sha256(re.sub(rb"\s+", b"", data)).hexdigest()


def write_package(base, row, files):
    """Writes files under base/<name>@<version>/ with '/' in paths turned into '__'."""
    d = os.path.join(base, "%s@%s" % (row["name"].replace("/", "_"), row["version"]))
    os.makedirs(d, exist_ok=True)
    for rel, data in files:
        with open(os.path.join(d, rel.replace("/", "__")), "wb") as f:
            f.write(data)
    return d


def main():
    """Splits the raw benign corpus into a validation set and a benign reference set, disjoint by name."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="~/packguard-data/raw/npm")
    ap.add_argument("--refs", default="~/packguard-data/v6/benign_refs")
    ap.add_argument("--val", default="~/pg-v6/val/source")
    ap.add_argument("--val-popular", type=int, default=60)
    ap.add_argument("--val-longtail", type=int, default=60)
    ap.add_argument("--max-file", type=int, default=64 * 1024)
    ap.add_argument("--max-package", type=int, default=128 * 1024)
    ap.add_argument("--seed", type=int, default=20261029)
    args = ap.parse_args()
    raw = os.path.expanduser(args.raw)
    refs = os.path.expanduser(args.refs)
    val = os.path.expanduser(args.val)
    index = json.load(open(os.path.join(raw, "index.json")))
    rng = random.Random(args.seed)
    rng.shuffle(index)

    for d in (refs, os.path.join(val, "ben_popular"), os.path.join(val, "ben_longtail")):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)

    want = {"popular": args.val_popular, "longtail": args.val_longtail}
    got = {"popular": 0, "longtail": 0}
    val_rows, ref_rows = [], []
    seen = set()
    stats = {"no_js": 0, "unreadable": 0, "repeated_files": 0, "ref_bytes": 0}
    for row in index:
        files = js_members(os.path.join(raw, "tarballs", row["file"]), args.max_file)
        if files is None:
            stats["unreadable"] += 1
            continue
        if not files:
            stats["no_js"] += 1
            continue
        total = sum(len(b) for _, b in files)
        src = row["source"]
        longtail_ok = src != "longtail" or row.get("search_date", "")[:10] <= "2024-06-30"
        if got[src] < want[src] and total <= VAL_LIMIT and longtail_ok:
            cat = "ben_popular" if src == "popular" else "ben_longtail"
            d = write_package(os.path.join(val, cat), row, files)
            val_rows.append({"category": cat, "dir": os.path.relpath(d, val), "name": row["name"],
                             "version": row["version"], "js_bytes": total, "files": len(files)})
            got[src] += 1
            continue
        kept, size = [], 0
        for rel, data in sorted(files, key=lambda f: len(f[1])):
            key = ws_key(data)
            if key in seen:
                stats["repeated_files"] += 1
                continue
            if size + len(data) > args.max_package:
                continue
            seen.add(key)
            kept.append((rel, data))
            size += len(data)
        if kept:
            write_package(refs, row, kept)
            ref_rows.append({"name": row["name"], "version": row["version"], "source": src,
                             "js_bytes": size, "files": len(kept)})
            stats["ref_bytes"] += size
    json.dump(val_rows, open(os.path.join(val, "manifest_benign.json"), "w"), indent=1)
    json.dump(ref_rows, open(os.path.join(os.path.dirname(refs), "benign_refs_manifest.json"), "w"), indent=1)
    print("validation", got, "references", len(ref_rows), "stats", stats)


if __name__ == "__main__":
    main()
