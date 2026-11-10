#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
label=clean
if [[ "${1:-}" == clean || "${1:-}" =~ ^mutant-M[0-9]+[a-z]?$ ]]; then label="$1"; shift; fi
export RUN_LABEL="$label"
exec npx tsx lib/runner.ts "$@"
