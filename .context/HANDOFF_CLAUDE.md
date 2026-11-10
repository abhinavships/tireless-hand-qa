# Handoff: master agent (Claude) → next Claude account

Project root: `/Users/abhinavsden/orca/workspaces/hackathon_the_tireless_hand/numbfish` (git worktree, branch `numbfish`).
User: Abhinav (solo team "Tireless Hand"). FlytBase AHC SWE hackathon, "Agentic Software Testing".
Read first: `.context/README.md`, `.context/00_MISSION.md`, `.context/01_PRODUCT_MAP.md`, `.context/decisions.md` (newest on top).
Secrets: `.context/local/` (gitignored). Never copy them into code, reports, logs or messages.

## Status
- **Level 1: SUBMITTED.** Final Doc (narrated videos) is in Drive folder `AHC L1 Submission - Tireless Hand (Abhinav) - NARRATED`. Older Docs are renamed "OBSOLETE". Code zip: `submission/code.zip`.
- **Level 2: IN PROGRESS.** Brief: pick ONE niche category, plant bugs in it, and have the QA find them. The user is choosing between **Maps** (nearly complete, below) and **Security**. Ask the user which one before building more.

## What exists (all under `qa/`)
| Layer | Path | Run | State |
|---|---|---|---|
| Playwright harness + L1 scenarios | `lib/`, `scenarios/`, `tools/` | `./tools/run.sh clean --grep S01` | done (Codex T01–T05) |
| Blind trial: saboteur / inspector (11 checks) / referee | `blind/` | `npm run blind` (:4600) | done, verified |
| Wire-to-pixel ledger (exact screen = message match) | `blind/ledger.ts` | used by inspector C10/C11 | done |
| Autonomous engine: learn → 360 combos → 30 pairwise → 7 invariants → cluster | `auto/` | `npm run auto:learn`, `npm run auto:run` | done; model at `auto/out/model.json` |
| Hub dashboard (all stages, "How it works" tab) | `hub/hub.ts` | `npm run hub` (:4700) | done; stage 5 added but hub must be RESTARTED to show it |
| Map lab (Level 2 candidate) | `map/anatomy.ts`, `map/learn.ts`, `map/inspector.ts` | `npx tsx map/learn.ts`, `npx tsx map/inspector.ts` | done; 13 checks G1–G13 |
| Map mutants | `mutations/MAP01–13-*.patch` | saboteur `plant MAPxx` / `random-map` | done |
| Local AI models (Codex T08) | `models/` | see `models/README.md` | done; advisory only; GPU tunnel on 127.0.0.1:11435 |

## Map lab: how it works
- Reads the live Cesium scene from outside the app: React fiber on `[data-testid="map-canvas"]` → viewer ref → entities, camera, `cartesianToCanvasCoordinates`, `drillPick`.
- Compares with the websocket messages the browser received (Tap in `auto/lib.ts`) and with the learned map model (`map/out/map-model.json`).
- Calibration on the clean build: position error 0 m, height 30 = 30, heading 46° = 46°, map dock→drone distance = panel home distance.
- Clean run: 12/12 pass + **real finding G13**: stale docks keep the online icon (the map only redraws when a message arrives).

## Map proof matrix (`map/out/matrix.jsonl`; run by `map/matrix.sh`, may still be running MAP09–13)
| Build | Checks that failed |
|---|---|
| none (control) | none (G13 = known finding) ✔ no false alarms |
| MAP01 swapped coords | G2 G4 G6 G7 G8 |
| MAP02 40 m offset | G2 G6 G7 |
| MAP03 invisible icon | G8 |
| MAP04 height label ASL | G3 |
| MAP05 heading inverted | G4 |
| MAP06 frozen position | G2 G3 G6 G7 G8 |
| MAP07 track stuck | G7 G9 |
| MAP08 dock always online | none: indistinguishable, because the baseline already has bug G13 (excluded from `random-map`) |
| MAP09–13 | check `matrix.jsonl` when the run finishes |

## Codex status (read `.context/reports/`)
- T01–T03, T06 DONE. T04, T05, T07 NEEDS_REVIEW (all paused by D21).
- **T08 (codex-models)**: local Qwen2.5-Coder 7B + Qwen3-VL 8B via `qa/models/`. Key lesson: the coder model hallucinated line citations; `models/source.ts` now keeps only issues whose file:line + exact excerpt match the source. Its pipeline run waits for the app lock to be free.
- Orca cross-agent messaging failed for Codex; coordinate through `.context/reports/` and `decisions.md`.
- A T09 security brief was NOT written.

## Running processes (check with `lsof -i :PORT`)
- Product stack (docker compose, colima): :4010 cockpit, :4000 backend.
- Hub :4700 (old code; restart after the matrix finishes).
- File server :8090, Playwright report :9323.
- Background: `qa/map/matrix.sh` (holds `.context/locks/app.lock` per run).

## Rules that must hold
- One app instance: anything global (faults, mutations, product edits) must hold `.context/locks/app.lock`.
- Before and after any run: `git -C product status --porcelain` must be empty, no leftover drones (only Drone 1–4), `curl -s localhost:4000/api/control/fault` → no faults.
- Model output is advisory; only deterministic oracles decide pass/fail.
- Learned models must be learned on the clean build (`auto/out/model.json`, `map/out/map-model.json`).

## Next steps
1. When `map/matrix.sh` finishes: summarise MAP09–13, restart the hub (`pkill -f hub/hub.ts; cd qa && npm run hub`), try stage 5.
2. Ask the user: Level 2 niche = Maps or Security.
3. If Maps: write the L2 evaluation doc (system design of the map lab + scenarios G1–G13 with videos + finding G13) and record videos (`HEADLESS=0` on the map inspector, or the hub stream).
4. Optionally wire Codex's `model-review` events into the hub as an advisory panel.

## Update 2026-09-26 (second Claude session)
- Niche chosen: **Maps** (D22). MAP09 was left planted by a dead matrix run; reverted, stale lock cleared.
- Learner v2 (`qa/map/learn.ts`): calibration flight → tolerances from clean-build noise, latency capped by telemetry interval, refuses broken builds (exit 3, `map-model.rejected.json`). Old model kept as `map/out/map-model.v1.json`.
- Inspector: tolerances from the model, new G14 (wire→map latency), optional Qwen3-VL review of the map screenshot (`model-review` event, advisory).
- New mutants MAP14 (one-message lag), MAP15 (geoid datum). Hub stage 6 + calibration and advisory panels. Hub restarted.
- `map/matrix.sh` (resumable, trap-reverts on kill), `map/learner-matrix.sh`, `map/report.py` → `submission/map-lab/index.html` (system design + proof matrix).
- Leftover drones in the fleet beyond Drone 1–4 (e.g. drone-358, drone-385) were NOT deleted (needs user permission).
