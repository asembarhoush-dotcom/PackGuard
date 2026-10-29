import argparse
import concurrent.futures
import json
import os
import random
import re
import tarfile
import io
import urllib.parse
import urllib.request

HIGH_IMPACT = "https://registry.npmjs.org/npm-high-impact/-/npm-high-impact-1.13.0.tgz"
SEARCH = "https://registry.npmjs.org/-/v1/search?text=%s&size=250&from=%d"
KEYWORDS = """string array date color parser format convert validator logger config cli math helper
util plugin template markdown csv json url path hash random event stream cache queue retry
timer slug case diff merge deep clone sort search filter emoji unicode i18n locale
http request client server api rest graphql websocket socket proxy router middleware express koa
react vue angular svelte component hooks redux state store form input button modal table chart
canvas svg image video audio file fs glob watch build bundle webpack rollup babel eslint lint
prettier test mock assert spec benchmark promise async queue worker thread cluster child process
crypto encrypt token jwt auth oauth session cookie password uuid id random number currency money
time duration timezone calendar cron schedule geo map location address phone email mail sms
database sql mysql postgres mongo redis orm query schema model validation types typescript
string-utils text word regex escape template-engine html xml yaml toml ini env dotenv argv
command terminal shell ansi progress spinner prompt table-format pretty print debug trace
""".split()


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
    """Returns the sorted names of the npm-high-impact 1.13.0 list."""
    blob = get(HIGH_IMPACT)
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as t:
        text = t.extractfile("package/lib/top.js").read().decode()
    return sorted(set(re.findall(r"'([^']+)'", text)))


def search_names(cache):
    """Returns long-tail names from npm search (at most 2,000 downloads a month), caching each page."""
    os.makedirs(cache, exist_ok=True)
    names = {}
    for kw in KEYWORDS:
        for frm in (0, 250):
            path = os.path.join(cache, "%s_%d.json" % (kw, frm))
            if os.path.exists(path):
                res = json.load(open(path))
            else:
                try:
                    res = json.loads(get(SEARCH % (urllib.parse.quote(kw), frm)))
                except Exception:
                    continue
                json.dump(res, open(path, "w"))
            for o in res.get("objects", []):
                p = o["package"]
                dl = o.get("downloads", {}).get("monthly")
                if dl is not None and dl > 2000:
                    continue
                if o.get("flags", {}).get("insecure") or p.get("deprecated"):
                    continue
                names.setdefault(p["name"], p.get("date", "")[:10])
    return names


def excluded_names(paths, datadog):
    """Returns every package name used by a test set or listed as malicious by DataDog."""
    out = set()
    for path in paths:
        path = os.path.expanduser(path)
        if os.path.exists(path):
            for row in json.load(open(path)):
                out.add(row["name"])
    tree = json.load(open(os.path.join(datadog, "tree_malicious_intent.json")))
    for e in tree["tree"]:
        if e["path"].endswith(".zip"):
            out.add("/".join(e["path"].split("/")[:-2]))
    return out


def latest(name):
    """Returns the latest version's metadata for name, or None."""
    try:
        doc = json.loads(get("https://registry.npmjs.org/" + urllib.parse.quote(name, safe="@") + "/latest"))
    except Exception:
        return None
    if doc.get("deprecated") or not doc.get("dist", {}).get("tarball"):
        return None
    return {"name": name, "version": doc.get("version", ""), "tarball": doc["dist"]["tarball"],
            "size": doc["dist"].get("unpackedSize")}


def download(info, raw_dir, max_bytes):
    """Saves the registry tarball of info under raw_dir unchanged; returns info with its file or None."""
    fname = "%s@%s.tgz" % (info["name"].replace("/", "_"), info["version"])
    path = os.path.join(raw_dir, fname)
    if not os.path.exists(path):
        if info.get("size") and info["size"] > max_bytes:
            return None
        try:
            blob = get(info["tarball"])
        except Exception:
            return None
        with open(path + ".part", "wb") as f:
            f.write(blob)
        os.replace(path + ".part", path)
    return dict(info, file=fname)


def main():
    """Downloads the raw benign npm corpus: high-impact and long-tail packages, test names excluded."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="~/packguard-data/raw/npm")
    ap.add_argument("--datadog", default="~/packguard-data/datadog")
    ap.add_argument("--popular", type=int, default=4000)
    ap.add_argument("--longtail", type=int, default=2500)
    ap.add_argument("--max-unpacked", type=int, default=8 * 1024 * 1024)
    ap.add_argument("--seed", type=int, default=20261029)
    ap.add_argument("--exclude", default="~/pg-detailed/manifest_benign.json,~/pg-v2/manifest_benign.json")
    args = ap.parse_args()
    raw = os.path.expanduser(args.raw)
    tar_dir = os.path.join(raw, "tarballs")
    os.makedirs(tar_dir, exist_ok=True)
    rng = random.Random(args.seed)

    banned = excluded_names(args.exclude.split(","), os.path.expanduser(args.datadog))
    popular = [n for n in high_impact_names() if n not in banned]
    rng.shuffle(popular)
    lt = search_names(os.path.join(raw, "search"))
    popular_set = set(popular)
    longtail = sorted(n for n in lt if n not in banned and n not in popular_set)
    rng.shuffle(longtail)
    print("high-impact usable", len(popular), "long-tail usable", len(longtail), "excluded", len(banned))

    rows = [("popular", n) for n in popular[:args.popular]] + [("longtail", n) for n in longtail[:args.longtail]]
    index = []

    def work(row):
        source, name = row
        info = latest(name)
        if info is None:
            return None
        got = download(info, tar_dir, args.max_unpacked)
        if got is None:
            return None
        got["source"] = source
        if source == "longtail":
            got["search_date"] = lt.get(name, "")
        return got

    with concurrent.futures.ThreadPoolExecutor(24) as ex:
        for i, got in enumerate(ex.map(work, rows)):
            if got:
                index.append(got)
            if i % 500 == 0:
                print("processed", i, "kept", len(index), flush=True)
    json.dump(index, open(os.path.join(raw, "index.json"), "w"), indent=1)
    print("tarballs", len(index), "popular", sum(r["source"] == "popular" for r in index),
          "longtail", sum(r["source"] == "longtail" for r in index))


if __name__ == "__main__":
    main()
