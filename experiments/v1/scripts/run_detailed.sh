#!/bin/bash
set -uo pipefail

if [ $# -ne 3 ]; then
    echo "usage: run_detailed.sh <packguard binary> <v1 malware_js dir> <test dir>" >&2
    exit 2
fi
PG=$1
V1=$2
D=$3

cd "$D/targets"
if [ ! -f "$D/order.txt" ]; then
    python3 -I - > "$D/order.txt" <<'EOF'
import os, random
cats = ["mal_known", "mal_newver", "mal_newname", "ben_popular", "ben_longtail"]
lists = {c: sorted(os.listdir(c)) for c in cats}
rng = random.Random(7)
for c in cats:
    rng.shuffle(lists[c])
out = []
while any(lists.values()):
    for c in cats:
        if lists[c]:
            out.append(f"{c}/{lists[c].pop()}")
print("\n".join(out))
EOF
fi

mkdir -p "$D/reports"
todo=()
while read -r p; do
    [ -f "$D/reports/$(basename "$p").json" ] || todo+=("$p")
done < "$D/order.txt"
echo "packages still to scan: ${#todo[@]}" >> "$D/run.log"
/usr/bin/time -v "$PG" -k 32 -d "$D/reports" "$V1" "${todo[@]}" >> "$D/run.stdout" 2>> "$D/run.log"
echo "EXIT=$?" >> "$D/run.log"
