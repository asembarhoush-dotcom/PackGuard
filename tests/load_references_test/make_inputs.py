import os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
EXE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "build", "packguard.exe")


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data.encode())


def run(args, log):
    p = subprocess.run([EXE] + args, capture_output=True)
    with open(log, "wb") as f:
        f.write(p.stderr.replace(REPO.encode() + os.sep.encode(), b""))
    print(os.path.basename(log), "exit", p.returncode)


refs = os.path.join(HERE, "refs")
target = os.path.join(HERE, "target@1.0.0")
shutil.rmtree(refs, ignore_errors=True)
shutil.rmtree(target, ignore_errors=True)
x = "".join(f"function steal{i}() {{ return require('os').hostname() + process.env.HOME + '{i}'; }}\n" for i in range(40))
y = "".join(f"var unrelated{i} = [{i}, {i * 7}, {i * 13}].map(function (n) {{ return n * n; }});\n" for i in range(40))
block = "".join(f"const line{i} = 'abcdefghijklmnopqrstuvwxyz'.split('').reverse().join('{i}');\n" for i in range(90))
big = (block[:4096] * 6) + block
write(os.path.join(refs, "groupA", "pkg@1.0.0", "x.js"), x)
write(os.path.join(refs, "groupB", "pkg@2.0.0", "x_copy.js"), x)
write(os.path.join(refs, "groupB", "pkg@2.0.0", "y.js"), y)
write(os.path.join(refs, "groupC", "big@1.0.0", "big.js"), big)
write(os.path.join(refs, "top_level.js"), "module.exports = 'a file directly in the reference folder is its own group';\n")
write(os.path.join(target, "index.js"), x.replace("hostname", "userInfo().username"))
for p in ("0", "1"):
    run(["-j", "2", "-p", p, "-k", "10", "-o", os.path.join(HERE, f"target_report_p{p}.json"), refs, target],
        os.path.join(HERE, f"target_report_p{p}.log"))
