# 02 — Testing system design ("Tireless Hand")

## One-paragraph pitch (goes into the write-up)
A layered, oracle-driven UI testing system. **Specs** drive the real cockpit in a browser from a known state that's set through
the control API. **Oracles** compare what the operator *sees* with ground truth (API + socket), across **viewports** and under
**injected faults**. Every run records **real-time video, screenshots, a Playwright trace and a JSON verdict**. A **mutation lab**
proves each scenario catches its bug class: the scenario passes on the clean build and fails on a mutant with a precise
message. An optional **LLM vision judge** (Gemini Flash) adds a semantic "does this screen make sense to an operator?" check for things selectors can't express.

## Components
| # | Component | Path | Job |
|---|---|---|---|
| C1 | Environment controller | `qa/lib/api.ts` | Typed wrapper over `/api`: `health()`, `devices()`, `state()`, `sim(action)`, `command(id,type)`, `addDrone()`, `removeDrone()`, `video()`, `fault()`, `clearFaults()`, `waitFor(pred)` |
| C2 | Cockpit page object | `qa/lib/cockpit.ts` | `open()`, `waitReady()`, `selectDrone(id)`, `readTelemetry()` → `{battery:number…}`, `flightPill(id)`, `videoLabel()`, `badge()` |
| C3 | Oracles | `qa/lib/oracles.ts` | `expectStatusMatchesTruth`, `expectTelemetryMatchesState(tol)`, `expectVisibleAndUsable(locator)` (in viewport, not covered, via elementFromPoint), `expectNoHorizontalScroll`, `expectNoOverlap(a,b)`, `expectTextNotHtml` |
| C4 | Screen contracts | `qa/contracts/*.json` | Declarative "this screen must show X, Y, Z (role/name/testid), with the main action reachable", checked by one generic spec on every route and viewport. This is how we catch "button removed" mutations on screens we've never seen. |
| C5 | Scenario specs | `qa/scenarios/Sxx-*.spec.ts` | One user-meaningful scenario each: Arrange (API) → Act (UI) → Assert (oracles). Tagged `@visual @responsive @security …` |
| C6 | Fixtures | `qa/lib/fixtures.ts` | `test` extended with `api`, `cockpit`, an **isolated drone** fixture (adds its own drone, removes it after, so it doesn't clobber others), a `faultLock` fixture |
| C7 | Evidence recorder | `qa/playwright.config.ts` + `qa/tools/evidence.ts` | `video:'on'`, `trace:'on'`, `screenshot:'on'`, slowMo optional for readable videos; copies artefacts to `evidence/Sxx/<clean|mutant>/`, writes `verdict.json` |
| C8 | Mutation lab | `qa/mutations/Mxx-*.patch` + `qa/tools/mutate.sh` | Apply patch to `product/` → rebuild frontend → run the mapped scenarios → revert. Output: `evidence/mutation-matrix.md` (scenario × mutant: caught / missed) |
| C9 | LLM judge (optional) | `qa/tools/judge.ts` | Screenshot + a screen contract → Gemini 2.5 Flash → `{ok, issues[]}`. Rate-limited, cached, advisory only (never the sole reason for a fail, to avoid false positives) |
| C10 | Runner / report | `qa/tools/run.sh` | `run.sh [clean\|Mxx] [grep]`, then an HTML report + summary table |

Stack: **Playwright Test + TypeScript** (Node 26 here), Chromium; `@axe-core/playwright` for a11y. Keep dependencies minimal.

## Rules that make it precise
- Assert on **meaning** (role/testid/text semantics, numeric tolerance), never on exact pixels or copy wording.
- Poll with `expect.poll` / `toPass` with sensible timeouts (live data is 1–2 Hz). No fixed `waitForTimeout` except in the recorded "show" pauses.
- Every spec is **self-contained**: it sets its own state via the API and cleans up (faults cleared, extra drones removed).
- Failure messages must name the user impact: e.g. `"Drone 2 shown as in_flight but API says landed (stale status)"`.

## Mutation lab details (this is our proof engine)
- Frontend-only mutants: patch `product/frontend/src/**`. With `docker compose watch`/the dev override, Vite hot-reloads, so no rebuild is needed.
- Each mutant = one `.patch` + a header comment: `# M03 | category | targets: S05 | "Drone shown online when offline"`.
- `mutate.sh Mxx` must take `locks/app.lock`, `git apply` inside `product/`, wait for HMR, run the targeted specs, `git apply -R`, and release the lock.
- **Always revert.** `product/` must be clean (`git -C product status --porcelain` is empty) whenever you don't hold the lock.
