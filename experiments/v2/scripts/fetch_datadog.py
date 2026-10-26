import argparse, concurrent.futures, json, os, urllib.parse, urllib.request

API = "https://api.github.com/repos/DataDog/malicious-software-packages-dataset"
RAW = "https://raw.githubusercontent.com/DataDog/malicious-software-packages-dataset/main/samples/npm/"


def fetch_tree(out, kind):
    path = os.path.join(out, f"tree_{kind}.json")
    if os.path.exists(path):
        return json.load(open(path))
    listing = json.load(urllib.request.urlopen(f"{API}/contents/samples/npm"))
    sha = next(e["sha"] for e in listing if e["name"] == kind)
    tree = json.load(urllib.request.urlopen(f"{API}/git/trees/{sha}?recursive=1"))
    if tree.get("truncated"):
        raise SystemExit("tree listing truncated")
    json.dump(tree, open(path, "w"))
    return tree


def download(job):
    url, dst, size = job
    if os.path.exists(dst) and os.path.getsize(dst) == size:
        return "kept"
    err = None
    for _ in range(5):
        try:
            blob = urllib.request.urlopen(url, timeout=120).read()
            if len(blob) != size:
                raise IOError(f"size {len(blob)} != {size}")
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst + ".part", "wb") as f:
                f.write(blob)
            os.replace(dst + ".part", dst)
            return "new"
        except Exception as e:
            err = e
    return f"failed {url} {err!r}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--kind", default="malicious_intent")
    ap.add_argument("--max-bytes", type=int, default=1 << 20)
    ap.add_argument("--threads", type=int, default=32)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    tree = fetch_tree(args.out, args.kind)
    jobs = [(RAW + args.kind + "/" + urllib.parse.quote(e["path"]),
             os.path.join(args.out, args.kind, e["path"]), e["size"])
            for e in tree["tree"] if e["path"].endswith(".zip") and e["size"] <= args.max_bytes]
    counts = {"kept": 0, "new": 0, "failed": 0}
    with concurrent.futures.ThreadPoolExecutor(args.threads) as ex:
        for i, r in enumerate(ex.map(download, jobs), 1):
            if r.startswith("failed"):
                counts["failed"] += 1
                print(r, flush=True)
            else:
                counts[r] += 1
            if i % 1000 == 0:
                print(i, "of", len(jobs), counts, flush=True)
    print("done", len(jobs), counts)


if __name__ == "__main__":
    main()
