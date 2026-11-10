#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.."
ROOT=$PWD
for group in 'S05' 'S06' 'S07' 'S08' 'S09' 'S10|S11' 'S12|S13|S17'; do
 slug=${group//|/-}
 EVIDENCE_ROOT="$ROOT/evidence/full-suite/M04/desktop" ./qa/tools/mutate.sh M04 --project desktop --grep "$group" > "qa/mutations/logs/M04-full-desktop-$slug.log" 2>&1
 status=$?
 echo "M04 resume $group exit=$status $(date -u +%FT%TZ)"
 [[ -z $(git -C product status --porcelain) ]] || exit 90
 case "$status" in 4|5|7|8|9|90|91|92|93) exit "$status";; esac
 done
exec ./qa/mutations/full-suite.sh M09 M13 M14 M03 M05 M06 M07 M08 M10 M03b M03c M05b M09b M12 M16
