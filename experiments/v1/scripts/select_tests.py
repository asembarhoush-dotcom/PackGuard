import argparse, collections, json, os, random, urllib.request

API = "https://api.github.com/repos/DataDog/malicious-software-packages-dataset"
LIMIT = 32 * 1024


def fetch_tree(path):
    if os.path.exists(path):
        return json.load(open(path))
    listing = json.load(urllib.request.urlopen(f"{API}/contents/samples/npm"))
    sha = next(e["sha"] for e in listing if e["name"] == "malicious_intent")
    tree = json.load(urllib.request.urlopen(f"{API}/git/trees/{sha}?recursive=1"))
    json.dump(tree, open(path, "w"))
    return tree


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--v1", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    rng = random.Random(20261024)
    os.makedirs(args.out, exist_ok=True)

    tree = fetch_tree(os.path.join(args.out, "datadog_tree.json"))
    zips = []
    for e in tree["tree"]:
        if not e["path"].endswith(".zip"):
            continue
        parts = e["path"].split("/")
        zips.append({"name": "/".join(parts[:-2]), "version": parts[-2], "date": parts[-1][:10],
                     "path": e["path"], "size": e["size"]})
    by_name = collections.defaultdict(list)
    for z in zips:
        by_name[z["name"]].append(z)
    print("datadog zips", len(zips), "names", len(by_name))
    json.dump(sorted(by_name), open(os.path.join(args.out, "datadog_names.json"), "w"))

    v1 = {}
    for group in sorted(os.listdir(args.v1)):
        for pkg in sorted(os.listdir(os.path.join(args.v1, group))):
            d = os.path.join(args.v1, group, pkg)
            size = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d))
            name, version = pkg.rsplit("@", 1)
            v1[pkg] = {"group": group, "dir": pkg, "name": name, "version": version, "size": size}
    v1_names = collections.defaultdict(set)
    for p in v1.values():
        v1_names[p["name"]].add(p["version"])
    dd_date = {(z["name"].replace("/", "_"), z["version"]): z["date"] for z in zips}
    dates = sorted(d for d in (dd_date.get((p["name"], p["version"]), "") for p in v1.values()) if d)
    print("v1 packages", len(v1), "dated", len(dates), "first", dates[0], "last", dates[-1])

    small = sorted(k for k, p in v1.items() if 0 < p["size"] <= LIMIT)
    known = rng.sample(small, 50)
    mal_known = [dict(v1[k], date=dd_date.get((v1[k]["name"], v1[k]["version"]), "")) for k in known]

    newver_pool = []
    for n in sorted(n for n, vs in v1_names.items() if len(vs) == 3):
        cands = [z for z in by_name.get(n, []) if z["version"] not in v1_names[n] and z["size"] <= 200_000]
        if not cands and n.startswith("@"):
            cands = [z for z in by_name.get(n.replace("_", "/", 1), [])
                     if z["version"] not in v1_names[n] and z["size"] <= 200_000]
        if cands:
            newver_pool.append(rng.choice(sorted(cands, key=lambda z: z["path"])))
    print("names at the version cap with dropped versions:", len(newver_pool))
    mal_newver = rng.sample(newver_pool, min(70, len(newver_pool)))

    newname_pool = [z for z in zips if z["name"].replace("/", "_") not in v1_names and z["size"] <= 200_000]
    print("zips whose name is not in v1:", len(newname_pool))
    mal_newname = rng.sample(sorted(newname_pool, key=lambda z: z["path"]), 90)

    json.dump({"mal_known": mal_known, "mal_newver": mal_newver, "mal_newname": mal_newname,
               "v1_first_date": dates[0], "v1_last_date": dates[-1]},
              open(os.path.join(args.out, "selection_malware.json"), "w"), indent=1)
    json.dump({k: {"group": p["group"], "name": p["name"], "version": p["version"], "size": p["size"]}
               for k, p in v1.items()}, open(os.path.join(args.out, "v1_index.json"), "w"))
    print("selected", len(mal_known), len(mal_newver), len(mal_newname))


if __name__ == "__main__":
    main()
