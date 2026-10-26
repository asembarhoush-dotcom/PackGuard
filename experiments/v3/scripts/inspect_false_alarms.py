import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze_v3 import chunk_bytes, chunk_kind, ncd


def load_report(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def short(text, limit=160):
    text = text.replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t")
    return text if len(text) <= limit else text[:limit] + "..."


def package_score(report):
    values = [ncd(c) for c in report["chunks"]
              if not c.get("ignored", False) and ncd(c) is not None]
    return min(values) if values else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default=os.path.expanduser("~/pg-v2"))
    ap.add_argument("--tag", required=True)
    ap.add_argument("--threshold", type=float, default=0.19)
    ap.add_argument("--limit", type=int, default=5)
    ap.add_argument("--width", type=int, default=160)
    ap.add_argument("--package", default="")
    args = ap.parse_args()

    folder = os.path.join(args.work, "reports", args.tag)
    found = 0
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".json") or not name.startswith(("ben_general__", "ben_scripts__")):
            continue
        if args.package and args.package not in name:
            continue
        report = load_report(os.path.join(folder, name))
        score = package_score(report)
        if score is None or score > args.threshold:
            continue
        found += 1
        print(f"\n{name[:-5]}  score {score:.4f}  low_confidence {report.get('low_confidence', False)}")
        rows = [c for c in report["chunks"]
                if not c.get("ignored", False) and chunk_kind(c) != "install_script"
                and ncd(c) is not None]
        for chunk in sorted(rows, key=lambda c: ncd(c))[:args.limit]:
            match = chunk.get("match", {})
            print(f"  {chunk.get('file')} @{chunk.get('start')} kind {chunk_kind(chunk)} "
                  f"bytes {chunk_bytes(chunk)} ncd {ncd(chunk):.4f}")
            print(f"    match {match.get('file')} package {match.get('package')} @{match.get('start')}")
            print(f"    target: {short(chunk.get('text', ''), args.width)}")
    print(f"\n{found} benign packages at or below {args.threshold}")


if __name__ == "__main__":
    main()
