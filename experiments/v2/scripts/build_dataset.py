import argparse, collections, concurrent.futures, hashlib, io, json, os, random, re, shutil, stat, subprocess, zipfile

HOOKS = ("preinstall", "install", "postinstall")
MAX_DEPTH = 512
JS_EXT = (".js", ".cjs", ".mjs")
SCRIPTS_FILE = "install_scripts.txt"

JS_TOKEN = re.compile(
    rb"""("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)"""
    rb"""|(/\*.*?\*/|//[^\n]*)"""
    rb"""|(\b_0x[0-9a-fA-F]+\b)"""
    rb"""|(\b\d[\w.]*)"""
    rb"""|(\s+)""", re.S)
SCRIPT_WORD = re.compile(rb"[A-Za-z0-9_]+")
LAUNCHER = re.compile(
    rb"""^\s*(?:(?:node|nodejs|bun)\s+)?(?:\./)?[\w@./-]+\.[cm]?js"""
    rb"""(?:\s*(?:[12]?>\s*/dev/null|2>&1))*\s*$""")
NOOP = re.compile(rb"^\s*(?:true|exit\s+0|:)?\s*$")


def install_scripts(data):
    """Mirror of install_scripts() in src/manifest.c: the preinstall,
    install and postinstall commands of the top-level "scripts" object,
    each followed by a newline, or b"" when there are none or the JSON is
    not valid."""
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]

    def no_constant(name):
        raise ValueError(name)

    try:
        doc = json.loads(data.decode("utf-8", "surrogateescape"), parse_constant=no_constant)
    except (ValueError, RecursionError):
        return b""

    def too_deep(v, depth):
        stack = [(v, depth)]
        while stack:
            v, depth = stack.pop()
            if depth > MAX_DEPTH:
                return True
            children = v.values() if isinstance(v, dict) else v if isinstance(v, list) else ()
            stack.extend((c, depth + 1) for c in children)
        return False

    if not isinstance(doc, dict) or too_deep(doc, 1) or not isinstance(doc.get("scripts"), dict):
        return b""
    out = b""
    for hook in HOOKS:
        cmd = doc["scripts"].get(hook)
        if isinstance(cmd, str) and cmd:
            out += _encode(cmd) + b"\n"
    return out


def _encode(s):
    """Encodes s as UTF-8, turning surrogateescape'd bytes back into raw
    bytes and any other lone surrogate into its 3-byte form."""
    parts = []
    for ch in s:
        o = ord(ch)
        if 0xDC80 <= o <= 0xDCFF:
            parts.append(bytes([o - 0xDC00]))
        else:
            parts.append(ch.encode("utf-8", "surrogatepass"))
    return b"".join(parts)


def trivial_scripts(text):
    """True when every install command only launches a local .js file
    (or does nothing): the payload is then in that file, which is kept
    anyway, and the command alone would match benign launchers."""
    for line in text.split(b"\n"):
        for part in re.split(rb"\|\||&&|;", line):
            if not (LAUNCHER.match(part) or NOOP.match(part)):
                return False
    return True


def js_shape(src):
    """Code shape of one JavaScript file: strings, numbers, comments and
    _0x obfuscator names blanked out, whitespace removed."""
    def repl(m):
        if m.group(1) is not None:
            return b'"'
        if m.group(3) is not None:
            return b"_0x"
        if m.group(4) is not None:
            return b"0"
        return b""
    return JS_TOKEN.sub(repl, src)


def script_shape(text):
    """Code shape of install-script text: words that are short and purely
    alphabetic (command names, flags) stay, every other word becomes #."""
    def repl(m):
        w = m.group()
        return w if w.isalpha() and len(w) <= 10 else b"#"
    return re.sub(rb"\s+", b"", SCRIPT_WORD.sub(repl, text))


def ws_hash(data):
    return hashlib.sha256(re.sub(rb"\s+", b"", data)).hexdigest()


