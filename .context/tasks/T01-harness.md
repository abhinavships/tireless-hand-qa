# T01 — Harness + shared library (FIRST, fast: target a usable skeleton in ≤30 min, then iterate)

**Goal:** a working Playwright+TS test system in `qa/` that every other task builds on.
**Owns:** `qa/package.json`, `qa/tsconfig.json`, `qa/playwright.config.ts`, `qa/lib/**` (except `qa/lib/ext/`), `qa/tools/run.sh`, `qa/tools/evidence.ts`, `qa/README.md`, `README.md` (top-level, D10), `qa/scenarios/S00-smoke.spec.ts`

## Deliver
1. `cd qa && npm init` + `@playwright/test`, `@axe-core/playwright`, `socket.io-client`, `typescript`. `npx playwright install chromium`.
2. `playwright.config.ts`: baseURL http://localhost:4010; projects `desktop` (1440x900), `tablet` (768x1024), `phone` (390x844, isMobile, hasTouch);
   `video:'on'`, `trace:'on'`, `screenshot:'on'`, `workers:1` default, retries 0, reporter `list` + `html` + `json` (`qa/test-results/results.json`).
   Env `SLOWMO` → launchOptions.slowMo (for readable recordings).
3. `lib/api.ts` (C1), `lib/cockpit.ts` (C2), `lib/oracles.ts` (C3), `lib/fixtures.ts` (C6: `api`, `cockpit`, `isolatedDrone` [adds a drone with a unique name, yields ids, deletes after], `appLock` [mkdir lock from protocol §5, auto-release]), `lib/overlay.ts` (`narrate(page, "S05 · step 2 · injecting sim-offline")`: a fixed banner at the top of the page, for the videos), `lib/socket.ts` (raw socket.io client for ground truth + security tests).
   Signatures as in `.context/02_SYSTEM_DESIGN.md`. JSDoc each export in one line.
4. `tools/evidence.ts`: after the run, copy each test's video/trace/screens into `evidence/<Sxx>/<label>/` (label from env `RUN_LABEL`, default `clean`) + `verdict.json` {scenario, project, status, error, duration}.
5. `tools/run.sh [label] [playwright args…]` → sets RUN_LABEL, runs, then calls evidence.ts.
6. `S00-smoke.spec.ts`: the badge says connected, 4 drone rows, telemetry has numbers, video label live. It must pass 3x.
7. `qa/README.md`: how to run.

Before building, check the app: `curl localhost:4000/api/health`, open :4010 in Playwright, dump the accessibility tree to confirm the testids.
Report when the skeleton works (status NEEDS_REVIEW), then keep hardening the helpers other tasks request in their reports.

## ROUND 2: master review of the NEEDS_REVIEW at 06:40Z (APPROVED, with fixes below; do these now, they're small)
Review verdict: harness approved. Typecheck + S00 verified independently by master. Lock, isolatedDrone and null-safe telemetry are good.
1. **Canonical video per run (D12):** `evidence.ts` must ALSO write `evidence/<Sxx>/<label>/video.webm` = the **desktop** project's first-repeat
   video (override with env `CANONICAL_PROJECT=phone|tablet` for responsive scenarios). reel.sh picks `video.webm` first; otherwise it would concatenate all 9 runs.
   Same for `trace.zip` and `screenshot.png`. Keep the per-run artifacts too.
2. **Readable artifact names:** `<project>-r<repeat>-<test-title-slug>.{webm,png,zip}` instead of hashes, so a human can find them.
3. `verdict.json.message`: take the first line of the assertion error, trimmed to ≤200 chars (it's shown on the video title cards).
4. The appLock owner string is hard-coded `codex-t01`: use `process.env.AGENT_NAME ?? 'qa'` + the test title.
5. Add `narrate()` calls in S00 as a working example of the overlay for other workers (step banners appear in the video).
6. Add a helper `api.waitForDevice(id, present:boolean)` and `cockpit.waitRow(id)` if not present, since T02/T03 will need them.
Then report DONE and keep serving helper requests from the other reports (check them every ~15 min).

## ROUND 2, item 0 (URGENT, before items 1–6): lock borrowing + per-process outputs → see decisions D15/D16. T05 is BLOCKED on this.
