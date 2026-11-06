import argparse
import concurrent.futures
import json
import os
import random
import re
import subprocess
import tarfile
import tempfile
import urllib.parse
import urllib.request

HIGH_IMPACT = "npm-high-impact@1.13.0"
DOWNLOADS = "https://api.npmjs.org/downloads/point/last-month/%s"
DATADOG_API = "https://api.github.com/repos/DataDog/malicious-software-packages-dataset"
KEYWORDS = """string array date color parser format convert validator logger config cli math helper
util plugin template markdown csv json url path hash random event stream cache queue retry
timer slug case diff merge deep clone sort search filter emoji unicode i18n locale
http request client server api rest graphql websocket socket proxy router middleware express koa
react vue angular svelte component hooks redux state store form input button modal table chart
canvas svg image video audio file fs glob watch build bundle webpack rollup babel eslint lint
prettier test mock assert spec benchmark promise async worker thread cluster child process
crypto encrypt token jwt auth oauth session cookie password uuid id random number currency money
time duration timezone calendar cron schedule geo map location address phone email mail sms
database sql mysql postgres mongo redis orm query schema model validation types typescript
string-utils text word regex escape template-engine html xml yaml toml ini env dotenv argv
command terminal shell ansi progress spinner prompt table-format pretty print debug trace
""".split()


def npm(*args, timeout=300):
    """Runs the npm CLI and returns its standard output, raising on failure."""
    proc = subprocess.run(
        ["npm", "--loglevel=error"] + list(args),
        capture_output=True,
        timeout=timeout,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", "replace").strip() or "npm failed")
    return proc.stdout.decode("utf-8", "replace")


def get(url, tries=4):
    """Fetches url and returns its body, retrying a few times."""
    err = None
    for _ in range(tries):
        try:
            return urllib.request.urlopen(url, timeout=60).read()
        except Exception as e:
            err = e
    raise err


def high_impact_names():
    """Returns the sorted package names of the npm-high-impact 1.13.0 list."""
    with tempfile.TemporaryDirectory() as tmp:
        filename = json.loads(npm("pack", HIGH_IMPACT, "--pack-destination", tmp, "--json"))[0]["filename"]
        with tarfile.open(os.path.join(tmp, filename), mode="r:gz") as t:
            text = t.extractfile("package/lib/top.js").read().decode()
    return sorted(set(re.findall(r"'([^']+)'", text)))


def search_names(cache, per_keyword):
    """Returns {name: last publish date} from npm search, keeping the least popular results of each keyword."""
    os.makedirs(cache, exist_ok=True)
    names = {}
    for kw in KEYWORDS:
        path = os.path.join(cache, "%s.json" % kw)
        if os.path.exists(path):
            hits = json.load(open(path))
        else:
            try:
                hits = json.loads(npm("search", kw, "--json", "--searchlimit=250", timeout=120))
            except Exception:
                continue
            json.dump(hits, open(path, "w"))
        for hit in hits[-per_keyword:]:
            names.setdefault(hit["name"], str(hit.get("date", ""))[:10])
    return names


def downloads_last_month(names):
    """Returns {name: monthly downloads} for a comma-separated batch of unscoped npm names."""
    try:
        doc = json.loads(get(DOWNLOADS % ",".join(names)))
    except Exception:
        return {}
    return {k: v["downloads"] for k, v in doc.items() if isinstance(v, dict) and "downloads" in v}


def downloads_scoped(name):
    """Returns the monthly download count of a scoped npm name, or None."""
    try:
        doc = json.loads(get(DOWNLOADS % urllib.parse.quote(name, safe="@")))
    except Exception:
        return None
    return doc.get("downloads")


def datadog_names(cache):
    """Returns every package name listed in DataDog's malicious_intent tree, caching the listing."""
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, "tree_malicious_intent.json")
    if os.path.exists(path):
        tree = json.load(open(path))
    else:
        listing = json.load(urllib.request.urlopen(DATADOG_API + "/contents/samples/npm", timeout=60))
        sha = next(e["sha"] for e in listing if e["name"] == "malicious_intent")
        tree = json.load(urllib.request.urlopen(DATADOG_API + "/git/trees/" + sha + "?recursive=1", timeout=300))
        if tree.get("truncated"):
            raise SystemExit("tree listing truncated")
        json.dump(tree, open(path, "w"))
    return {"/".join(e["path"].split("/")[:-2]) for e in tree["tree"] if e["path"].endswith(".zip")}


