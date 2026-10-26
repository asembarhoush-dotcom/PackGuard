import json, os, random, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(HERE)), "build", "packguard")

WORDS = ["function", "return", "const", "let", "require('fs')", "module.exports", "process.env",
         "if (", ") {", "} else {", "for (let i = 0; i < n; i++)", "await", "=>", "};", "\n", "  ",
         "JSON.stringify(data)", "callback(null, value)", "options.timeout", "'use strict';", "42"]


def text(rng, family, size):
    fam = random.Random(family)
    out, n = [], 0
    while n < size:
        w = fam.choice(WORDS) if rng.random() < 0.7 else rng.choice(WORDS)
        out.append(w)
        n += len(w)
    return "".join(out)


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="\n") as f:
        f.write(data)


rng = random.Random(20261026)
for d in ("refs", "targets", "batch", "split"):
    shutil.rmtree(os.path.join(HERE, d), ignore_errors=True)
for g in range(60):
    for p in range(5):
        write(os.path.join(HERE, "refs", f"group{g:02d}", f"pkg{g:02d}_{p}@1.0.{p}", "index.js"),
              text(rng, g, rng.randint(200, 1500)))
targets = []
for t in range(12):
    pkg = os.path.join(HERE, "targets", f"target{t:02d}@1.0.0")
    for f in range(1 + t % 3):
        write(os.path.join(pkg, f"file{f}.js"), text(rng, rng.randint(0, 80), rng.randint(300, 20000)))
    targets.append(pkg)
os.makedirs(os.path.join(HERE, "batch"))
os.makedirs(os.path.join(HERE, "split"))

refs = os.path.join(HERE, "refs")
subprocess.run([EXE, "-j", "4", "-k", "3", "-p", "64", "-d", os.path.join(HERE, "batch"), refs] + targets,
               check=True, capture_output=True)
for pkg in targets:
    out = os.path.join(HERE, "split", os.path.basename(pkg) + ".json")
    subprocess.run([EXE, "-j", "64", "-k", "3", "-p", "64", "-o", out, refs, pkg], check=True, capture_output=True)

same = 0
for pkg in targets:
    name = os.path.basename(pkg) + ".json"
    a = json.load(open(os.path.join(HERE, "batch", name)))
    b = json.load(open(os.path.join(HERE, "split", name)))
    a.pop("seconds")
    b.pop("seconds")
    same += a == b
summary = f"targets {len(targets)}, reports identical in batch and split mode (apart from seconds): {same}\n"
write(os.path.join(HERE, "compare.txt"), summary)
print(summary, end="")
sys.exit(0 if same == len(targets) else 1)
