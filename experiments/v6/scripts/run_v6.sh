#!/bin/bash
set -u
TAG=$1
shift
FLAGS="$@"
WORK=${PG_WORK:-$HOME/pg-v6}
PACKGUARD=${PACKGUARD:-$WORK/build/packguard}
REFS=${PG_REFS:-$HOME/packguard-data/v1/malware_js}
cd "$WORK"
for SET in val test; do
  if [ "$SET" = val ]; then SCAN=$WORK/val/scan; else SCAN=${PG_TEST_SCAN:-$HOME/pg-v4/scan}; fi
  rm -rf "$SET/$TAG" && mkdir -p "$SET/$TAG"
  /usr/bin/time -v "$PACKGUARD" $FLAGS -d "$SET/$TAG" "$REFS" "$SCAN"/* > /dev/null 2> "$SET/$TAG.log"
done
echo finished
