#!/usr/bin/env bash
# Point the calibrating map learner at secretly broken builds: it must refuse each one and accept the clean build.
#   map/learner-matrix.sh [ids…]   → map/out/learner-matrix.jsonl (the real map-model.json is never touched)
cd "$(dirname "$0")/.." || exit 1
out=map/out/learner-matrix.jsonl
if [ $# -gt 0 ]; then ids=("$@"); else ids=(none MAP01 MAP02 MAP05 MAP06 MAP14 MAP15); : > "$out"; fi
cleanup() { npx tsx blind/saboteur.ts revert > /dev/null 2>&1; rm -rf ../.context/locks/app.lock; }
trap 'cleanup; exit 1' INT TERM
for id in "${ids[@]}"; do
  until mkdir ../.context/locks/app.lock 2>/dev/null; do sleep 5; done
  npx tsx blind/saboteur.ts plant "$id" > /dev/null
  ev=$(EVENTS=1 CAL_SECONDS=${CAL_SECONDS:-18} MAP_MODEL_FILE=map-model.relearn.json npx tsx map/learn.ts 2>/dev/null | grep -E '"event":"(rejected|learned)"' | head -1)
  cleanup
  echo "{\"id\":\"$id\",\"result\":${ev:-null}}" >> "$out"
  echo "$id done"
done