def read_sample(path):
    """Returns ({flattened name: bytes} for the JavaScript files, root
    package.json bytes or None) of one DataDog zip, decrypted in memory."""
    js, manifests = {}, []
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            name = info.filename
            if info.is_dir() or "node_modules/" in name:
                continue
            parts = name.split("/")
            rel = parts[parts.index("package") + 1:] if "package" in parts[:-1] else parts[-1:]
            if name.endswith(JS_EXT):
                js["__".join(rel)] = z.read(info, pwd=b"infected")
            elif parts[-1] == "package.json":
                manifests.append((len(rel) if "package" in parts[:-1] else 99 + len(parts), info))
        manifest = None
        if manifests:
            manifests.sort(key=lambda m: m[0])
            if manifests[0][0] == 1 or "package" not in manifests[0][1].filename.split("/")[:-1]:
                manifest = z.read(manifests[0][1], pwd=b"infected")
    return js, manifest


def index_one(job):
    root, entry = job
    parts = entry["path"].split("/")
    rec = {"name": "/".join(parts[:-2]).replace("/", "_"), "version": parts[-2],
           "date": parts[-1][:10], "zip": entry["path"], "zip_bytes": entry["size"]}
    try:
        js, manifest = read_sample(os.path.join(root, entry["path"]))
    except Exception as e:
        rec["error"] = repr(e)
        return rec
    scripts = install_scripts(manifest) if manifest is not None else b""
    rec["has_manifest"] = manifest is not None
    rec["scripts"] = scripts.decode("utf-8", "surrogateescape")
    rec["scripts_trivial"] = bool(scripts) and trivial_scripts(scripts)
    keep_scripts = bool(scripts) and not rec["scripts_trivial"]
    rec["js_files"] = len(js)
    rec["js_bytes"] = sum(len(v) for v in js.values())
    shapes = sorted(hashlib.sha256(js_shape(v)).hexdigest() for v in js.values() if v)
    keys = sorted(ws_hash(v) for v in js.values() if v)
    if keep_scripts:
        shapes.append("s" + hashlib.sha256(script_shape(scripts)).hexdigest())
        keys.append("s" + ws_hash(scripts))
    rec["stored_bytes"] = rec["js_bytes"] + (len(scripts) if keep_scripts else 0)
    rec["keep_scripts"] = keep_scripts
    rec["shape"] = hashlib.sha256("\n".join(shapes).encode()).hexdigest()[:12] if shapes else None
    rec["content"] = hashlib.sha256("\n".join(keys).encode()).hexdigest() if keys else None
    return rec


def cmd_index(args):
    tree = json.load(open(os.path.join(args.datadog, "tree_malicious_intent.json")))
    root = os.path.join(args.datadog, "malicious_intent")
    jobs = [(root, e) for e in tree["tree"]
            if e["path"].endswith(".zip") and e["size"] <= args.max_zip_bytes]
    jobs.sort(key=lambda j: j[1]["path"])
    with concurrent.futures.ProcessPoolExecutor(args.threads) as ex:
        recs = list(ex.map(index_one, jobs, chunksize=64))
    json.dump(recs, open(args.index, "w"))
    c = collections.Counter()
    for r in recs:
        if "error" in r:
            c["unreadable"] += 1
        elif r["content"] is None:
            c["nothing to store"] += 1
        else:
            c["usable"] += 1
            c["with install scripts kept"] += r["keep_scripts"]
            c["install scripts only"] += r["keep_scripts"] and r["js_bytes"] == 0
            c["trivial launcher scripts"] += r["scripts_trivial"]
    print(len(recs), dict(c))


