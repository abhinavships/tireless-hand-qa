#!/usr/bin/env bash
# Keep full-suite collateral evidence separate so canonical targeted proofs survive.
set -uo pipefail
cd "$(dirname "$0")/../.."
ROOT=$PWD
# D21 submission pause: only the newest master decision controls this gate.
if [[ -f .context/decisions.md ]] && [[ $(rg -m1 '^- ' .context/decisions.md) == *'D21: PAUSE'* ]]; then
 echo 'D21 PAUSE: no new mutation/browser run started.' >&2
 exit 94
fi
mkdir -p qa/mutations/logs
for id in "$@"; do
 projects=(${MUTATION_PROJECTS:-desktop})
 if [[ "$id" == M09 || "$id" == M09b ]]; then
  [[ " ${projects[*]} " == *' phone '* ]] || projects+=(phone)
 fi
 base_args=()
 [[ "$id" != M12 && "$id" != M16 ]] || base_args=(--base F-auth)
 for project in "${projects[@]}"; do
  echo "Full spec suite $id $project $(date -u +%FT%TZ)"
  for group in 'S00|S01|S02' 'S03' 'S04' 'S05' 'S06' 'S07' 'S08' 'S09' 'S10|S11' 'S12|S13|S17'; do
  slug=${group//|/-}
  EVIDENCE_ROOT="$ROOT/evidence/full-suite/$id/$project" ./qa/tools/mutate.sh "$id" ${base_args[@]+"${base_args[@]}"} --project "$project" --grep "$group" > "qa/mutations/logs/$id-full-$project-$slug.log" 2>&1
  status=$?
  echo "$id $project exit=$status $(date -u +%FT%TZ)"
  [[ -z $(git -C product status --porcelain) ]] || exit 90
  case "$status" in 4|5|7|8|9|90|91|92) echo 'Infrastructure prerequisite failed; stopping.'; exit "$status";; esac
  done
 done
 done
