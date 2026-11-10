#!/usr/bin/env bash
# Deterministic sync: compose cp -> Vite HMR (static dashboard needs no restart).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
# D21 submission pause: only the newest master decision controls this gate.
if [[ -f .context/decisions.md ]] && [[ $(rg -m1 '^- ' .context/decisions.md) == *'D21: PAUSE'* ]]; then
 echo 'D21 PAUSE: no new mutation/browser run started.' >&2
 exit 94
fi
id=${1:?Usage: mutate.sh Mxx|clean [--base F-auth] [--targeted|--probe] [Playwright options]}; shift
base='';mode=full;args=()
while (( $# )); do
 case "$1" in
 --base) base=${2:?--base requires F-auth}; shift 2;;
 --targeted) mode=targeted; shift;;
 --probe) mode=probe; shift;;
 *) args+=("$1"); shift;;
 esac
done
[[ "$id" == clean || "$id" =~ ^M[0-9]{2}[a-z]?$ ]] || { echo 'Expected clean or Mxx variant' >&2; exit 2; }
[[ -z "$base" || "$base" == F-auth ]] || { echo 'Only F-auth base is supported' >&2; exit 2; }
[[ "$id" != clean || "$base" == F-auth ]] || { echo 'Clean overlay run requires --base F-auth; ordinary clean uses run.sh' >&2; exit 2; }
patch='';basepatch='';markers=();files=();applied=0;base_applied=0
if [[ "$id" != clean ]]; then
 patches=(qa/mutations/"$id"-*.patch)
 [[ ${#patches[@]} == 1 && -f ${patches[0]} ]] || { echo 'Expected one mutant patch' >&2; exit 2; }
 patch=${patches[0]}
 if rg -q BASELINE_ONLY "$patch"; then echo "$id is baseline-only; cannot inject." >&2; exit 3; fi
 if rg -q AUTH_FIXTURE "$patch" && [[ "$base" != F-auth ]]; then echo "$id requires --base F-auth" >&2; exit 2; fi
 markers+=("$id")
fi
if [[ -n "$base" ]]; then basepatch="qa/mutations/$base.patch"; [[ -f "$basepatch" ]] || exit 2; markers+=("$base"); export AUTH_FIXTURE=1; fi
if [[ "$mode" != probe ]] && ! rg -q APP_LOCK_TOKEN qa/lib/fixtures.ts; then echo 'T01 lock borrowing required; no mutation applied.' >&2; exit 9; fi
lock="$ROOT/.context/locks/app.lock"
mkdir -p "$(dirname "$lock")"
deadline=$((SECONDS+${APP_LOCK_WAIT_SECONDS:-1200}))
until mkdir "$lock" 2>/dev/null; do
 if (( SECONDS >= deadline )); then cat "$lock/owner" >&2; echo 'Lock timeout; no product changes made.' >&2; exit 4; fi
 sleep 1
done
export APP_LOCK_TOKEN="t05-$$-$RANDOM-$RANDOM"
served_url() {
 case "$1" in
 frontend/src/*) printf 'http://localhost:4010/%s' "${1#frontend/}";;
 backend/public/dashboard.html) printf 'http://localhost:4000/dashboard';;
 *) return 1;;
 esac
}
sync_files() {
 for file in "${files[@]}"; do
  service=${file%%/*}
  (cd product && docker compose cp "$file" "$service:/app/$file") || return 1
 done
}
verify_served() {
 local want=$1 url body ready file marker attempt
 for file in "${files[@]}"; do
  url=$(served_url "$file") || return 1
  ready=0
  for attempt in {1..40}; do
   if body=$(curl -fsS "$url"); then
    if [[ "$want" == clean ]]; then
     ready=1
     for marker in "${markers[@]}"; do if rg -q "mutation-lab:$marker" <<< "$body"; then ready=0; fi; done
    else
     ready=1
     if [[ -n "$basepatch" ]] && rg -Fq "+++ b/$file" "$basepatch"; then rg -q "mutation-lab:$base" <<< "$body" || ready=0; fi
     if [[ -n "$patch" ]] && rg -Fq "+++ b/$file" "$patch"; then rg -q "mutation-lab:$id" <<< "$body" || ready=0; fi
    fi
    (( ready )) && break
   fi
   sleep 0.5
  done
  (( ready )) || return 1
 done
}
cleanup() {
 status=$?
 cd "$ROOT"
 trap - EXIT INT TERM
 if (( applied )); then git -C product apply -R "../$patch" || { echo 'CRITICAL mutant revert failed; lock retained.' >&2; exit 90; }; fi
 if (( base_applied )); then git -C product apply -R "../$basepatch" || { echo 'CRITICAL base revert failed; lock retained.' >&2; exit 90; }; fi
 if (( applied || base_applied )); then
  if ! sync_files || ! verify_served clean; then echo 'CRITICAL clean source not served; lock retained.' >&2; exit 91; fi
 fi
 if [[ -n $(git -C product status --porcelain) ]]; then echo 'CRITICAL product dirty; lock retained.' >&2; exit 92; fi
 [[ $(cat "$lock/token") == "$APP_LOCK_TOKEN" ]] || { echo 'Lock ownership changed; refusing release' >&2; exit 93; }
 rm "$lock/owner" "$lock/token"
 rmdir "$lock"
 exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'codex-t05 T05 %s %s pid=%s\n' "$id" "$(date -u +%FT%TZ)" "$$" > "$lock/owner"
printf '%s' "$APP_LOCK_TOKEN" > "$lock/token"
[[ -z $(git -C product status --porcelain) ]] || { echo 'Product dirty before mutation; refusing.' >&2; exit 5; }
while IFS= read -r file; do files+=("$file"); done < <({ [[ -z "$basepatch" ]] || sed -n 's|^+++ b/||p' "$basepatch"; [[ -z "$patch" ]] || sed -n 's|^+++ b/||p' "$patch"; } | sort -u)
if [[ -n "$basepatch" ]]; then git -C product apply "../$basepatch"; base_applied=1; fi
if [[ -n "$patch" ]]; then git -C product apply "../$patch"; applied=1; fi
sync_files
verify_served mutant || { echo 'Applied mutation marker not served.' >&2; exit 7; }
if [[ "$mode" == probe ]]; then echo "$id base=${base:-none} apply/served/revert probe passed (no browser)."; exit 0; fi
metadata=${patch:-$basepatch}
targets=$(head -1 "$metadata" | sed -E 's/.*targets: ([^|]+) \|.*/\1/' | rg -o 'S[0-9]{2}' | paste -sd '|' -)
case "$id" in M03) targets='S05\(a\)';; M03b) targets='S05\(c\)';; M10) targets='S09.*cockpit';; esac
label="mutant-$id"; [[ "$id" != clean ]] || label=clean
export RUN_ID="${RUN_ID:-t05-$id-$(date +%s)-$RANDOM}"
cd qa
if [[ "$mode" == targeted ]]; then exec_args=(--grep "$targets" --grep-invert '@finding'); else exec_args=(--grep-invert '@finding'); fi
set +e
AGENT_NAME=codex-t05 ./tools/run.sh "$label" "${exec_args[@]}" "${args[@]}"
status=$?
set -e
# Repeat-aware private collection avoids the known shared fallback collision.
if [[ -n ${RUN_ID:-} && -f "test-results/$RUN_ID/results.json" ]]; then RUN_LABEL="$label" node --import tsx mutations/collect.ts; fi
node --import tsx tools/matrix.ts
exit "$status"
