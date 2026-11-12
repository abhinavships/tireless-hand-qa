# Tireless Hand

**UI testing that checks what the operator sees against what is actually true.**

A drone operator's cockpit can look healthy while lying: a drone shown as flying after contact is lost, a "connected" badge on a dead socket, a "live" label on a stopped video. Tireless Hand drives the real UI the way an operator would, then compares the screen with ground truth from the API and the live socket. A mutation lab then proves the tests have teeth by injecting bugs and confirming each one is caught.

![Playwright](https://img.shields.io/badge/Playwright-TypeScript-2EAD33) ![Viewports](https://img.shields.io/badge/viewports-phone%20%7C%20tablet%20%7C%20desktop-blue) ![Mutation tested](https://img.shields.io/badge/mutation%20lab-15%20of%2016%20caught-brightgreen) ![Findings](https://img.shields.io/badge/real%20bugs%20found-3-critical)

Built solo for the FlytBase hackathon (agentic UI testing track), against the FlytBase Cockpit and its control panel.

**[Overview video](https://drive.google.com/file/d/1R-7BklS_XhJMI6Cq2811Kpjarf8yRpcx/view)** · **[Full write-up](submission/writeup.final.md)**

## Results

| | |
|---|---|
| Scenarios | 15 specs covering static screens, live data, responsive layout, accessibility and security |
| Viewports | Phone 390×844, tablet 768×1024, desktop 1440×900 |
| Qualification | Every scenario passes 3 times in a row on the clean app, no retries, before it counts |
| Mutation lab | **15 of 16 targeted injected bugs caught**, 1 missed and documented as a known gap |
| Real bugs found in the unmodified app | **3**, two of them security issues |

### Real bugs found

| # | Finding | Impact |
|---|---|---|
| F1 | Lost telemetry is shown as live data | A drone that is out of contact looks healthy and in flight, with no stale warning |
| F2 | No tenant isolation on the live-data socket | A client with another organisation's id, or none, receives the full fleet list and telemetry |
| F3 | Stored XSS through drone names in the control panel | A crafted drone name runs script in every operator's session |

Each has a reproducing scenario, a positive control to rule out a broken probe, and a recorded video.

## How one scenario runs

1. **Arrange.** Set a known state through the control API: add an isolated drone, take off, inject a fault.
2. **Act.** A page object drives Chromium at each viewport, with a step caption drawn on screen.
3. **Assert.** Oracles compare the screen with `/api/devices`, `/api/control/state` and raw socket payloads.
4. **Evidence.** Every run writes a video, a Playwright trace, a screenshot and a `verdict.json`.
5. **Mutate.** Apply a bug patch, rerun, expect a failure with a precise message, revert, expect a pass again.

## Why the results can be trusted

- **Assert on meaning, never pixels.** Checks use ids, names, statuses and hit-testing. "Visible" means scrolled into view, centre inside the viewport, and `elementFromPoint` returns the element itself rather than an overlay.
- **Isolated state.** Each test adds its own drone and removes it afterwards. Anything global takes a shared lock.
- **No fixed sleeps.** Live data is polled against a predicate with a timeout.
- **Screen contracts.** A declarative list of what each screen must offer, enforced by one generic checker, so a removed button is caught without a dedicated test.
- **Failure messages name the operator impact**, for example: *"Socket is disconnected/refused but operator is falsely told connected"*.

## What is in the repo

| Path | What it is |
|---|---|
| `qa/scenarios/` | The 15 scenario specs, S00 to S17 |
| `qa/lib/` | Control-API client, fixtures, cockpit page object, oracles, truth socket |
| `qa/contracts/` | Declarative screen contracts |
| `qa/mutations/` | Bug patches for the mutation lab |
| `qa/tools/` | `run.sh`, `mutate.sh`, evidence collector, matrix generator, video reel builder |
| `qa/auto/` | Autonomous scenario engine: learns a product model on a known-good build, then generates scenarios (360 possible, reduced to 30 by pairwise selection) |
| `qa/map/` | Map lab: blind QA of the Cesium 3D map by reading its live scene graph and comparing with socket frames |
| `qa/blind/` | Blind trial with a saboteur, an inspector and a referee, plus a wire-to-pixel ledger |
| `qa/models/` | Local-model review (code and screenshots). Model output proposes hypotheses and never changes a pass or fail verdict |
| `evidence/` | Recorded runs per scenario, clean and mutant, and `mutation-matrix.md` |
| `submission/` | Write-up and narrated videos |

## Run it

Requires Node 20+ and the system under test already running (cockpit on port 4010, API on port 4000). The product source is not part of this repo.

```bash
cd qa && npm ci && npx playwright install chromium
```

```bash
./tools/run.sh clean --repeat-each=3
```

```bash
./tools/mutate.sh M03
```

The last command applies one mutant, runs its mapped scenarios and reverts. See the [QA guide](qa/README.md) for fixtures, oracles and evidence layout.

## Known gaps

- One mutant is missed: M03b (a missing status rendered as active flight), because that state is not exercised yet.
- The sign-in guard scenario (S11) and the map-position scenario are in progress and not claimed in the results above.
