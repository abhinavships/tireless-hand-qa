# Tireless Hand QA harness

Requires Node 20+ and the already running cockpit at `http://localhost:4010`, API at `http://localhost:4000`.

```bash
npm ci
npx playwright install chromium
./tools/run.sh clean --grep S00 --repeat-each=3
```

Run from `qa/`. The smoke expects the four-drone baseline, connected simulator and live video on the first drone. It does not reset shared state. `npm run typecheck` checks all TypeScript.

Projects: desktop 1440×900, tablet 768×1024, phone 390×844 with touch/mobile emulation. Every run records video, trace, screenshot, HTML report, and JSON report under `test-results/${RUN_ID:-default}/`. run.sh generates a unique RUN_ID when absent; specify RUN_ID to find a batch easily. Direct npx playwright uses default if none is supplied. No retries; one worker by default. Every live browser run must hold the shared app lock (D16). run.sh holds it across the entire batch and evidence collection; direct Playwright runs acquire it through globalSetup. Keep batches under five minutes. A parent mutation runner may pass APP_LOCK_TOKEN matching app.lock/token; child globalSetup and appLock fixtures borrow it and never release the parent lock. Invalid inherited tokens fail immediately. New acquisitions export a random token, and releases verify ownership before removing the lock. `SLOWMO=100 ./tools/run.sh clean` slows actions for readable recordings. Override `COCKPIT_URL` and `API_URL` for another deployment.

Evidence is copied to `../evidence/Sxx/clean/` or `../evidence/Sxx/mutant-Mxx/` (optional lowercase suffix supported, e.g. mutant-M03b). `EVIDENCE_ROOT` can redirect collection to a scratch directory for harness validation without replacing qualification evidence. `verdict.json` has the D8 fields `{scenario,project,label,status,message,duration}`; message is the first nonempty assertion-error line, capped at 200 characters; status uses Playwright values (`passed`, `failed`, `timedOut`, `skipped`). Duration is milliseconds. `runs.json` preserves every test/project/repeat verdict and its unique artifact filenames. A scenario verdict fails if any recorded run fails. Re-running a label replaces the prior artifacts tracked in its runs.json and updates manifests. Canonical `video.webm`, `trace.zip`, `screenshot.png` come from desktop first repeat, with CANONICAL_PROJECT=phone|tablet override; if that project is absent, the first available project is used. For multi-page tests such as axe, video selection uses longest duration via ffprobe (largest-file fallback if ffprobe is unavailable). Per-run readable names include project, repeat index and test title. The runner retains the test exit code and collects failures too. Example: `./tools/run.sh mutant-M03 --grep S05 --project desktop`.

Import `test, expect` from `lib/fixtures.ts`. Fixtures: `api`, `cockpit`, `isolatedDrone` (`id`, `deviceId`, `droneId`, `dockId`, `name`, `drone`, `dock`), `appLock`, `faultLock` (alias requiring appLock). The isolated drone is added before the test and deleted in `finally`.

Request `appLock` before global faults, simulator resets/stops, global video operations, runtime restarts, or product mutations. It atomically acquires `.context/locks/app.lock`, records the owner, and releases in `finally`. Do not remove another owner's lock. Lock timeout is 120 seconds. Clear injected faults in the scenario's own `finally` before releasing the fixture.

`ControlApi`: `health`, `devices`, `state`, `sim(action,speed?)`, `command(id,type)`, `addDrone(options)`, `removeDrone(id)`, `video(action,id?)`, `fault(request)`, `faults`, `clearFaults`, `waitFor(asyncPredicate,{timeout,interval,message})`, `waitForDevice(id,present?,timeout?)`. HTTP errors include operation, status and response text.

`Cockpit`: `open`, `waitReady`, `waitRow(id)`, `selectDrone(id)`, `readTelemetry`; `badge`, `flightPill(id?)`, `videoLabel` return locators. Telemetry keys are battery, altRlt, altAgl, altAsl, hspeed, vspeed, heading, wind, homeDistance. Missing values are null, never zero. `waitReady` expects a connected socket, a fleet row and numeric battery, so fault tests should call it before injecting the fault.

Oracles in `lib/oracles.ts`: status compares a locator with explicit truth; telemetry compares projected numeric records with scalar or per-field tolerances (heading wraps at 360°); usability scrolls and checks center hit testing and clipping; horizontal scroll and overlap checks; literal text safety. For live telemetry, obtain a fresh API snapshot inside `expect.poll` / `toPass`, allowing the intended lag and tolerance. The helpers do not infer simulator connectivity from a browser socket badge: those represent different connections.

`TruthSocket`: construct with org id (undefined sends no auth), call `connect`, `subscribe(topic)`, `waitFor(topic,predicate?,timeout?)`, and `close` in `finally`. Reconnection is disabled to make denied-handshake tests explicit. `messages` contains latest observed topic payloads. `topic(deviceId,attribute,orgId?)` builds a public topic. `narrate(page,text)` adds a recording caption; `clearNarration` removes it for unobstructed screenshots.
