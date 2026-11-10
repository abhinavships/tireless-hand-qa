# T03 — Live-data truth scenarios: S03, S04, S05, S06, S07, S14, S15

**Owns:** `qa/scenarios/S03-*` … `S07-*`, `S14-*`, `S15-*`, `qa/lib/ext/t03.ts`
Ground truth = `/api/control/state` + a raw socket (`lib/socket.ts`). Tolerances: battery ±2%, altitude ±2 m, speed ±1 m/s, allowing 2 s of lag.
- Use the `isolatedDrone` fixture for flights (S03/S04/S14). Faults (S05/S06/S07/S15) need `appLock` + `workers:1` and **must clear faults in finally**.
- S05/S15 will probably FAIL on the clean baseline (there's no stale indicator). That's a REAL finding → reproduce it 2x, record the video, and write it up as a baseline bug. Split the spec into (a) a hard assertion that must hold on the clean app (e.g. the badge/health truth) and (b) the `@finding` assertion, so the clean suite stays green where it should.
- S07: `<video>` playing = `currentTime` advances over 2 s and `videoWidth>0`; label must match. Stop video via the API → label `off`.
- S14: find how CesiumMap exposes entities (read `product/frontend/src/components/CesiumMap.tsx`; maybe `window.__cesiumViewer`, or add nothing and read via `page.evaluate` on the Cesium viewer). If it's impossible without source changes, downgrade to P2 and report.
Request any mutants you need from T05 (via your report), with the exact expected failure message.
