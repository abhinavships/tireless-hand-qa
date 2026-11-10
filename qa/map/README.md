# Map lab (Level 2 niche: maps & geospatial)

Blind QA for the cockpit's Cesium 3D map. It reads the live scene graph from outside the app (`anatomy.ts`: React fiber on `[data-testid="map-canvas"]` → `Viewer`), compares it with the websocket frames the browser received (`Tap` in `auto/lib.ts`), and judges it with tolerances learned on the clean build.

| File | Role |
|---|---|
| `anatomy.ts` | Scene snapshot: entities, WGS84 position, model heading from the orientation quaternion, labels, tracks, camera, `drillPick`, globe height |
| `learn.ts` | Learner v2: visual states + a calibration flight that learns each metric's noise and derives tolerances; refuses to learn a broken build |
| `inspector.ts` | Blind inspector, 15 checks G1–G15 (G15 = icon census); headed runs expose the browser over CDP :9222 |
| `contract.ts` | Check language ("what the map draws = this telemetry field") and a deterministic evaluator over the whole fleet |
| `discover.ts` | Agent discovers checks: local LLM reads the map code + real messages and proposes checks; only those that hold on the clean build are kept; false ones go back to the LLM with evidence for one repair round; cumulative in `out/discovered.json` |
| `trial.ts` | One command: saboteur (separate process) → blind inspector → referee (sha256 check, score, revert) |
| `matrix.sh` | Plant every `MAPxx` bug (and a clean control), run the inspector, write `out/matrix.jsonl` |
| `learner-matrix.sh` | Plant bugs and run the learner; it must refuse each broken build (`out/learner-matrix.jsonl`) |
| `report.py` | Build `submission/map-lab/index.html` from the outputs above |

## Learner v2

The calibration flight samples the scene about 8 times a second for `CAL_SECONDS` (25) and records, per sample, the error between what the map draws and the frame it is showing:

- position, heading, 3D height, map-vs-panel distance, track end gap
- wire-to-map latency per position message (arrival → first snapshot showing it or something newer)
- telemetry interval and probe speed (context)

`tolerance = max(floor, p99 × 1.5 + margin)`; the latency tolerance is also capped at 0.8 × the telemetry interval, because a map that has not drawn a message before the next one arrives is showing the previous message.

Self-distrust: if the build breaks physical sanity bounds (more than 5 m off, heading more than 10° off, height more than 5 m off, latency more than 0.75 of the telemetry interval), the learner writes `out/map-model.rejected.json`, keeps the old model, and exits 3.

## Planted bugs

`MAP01`–`MAP15` in `qa/mutations/`. `MAP14` (map one message behind the wire, track included) is visible only to G14. `MAP15` draws sea-level altitude as WGS84 ellipsoid height, a geoid/ellipsoid datum mix-up. `MAP08` is indistinguishable on this build because of product finding G13 (stale docks never turn offline).

## Run

```bash
npm run map:discover          # LLM proposes checks, clean build filters them (needs the GPU tunnel)
npm run map:trial             # secret random map bug vs blind QA (npm run map:trial -- MAP04 | none)
HEADLESS=0 npm run map:trial  # watch it; CDP on :9222
npx tsx map/learn.ts          # on the clean build, holding .context/locks/app.lock
npx tsx map/inspector.ts      # HEADLESS=0 to watch, PACE=1.5 slower
map/matrix.sh [MAPxx …]
map/learner-matrix.sh [MAPxx …]
python3 map/report.py
```

Hub (`npm run hub`, :4700): stage 5 = secret map bug vs inspector, stage 6 = secret map bug vs learner.