def select(recs, shape_cap, name_cap, order="earliest", before=None, since=None, scripts=True):
    """Picks packages in publish order: exact duplicates (same files
    ignoring whitespace) are dropped, then a package is kept while its code
    shape has fewer than shape_cap and its name fewer than name_cap kept
    packages (0 means no cap). before/since limit the publish dates.
    Without scripts, packages that are only install scripts are skipped."""
    usable = [r for r in recs if "error" not in r and r["content"] is not None
              and (before is None or r["date"] < before) and (since is None or r["date"] >= since)
              and (scripts or r["js_bytes"] > 0)]
    usable.sort(key=lambda r: (r["date"], r["name"], r["version"]), reverse=(order == "latest"))
    seen, per_shape, per_name, kept = set(), collections.Counter(), collections.Counter(), []
    for r in usable:
        if r["content"] in seen:
            continue
        seen.add(r["content"])
        if shape_cap and per_shape[r["shape"]] >= shape_cap:
            continue
        if name_cap and per_name[r["name"]] >= name_cap:
            continue
        per_shape[r["shape"]] += 1
        per_name[r["name"]] += 1
        kept.append(r)
    return kept


def write_package(root, rec, dst, all_scripts=False, scripts=True):
    """Writes one package's JavaScript and kept install scripts into dst,
    read-only. With all_scripts, launcher-only scripts are written too, as
    the scanner would read them from the package.json of a target; without
    scripts, no install scripts are written.
    Returns the number of bytes written."""
    js, manifest = read_sample(os.path.join(root, rec["zip"]))
    os.makedirs(dst, exist_ok=True)
    files = dict(js)
    if scripts and (rec["keep_scripts"] or (all_scripts and rec["scripts"])):
        files[SCRIPTS_FILE] = install_scripts(manifest)
    total = 0
    for name, data in files.items():
        if not data:
            continue
        p = os.path.join(dst, name[:200])
        with open(p, "wb") as f:
            f.write(data)
        os.chmod(p, stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
        total += len(data)
    return total


def materialize(datadog, recs, out, scripts=True):
    root = os.path.join(datadog, "malicious_intent")
    if os.path.exists(out):
        for d, dirs, files in os.walk(out):
            os.chmod(d, 0o755)
            for f in files:
                os.chmod(os.path.join(d, f), 0o644)
        shutil.rmtree(out)
    os.makedirs(out)
    jobs = [(root, r, os.path.join(out, r["shape"], f"{r['name']}@{r['version']}")) for r in recs]
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        return sum(ex.map(lambda j: write_package(*j, scripts=scripts), jobs))


def cmd_select(args):
    recs = json.load(open(args.index))
    kept = select(recs, args.shape_cap, args.name_cap, args.order, args.before, args.since)
    total = materialize(args.datadog, kept, args.out)
    shapes = len({r["shape"] for r in kept})
    print(f"kept {len(kept)} packages, {shapes} code shapes, {total / 2**20:.1f} MiB")
    json.dump([f"{r['shape']}/{r['name']}@{r['version']}" for r in kept],
              open(args.out.rstrip("/") + ".list.json", "w"), indent=0)


def cmd_targets(args):
    """Picks malware published on or after --since as test targets, each
    with at most --limit stored bytes and written with all its install
    scripts. Mode shape takes one random package from each of n random code
    shapes (variety); mode stream takes n random packages (what a live scan
    meets, campaigns and clones included)."""
    recs = [r for r in json.load(open(args.index)) if "error" not in r and r["content"]]
    before = [r for r in recs if r["date"] < args.since]
    seen_shape = {r["shape"] for r in before}
    seen_name = {r["name"] for r in before}
    seen_content = {r["content"] for r in before}
    after = [r for r in recs if r["date"] >= args.since
             and r["js_bytes"] + len(r["scripts"].encode("utf-8", "surrogateescape")) <= args.limit]
    rng = random.Random(args.seed)
    by_shape = collections.defaultdict(list)
    for r in sorted(after, key=lambda r: (r["date"], r["name"], r["version"])):
        by_shape[r["shape"]].append(r)
    shapes = sorted(by_shape)
    rng.shuffle(shapes)
    if args.mode == "shape":
        picked = [rng.choice(by_shape[s]) for s in shapes[:args.n]]
    else:
        pool = sorted(after, key=lambda r: (r["date"], r["name"], r["version"]))
        picked = rng.sample(pool, args.n)

    root = os.path.join(args.datadog, "malicious_intent")
    base = os.path.join(args.out, "targets", args.category)
    if os.path.exists(base):
        for d, _, files in os.walk(base):
            os.chmod(d, 0o755)
        shutil.rmtree(base)
    manifest = []
    for r in picked:
        pkgdir = f"{r['name']}@{r['version']}"
        write_package(root, r, os.path.join(base, pkgdir), all_scripts=True)
        manifest.append({"category": args.category, "dir": f"{args.category}/{pkgdir}", "name": r["name"],
                         "version": r["version"], "date": r["date"], "shape": r["shape"],
                         "js_bytes": r["js_bytes"], "scripts": bool(r["scripts"]),
                         "scripts_only": r["js_bytes"] == 0, "scripts_trivial": r["scripts_trivial"],
                         "shape_seen": r["shape"] in seen_shape, "name_seen": r["name"] in seen_name,
                         "content_seen": r["content"] in seen_content})
    json.dump(manifest, open(os.path.join(args.out, f"manifest_{args.category}.json"), "w"), indent=1)
    c = collections.Counter()
    for m in manifest:
        for k in ("scripts", "scripts_only", "shape_seen", "name_seen", "content_seen"):
            c[k] += m[k]
    print("candidates", len(after), "shapes", len(shapes), "picked", len(picked), dict(c))


def cmd_stats(args):
    recs = [r for r in json.load(open(args.index)) if "error" not in r and r["content"]]
    by_month = collections.Counter(r["date"][:7] for r in recs)
    print("usable", len(recs))
    for m in sorted(by_month):
        print(m, by_month[m])
    for cap in (1, 2, 3, 5, 10, 0):
        k = select(recs, cap, 0)
        print("shape cap", cap or "none", "packages", len(k))


def cmd_pack(args):
    """Packs a materialized set into one encrypted zip per first hex digit
    of the code-shape folder (ZipCrypto, password infected)."""
    os.makedirs(args.zips, exist_ok=True)
    groups = collections.defaultdict(list)
    for g in sorted(os.listdir(args.out)):
        groups[g[0]].append(g)
    for h in "0123456789abcdef":
        z = os.path.abspath(os.path.join(args.zips, f"{args.prefix}_{h}.zip"))
        if os.path.exists(z):
            os.remove(z)
        if not groups[h]:
            continue
        subprocess.run([args.zip_exe, "-q", "-r", "-X", "-P", "infected", z] + groups[h],
                       cwd=args.out, check=True)
        print(os.path.basename(z), f"{os.path.getsize(z) / 2**20:.1f} MiB")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("index")
    p.add_argument("--datadog", required=True)
    p.add_argument("--index", required=True)
    p.add_argument("--max-zip-bytes", type=int, default=1 << 20)
    p.add_argument("--threads", type=int, default=4)
    p = sub.add_parser("stats")
    p.add_argument("--index", required=True)
    p = sub.add_parser("select")
    p.add_argument("--datadog", required=True)
    p.add_argument("--index", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--shape-cap", type=int, default=3)
    p.add_argument("--name-cap", type=int, default=3)
    p.add_argument("--order", choices=("earliest", "latest"), default="earliest")
    p.add_argument("--before")
    p.add_argument("--since")
    p = sub.add_parser("targets")
    p.add_argument("--datadog", required=True)
    p.add_argument("--index", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--since", required=True)
    p.add_argument("--n", type=int, default=300)
    p.add_argument("--mode", choices=("shape", "stream"), default="shape")
    p.add_argument("--category", default="mal_future")
    p.add_argument("--limit", type=int, default=64 * 1024)
    p.add_argument("--seed", type=int, default=20261025)
    p = sub.add_parser("pack")
    p.add_argument("--out", required=True)
    p.add_argument("--zips", required=True)
    p.add_argument("--prefix", default="malware")
    p.add_argument("--zip-exe", default="zip")
    args = ap.parse_args()
    {"index": cmd_index, "stats": cmd_stats, "select": cmd_select, "targets": cmd_targets,
     "pack": cmd_pack}[args.cmd](args)


if __name__ == "__main__":
    random.seed(0)
    main()
