import argparse
import base64
import json
import os
import random
import re
import shutil

CATEGORIES = ("mal_known", "mal_newver", "mal_newname", "ben_popular", "ben_longtail")
TIERS = ("T1", "T2", "T3", "T4")
JS_EXT = (".js", ".cjs", ".mjs")
KEYWORDS = {
    "async", "await", "break", "case", "catch", "class", "const", "continue",
    "debugger", "default", "delete", "do", "else", "export", "extends", "false",
    "finally", "for", "from", "function", "get", "if", "import", "in", "instanceof",
    "let", "new", "null", "of", "return", "set", "static", "super", "switch", "this",
    "throw", "true", "try", "typeof", "undefined", "var", "void", "while", "with",
    "yield", "require", "module", "exports", "process", "console", "Buffer", "global",
    "window", "document",
}


def js_files(folder):
    """Returns the JavaScript files directly inside folder."""
    return sorted(name for name in os.listdir(folder)
                  if name.endswith(JS_EXT) and os.path.isfile(os.path.join(folder, name)))


def map_code(text, ident, string, number):
    """Maps identifiers, string contents and numbers outside comments."""
    out = []
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c in "'\"`":
            quote = c
            j = i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == quote:
                    break
                j += 1
            content = text[i + 1:j]
            out.append(quote + string(content) + quote)
            i = j + 1 if j < n else n
        elif c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            j = n if j < 0 else j
            out.append(text[i:j])
            i = j
        elif c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(text[i:j])
            i = j
        elif c.isalpha() or c in "_$":
            j = i + 1
            while j < n and (text[j].isalnum() or text[j] in "_$"):
                j += 1
            word = text[i:j]
            out.append(word if word in KEYWORDS else ident(word))
            i = j
        elif c.isdigit():
            j = i + 1
            while j < n and (text[j].isalnum() or text[j] in "._"):
                j += 1
            out.append(number(text[i:j]))
            i = j
        else:
            out.append(c)
            i += 1
    return "".join(out)


def t1_format(text, rng):
    """Adds a header comment and indentation, leaving the code intact."""
    lines = text.splitlines()
    return "/* reformatted */\n" + "\n".join("  " + line for line in lines) + "\n"


def t2_mangle(text, rng):
    """Renames identifiers, strings and numbers consistently."""
    names = {}

    def ident(word):
        if word not in names:
            names[word] = "v%d" % len(names)
        return names[word]

    def string(value):
        return "".join(rng.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in value)

    def number(value):
        return str(rng.randint(10000, 99999))

    return map_code(text, ident, string, number)


def t3_pad(text, rng):
    """Inserts about 18 KiB of dead code, crossing the 16 KiB split threshold."""
    dead = "".join("function _pg_pad_%d(){var x=%d;return x;}\n" % (i, i)
                   for i in range(320))
    return "/* padded */\n" + dead + text + "\n" + dead


def t4_encode(text, rng):
    """Wraps the whole file in a base64 payload."""
    payload = base64.b64encode(text.encode("utf-8", "surrogateescape")).decode("ascii")
    return "eval(Buffer.from(\"%s\",\"base64\").toString());\n" % payload


TRANSFORMS = {
    "T1": t1_format,
    "T2": t2_mangle,
    "T3": t3_pad,
    "T4": t4_encode,
}


def transform_package(source, tier, rng):
    """Returns a list of (filename, text) for one transformed package."""
    files = []
    for index, name in enumerate(js_files(source)):
        with open(os.path.join(source, name), "rb") as handle:
            text = handle.read().decode("utf-8", "surrogateescape")
        transformed = TRANSFORMS[tier](text, rng)
        if tier == "T2":
            name = "file_%02d%s" % (index, os.path.splitext(name)[1])
        files.append((name, transformed))
    return files


def remove_tree(path):
    """Removes path when it exists."""
    if os.path.isdir(path):
        shutil.rmtree(path)
    elif os.path.exists(path):
        os.unlink(path)


def build(args):
    """Builds every transformed target, its manifest and the scan symlinks."""
    work = os.path.expanduser(args.work)
    source_root = os.path.expanduser(args.source)
    targets_root = os.path.join(work, "targets")
    scan_root = os.path.join(work, "scan")
    remove_tree(targets_root)
    remove_tree(scan_root)
    os.makedirs(scan_root)
    manifest = []
    rng = random.Random(args.seed)
    for tier in args.tiers:
        for category in CATEGORIES:
            source_dir = os.path.join(source_root, category)
            if not os.path.isdir(source_dir):
                continue
            names = sorted(os.listdir(source_dir))
            if args.limit:
                names = names[:args.limit]
            for package in names:
                source = os.path.join(source_dir, package)
                if not os.path.isdir(source):
                    continue
                files = transform_package(source, tier, rng)
                if not files:
                    continue
                target = os.path.join(targets_root, tier, category, package)
                os.makedirs(target, exist_ok=True)
                written = []
                for name, text in files:
                    path = os.path.join(target, name)
                    with open(path, "wb") as handle:
                        handle.write(text.encode("utf-8", "surrogateescape"))
                    written.append({"name": name, "bytes": len(text)})
                link = os.path.join(scan_root, "%s__%s__%s" % (tier, category, package))
                os.symlink(target, link)
                manifest.append({"tier": tier, "category": category, "package": package,
                                 "source": source, "target": target, "files": written})
    with open(os.path.join(work, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=1)
    print("targets", len(manifest), "scan links", len(os.listdir(scan_root)))


def main():
    """Parses arguments and builds the benchmark."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", default=os.path.expanduser("~/pg-v4"))
    parser.add_argument("--source", default=os.path.expanduser("~/pg-detailed/targets"))
    parser.add_argument("--tiers", default=",".join(TIERS))
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--seed", type=int, default=20261027)
    args = parser.parse_args()
    args.tiers = tuple(item for item in args.tiers.split(",") if item in TIERS)
    os.makedirs(os.path.expanduser(args.work), exist_ok=True)
    build(args)


if __name__ == "__main__":
    main()
