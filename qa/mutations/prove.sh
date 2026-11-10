#!/usr/bin/env bash
# Sequential targeted proofs; each mutate invocation independently acquires/releases app.lock.
set -uo pipefail
cd "$(dirname "$0")/../.."
mkdir -p qa/mutations/logs
for id in "$@"; do
 project=desktop
 [[ "$id" == M09 || "$id" == M09b ]] && project=phone
 echo "Starting $id ($project) $(date -u +%FT%TZ)"
 ./qa/tools/mutate.sh "$id" --targeted --project "$project" > "qa/mutations/logs/$id-targeted.log" 2>&1
 status=$?
 echo "$id exit=$status $(date -u +%FT%TZ)"
 [[ -z $(git -C product status --porcelain) ]] || { echo 'Dirty product: stopping'; exit 90; }
 case "$status" in 4|5|7|8|9|90|91|92) echo 'Prerequisite/infrastructure failure; stopping batch.'; exit "$status";; esac
 done
