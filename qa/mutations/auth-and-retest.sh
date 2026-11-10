#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.."
mkdir -p qa/mutations/logs
run() {
 id=$1;shift
 echo "Starting $id $(date -u +%FT%TZ)"
 ./qa/tools/mutate.sh "$id" "$@" > "qa/mutations/logs/$id-targeted.log" 2>&1
 status=$?
 echo "$id exit=$status $(date -u +%FT%TZ)"
 [[ -z $(git -C product status --porcelain) ]] || exit 90
 case "$status" in 2|3|4|5|7|8|9|90|91|92|93) exit "$status";; esac
}
run M03b --targeted --project desktop --grep 'S05\(c\)'
run M05b --targeted --project desktop
run M12 --base F-auth --targeted --project desktop
run M16 --base F-auth --targeted --project desktop
