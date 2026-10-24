import argparse, concurrent.futures, io, json, os, random, shutil, tarfile, urllib.parse, urllib.request

LIMIT = 32 * 1024

POPULAR = """ms inherits safe-buffer once wrappy isarray debug minimatch balanced-match brace-expansion
concat-map path-is-absolute inflight glob-parent is-glob is-extglob escape-string-regexp supports-color
has-flag color-name color-convert ansi-styles ansi-regex strip-ansi string-width emoji-regex
is-fullwidth-code-point wrap-ansi cliui y18n get-caller-file require-directory camelcase decamelize
p-limit p-locate locate-path path-exists find-up yocto-queue mime-types mime-db mime negotiator
accepts type-is media-typer content-type vary depd statuses toidentifier setprototypeof http-errors
bytes on-finished ee-first encodeurl escape-html etag fresh range-parser destroy unpipe cookie
cookie-signature merge-descriptors methods utils-merge parseurl proxy-addr forwarded ipaddr.js
safer-buffer iconv-lite raw-body body-parser serve-static send finalhandler array-flatten
path-to-regexp object-assign function-bind has-symbols has-proto hasown get-intrinsic call-bind
define-data-property es-errors es-define-property gopd has-property-descriptors set-function-length
object-keys define-properties is-callable is-number to-regex-range fill-range picomatch normalize-path
anymatch binary-extensions is-binary-path readdirp chokidar graceful-fs universalify jsonfile
signal-exit cross-spawn which isexe shebang-command shebang-regex path-key npm-run-path strip-final-newline
is-stream get-stream human-signals onetime mimic-fn merge-stream deepmerge clone lru-cache yallist
semver-compare dotenv nanoid uuid-random kind-of is-plain-object is-buffer dedent pify make-dir
""".split()

KEYWORDS = """string array date color parser format convert validator logger config cli math helper
util plugin template markdown csv json url path hash random event stream cache queue retry
timer slug case diff merge deep clone sort search filter emoji unicode i18n locale
""".split()


def get_json(url):
    return json.load(urllib.request.urlopen(url, timeout=60))


def js_files(tarball_url):
    blob = urllib.request.urlopen(tarball_url, timeout=60).read()
    out = {}
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as t:
        for m in t.getmembers():
            if not m.isfile() or "node_modules/" in m.name or not m.name.endswith((".js", ".cjs", ".mjs")):
                continue
            rel = m.name.split("/", 1)[1] if "/" in m.name else m.name
            if rel.startswith("/") or ".." in rel.split("/"):
                continue
            out[rel] = t.extractfile(m).read()
    return out


def candidate_latest(name):
    meta = get_json("https://registry.npmjs.org/" + urllib.parse.quote(name, safe="@"))
    ver = meta["dist-tags"]["latest"]
    return name, ver, meta["versions"][ver]["dist"]["tarball"], meta.get("time", {}).get(ver, "")


def materialize(out, cat, rows, want):
    base = os.path.join(out, "targets", cat)
    shutil.rmtree(base, ignore_errors=True)
    os.makedirs(base)
    manifest, skipped = [], {"no_js": 0, "too_big": 0, "error": 0}

    def work(r):
        try:
            return r, js_files(r[2])
        except Exception:
            return r, None

    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        for (name, ver, url, date), files in ex.map(work, rows):
            if len(manifest) >= want:
                break
            if files is None:
                skipped["error"] += 1
                continue
            total = sum(len(b) for b in files.values())
            if total == 0:
                skipped["no_js"] += 1
                continue
            if total > LIMIT:
                skipped["too_big"] += 1
                continue
            pkgdir = f"{name.replace('/', '_')}@{ver}"
            for rel, data in files.items():
                p = os.path.join(base, pkgdir, rel)
                os.makedirs(os.path.dirname(p), exist_ok=True)
                with open(p, "wb") as f:
                    f.write(data)
            manifest.append({"category": cat, "dir": f"{cat}/{pkgdir}", "name": name, "version": ver,
                             "date": date[:10], "js_bytes": total, "files": len(files)})
    print(cat, "kept", len(manifest), "skipped", skipped)
    return manifest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    rng = random.Random(20261025)
    dd_names = set(json.load(open(os.path.join(args.out, "datadog_names.json"))))

    pop = [n for n in POPULAR if n not in dd_names]
    rng.shuffle(pop)
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        pop_rows = list(ex.map(candidate_latest, pop))
    manifest = materialize(args.out, "ben_popular", pop_rows, 50)

    seen, longtail = set(), []
    for kw in KEYWORDS:
        for frm in (0, 250):
            try:
                res = get_json(f"https://registry.npmjs.org/-/v1/search?text={kw}&size=250&from={frm}")
            except Exception:
                continue
            for o in res.get("objects", []):
                p = o["package"]
                name, date = p["name"], p.get("date", "")
                if name in seen or name in dd_names:
                    continue
                seen.add(name)
                dl = o.get("downloads", {}).get("monthly")
                if not ("2015-01-01" <= date[:10] <= "2024-06-30"):
                    continue
                if dl is not None and dl > 2000:
                    continue
                if o.get("flags", {}).get("insecure") or p.get("deprecated"):
                    continue
                longtail.append(name)
    print("long-tail candidates", len(longtail))
    rng.shuffle(longtail)

    def lt_row(n):
        try:
            return candidate_latest(n)
        except Exception:
            return None

    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        lt_rows = [r for r in ex.map(lt_row, longtail[:200]) if r and r[3][:10] <= "2024-06-30"]
    manifest += materialize(args.out, "ben_longtail", lt_rows, 45)
    json.dump(manifest, open(os.path.join(args.out, "manifest_benign.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
