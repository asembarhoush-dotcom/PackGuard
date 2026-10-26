import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ok = True


def check(cond, msg):
    global ok
    print(("PASS " if cond else "FAIL ") + msg)
    ok &= bool(cond)


def load(folder, package):
    with open(os.path.join(HERE, folder, package + ".json"), encoding="utf-8") as f:
        return json.load(f)


def chunks(report):
    return {c["file"]: c for c in report["chunks"]}


def main():
    check(os.path.exists(os.path.join(HERE, "refs", "groupA", "evil@1.0.0", "index.js")),
          "test inputs were generated")

    mixed = load("reports", "mixed@1.0.0")
    c = chunks(mixed)
    check(c["tiny_stub.js"]["kind"] == "js", "tiny JavaScript chunk tagged js")
    check(c["tiny_stub.js"]["ignored"] is True, "tiny JavaScript chunk ignored")
    check(c["big.js"]["kind"] == "js" and "ignored" not in c["big.js"],
          "large JavaScript chunk kept")
    check(c["package.json"]["kind"] == "install_script", "package.json tagged install_script")
    check("ignored" not in c["package.json"], "short install script never ignored")
    check(c["package.json"]["threshold"] == 0.45, "install script uses the script threshold")
    check(c["big.js"]["threshold"] == 0.19, "JavaScript uses the JavaScript threshold")
    check(mixed["flagged"] is False, "mixed package is not flagged")
    check(mixed["score"] == c["big.js"]["ncd"], "package score comes from the kept chunk")
    check(mixed["ignored_small_chunks"] == 1, "one ignored small chunk counted")
    check("low_confidence" not in mixed, "mixed package is not low confidence")

    all_tiny = load("reports", "all_tiny@1.0.0")
    t = chunks(all_tiny)
    check(all_tiny.get("low_confidence") is True, "all-tiny package marked low confidence")
    check(all_tiny["ignored_small_chunks"] == 1, "all-tiny counts the smaller chunk as ignored")
    check("ignored" not in t["largest.js"],
          "largest chunk sets the fallback score")
    check(t["smaller.js"]["ignored"] is True, "smaller chunk stays ignored")
    check(all_tiny["score"] == t["largest.js"]["ncd"], "fallback score is the largest chunk")

    boundary = load("reports", "boundary@1.0.0")
    b = chunks(boundary)
    check("ignored" not in b["exact.js"], "a 256-byte chunk is kept")
    check("low_confidence" not in boundary, "boundary package is not low confidence")

    off = load("reports_m0", "all_tiny@1.0.0")
    o = chunks(off)
    check("ignored" not in o["smaller.js"], "-m 0 keeps every chunk")
    check("ignored_small_chunks" not in off, "-m 0 writes no ignored count")
    check(off["score"] == min(x["ncd"] for x in off["chunks"]), "-m 0 scores every chunk")

    print("ALL PASS" if ok else "SOME FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
