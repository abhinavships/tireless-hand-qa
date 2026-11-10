#!/usr/bin/env bash
# Plant every map bug in turn and run the blind map inspector against each (plus a clean control).
#   map/matrix.sh                 → full matrix (truncates matrix.jsonl)
#   map/matrix.sh MAP09 MAP10     → only these ids (appends)
cd "$(dirname "$0")/.." || exit 1
out=map/out/matrix.jsonl
if [ $# -gt 0 ]; then ids=("$@"); else ids=(none MAP01 MAP02 MAP03 MAP04 MAP05 MAP06 MAP07 MAP08 MAP09 MAP10 MAP11 MAP12 MAP13 MAP14 MAP15); : > "$out"; fi
cleanup() { npx tsx blind/saboteur.ts revert > /dev/null 2>&1; rm -rf ../.context/locks/app.lock; }
trap 'cleanup; exit 1' INT TERM
for id in "${ids[@]}"; do
  until mkdir ../.context/locks/app.lock 2>/dev/null; do sleep 5; done
  npx tsx blind/saboteur.ts plant "$id" > /dev/null
  res=$(PACE=0.4 npx tsx map/inspector.ts 2>/dev/null | grep '"event":"verdict"')
  cleanup
  echo "{\"id\":\"$id\",\"verdict\":${res:-null}}" >> "$out"
  echo "$id done"
done
