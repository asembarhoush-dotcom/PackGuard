import argparse, concurrent.futures, io, json, os, random, re, shutil, tarfile, urllib.parse, urllib.request

HIGH_IMPACT = "https://registry.npmjs.org/npm-high-impact/-/npm-high-impact-1.13.0.tgz"
HOOKS = ("preinstall", "install", "postinstall")
JS_EXT = (".js", ".cjs", ".mjs")
LIMIT = 64 * 1024


def get(url, tries=4):
    err = None
    for _ in range(tries):
        try:
            return urllib.request.urlopen(url, timeout=60).read()
        except Exception as e:
            err = e
    raise err


def high_impact_names():
    blob = get(HIGH_IMPACT)
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as t:
        text = t.extractfile("package/lib/top.js").read().decode()
    return sorted(set(re.findall(r"'([^']+)'", text)))


def datadog_names(datadog):
    names = set()
    tree = json.load(open(os.path.join(datadog, "tree_malicious_intent.json")))
    for e in tree["tree"]:
        if e["path"].endswith(".zip"):
            names.add("/".join(e["path"].split("/")[:-2]))
    bad_versions = set()
    tree = json.load(open(os.path.join(datadog, "tree_compromised_lib.json")))
    for e in tree["tree"]:
        if e["path"].endswith(".zip"):
            parts = e["path"].split("/")
            bad_versions.add(("/".join(parts[:-2]), parts[-2]))
    return names, bad_versions


def latest(name):
    try:
        doc = json.loads(get("https://registry.npmjs.org/" + urllib.parse.quote(name, safe="@") + "/latest"))
    except Exception:
        return None
    scripts = doc.get("scripts") if isinstance(doc.get("scripts"), dict) else {}
    return {"name": name, "version": doc.get("version", ""), "tarball": doc.get("dist", {}).get("tarball"),
            "deprecated": bool(doc.get("deprecated")),
            "hooks": {h: scripts[h] for h in HOOKS if isinstance(scripts.get(h), str) and scripts[h]}}


def package_files(tarball):
    """Returns {relative path: bytes} for the root package.json and the
    JavaScript files outside node_modules of an npm tarball."""
    blob = get(tarball)
    out = {}
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as t:
        for m in t.getmembers():
            if not m.isfile() or "/" not in m.name:
                continue
            rel = m.name.split("/", 1)[1]
            parts = rel.split("/")
            if rel.startswith("/") or ".." in parts or "node_modules" in parts:
                continue
            if rel == "package.json" or rel.endswith(JS_EXT):
                out[rel] = t.extractfile(m).read()
    return out


def write(base, info, files):
    d = os.path.join(base, f"{info['name'].replace('/', '_')}@{info['version']}")
    for rel, data in files.items():
        p = os.path.join(d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(data)
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datadog", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--general", type=int, default=400)
    ap.add_argument("--probe", type=int, default=6000)
    ap.add_argument("--seed", type=int, default=20261025)
    args = ap.parse_args()

    names = high_impact_names()
    dd_names, bad_versions = datadog_names(args.datadog)
    pool = [n for n in names if n not in dd_names]
    random.Random(args.seed).shuffle(pool)
    pool = pool[:args.probe]
    print("high-impact names", len(names), "also in DataDog malicious_intent", len(set(names) & dd_names))

    with concurrent.futures.ThreadPoolExecutor(16) as ex:
        infos = [i for i in ex.map(latest, pool) if i and i["tarball"] and not i["deprecated"]
                 and (i["name"], i["version"]) not in bad_versions]
    print("probed", len(pool), "usable", len(infos), "with install hooks", sum(bool(i["hooks"]) for i in infos))

    manifest = []
    for cat in ("ben_general", "ben_scripts"):
        shutil.rmtree(os.path.join(args.out, "targets", cat), ignore_errors=True)

    base = os.path.join(args.out, "targets", "ben_scripts")
    for info in (i for i in infos if i["hooks"]):
        try:
            files = package_files(info["tarball"])
        except Exception:
            continue
        if "package.json" not in files:
            continue
        d = write(base, info, {"package.json": files["package.json"]})
        manifest.append({"category": "ben_scripts", "dir": os.path.relpath(d, os.path.join(args.out, "targets")),
                         "name": info["name"], "version": info["version"], "hooks": info["hooks"]})
    print("ben_scripts", sum(m["category"] == "ben_scripts" for m in manifest))

    base = os.path.join(args.out, "targets", "ben_general")
    skipped = {"no_js": 0, "too_big": 0, "error": 0}

    def work(info):
        try:
            return info, package_files(info["tarball"])
        except Exception:
            return info, None

    kept = 0
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        for info, files in ex.map(work, infos):
            if kept >= args.general:
                break
            if files is None:
                skipped["error"] += 1
                continue
            js = sum(len(v) for k, v in files.items() if k.endswith(JS_EXT))
            if js == 0:
                skipped["no_js"] += 1
                continue
            if js > LIMIT:
                skipped["too_big"] += 1
                continue
            d = write(base, info, files)
            manifest.append({"category": "ben_general", "dir": os.path.relpath(d, os.path.join(args.out, "targets")),
                             "name": info["name"], "version": info["version"], "js_bytes": js,
                             "hooks": info["hooks"]})
            kept += 1
    print("ben_general", kept, "skipped", skipped)
    json.dump(manifest, open(os.path.join(args.out, "manifest_benign.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