def latest(name):
    """Returns the latest version metadata of name, or None when it is deprecated, missing or too large."""
    try:
        doc = json.loads(npm("view", name, "version", "dist.tarball", "dist.unpackedSize", "deprecated", "--json"))
    except Exception:
        return None
    if not isinstance(doc, dict) or doc.get("deprecated") or not doc.get("dist.tarball"):
        return None
    return {
        "name": name,
        "version": doc.get("version", ""),
        "tarball": doc["dist.tarball"],
        "size": doc.get("dist.unpackedSize"),
    }


def pack(info, tar_dir, max_bytes):
    """Downloads the published tarball of info with npm pack into tar_dir and returns its metadata."""
    fname = "%s@%s.tgz" % (info["name"].replace("/", "_"), info["version"])
    path = os.path.join(tar_dir, fname)
    if not os.path.exists(path):
        if info.get("size") and info["size"] > max_bytes:
            return None
        try:
            packed = json.loads(npm("pack", "%s@%s" % (info["name"], info["version"]), "--pack-destination", tar_dir, "--json"))[0]
        except Exception:
            return None
        produced = os.path.join(tar_dir, packed["filename"])
        if not os.path.exists(produced):
            return None
        os.replace(produced, path)
    return dict(
        info,
        file=fname,
        tarball_size=os.path.getsize(path),
        unpacked_size=info.get("size"),
    )


def main():
    """Downloads the raw benign npm corpus with the npm CLI, excluding published malware names."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="~/packguard-data/v7/raw/npm")
    ap.add_argument("--datadog", default="~/packguard-data/datadog")
    ap.add_argument("--popular", type=int, default=1500)
    ap.add_argument("--longtail", type=int, default=1500)
    ap.add_argument("--max-unpacked", type=int, default=8 * 1024 * 1024)
    ap.add_argument("--max-downloads", type=int, default=2000)
    ap.add_argument("--search-per-keyword", type=int, default=40)
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--seed", type=int, default=20261105)
    args = ap.parse_args()
    raw = os.path.expanduser(args.raw)
    tar_dir = os.path.join(raw, "tarballs")
    os.makedirs(tar_dir, exist_ok=True)
    rng = random.Random(args.seed)

    banned = datadog_names(os.path.expanduser(args.datadog))
    popular = [n for n in high_impact_names() if n not in banned]
    rng.shuffle(popular)
    lt_all = search_names(os.path.join(raw, "search"), args.search_per_keyword)
    popular_set = set(popular)
    lt_candidates = sorted(n for n in lt_all if n not in banned and n not in popular_set)
    rng.shuffle(lt_candidates)
    print("high-impact usable", len(popular), "long-tail candidates", len(lt_candidates), "excluded", len(banned), flush=True)

    counts_path = os.path.join(raw, "downloads.json")
    counts = json.load(open(counts_path)) if os.path.exists(counts_path) else {}
    todo = [n for n in lt_candidates if n not in counts]
    scoped = [n for n in todo if n.startswith("@")]
    plain = [n for n in todo if not n.startswith("@")]
    batches = [plain[i:i + 100] for i in range(0, len(plain), 100)]
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        for got in ex.map(downloads_last_month, batches):
            counts.update(got)
    with concurrent.futures.ThreadPoolExecutor(4) as ex:
        for name, count in zip(scoped, ex.map(downloads_scoped, scoped)):
            counts[name] = count
    json.dump(counts, open(counts_path, "w"))
    longtail = [n for n in lt_candidates if counts.get(n) is not None and counts[n] <= args.max_downloads]
    print("long-tail usable", len(longtail), flush=True)

    rows = [("popular", n) for n in popular[:args.popular]] + [("longtail", n) for n in longtail[:args.longtail]]
    index_path = os.path.join(raw, "index.json")
    done = {}
    if os.path.exists(index_path):
        for row in json.load(open(index_path)):
            if os.path.exists(os.path.join(tar_dir, row["file"])):
                done[(row["name"], row["source"])] = row
    index = []

    def work(row):
        source, name = row
        if (name, source) in done:
            return done[(name, source)]
        info = latest(name)
        if info is None:
            return None
        got = pack(info, tar_dir, args.max_unpacked)
        if got is None:
            return None
        got["source"] = source
        if source == "longtail":
            got["search_date"] = lt_all.get(name, "")
        return got

    with concurrent.futures.ThreadPoolExecutor(args.jobs) as ex:
        for i, got in enumerate(ex.map(work, rows), 1):
            if got:
                index.append(got)
            if i % 200 == 0:
                print("processed", i, "of", len(rows), "kept", len(index), flush=True)
    index.sort(key=lambda r: (r["source"], r["name"]))
    json.dump(index, open(index_path, "w"), indent=1)
    print("tarballs", len(index), "popular", sum(r["source"] == "popular" for r in index),
          "longtail", sum(r["source"] == "longtail" for r in index),
          "bytes", sum(r["tarball_size"] for r in index))


if __name__ == "__main__":
    main()
