# Tireless Hand: Agentic UI Testing for FlytBase Cockpit (Level 1)

**Team:** Tireless Hand (solo: Abhinav) · **Date:** 2026-09-26
**Product under test:** FlytBase Cockpit (`http://localhost:4010`) and Control panel (`http://localhost:4000/dashboard`)
**Overview video:** VIDEO: L1_overview.mp4
**Code:** attached `code.zip`

Every scenario below lists its **starting state** (set through the control API), the **steps**, the **oracle** that decides
pass or fail, and a **real-time video** of the run. The on-screen caption in each video names the current step.

---

## 1. System design

**The idea.** Tireless Hand tests the running cockpit the way an operator uses it and compares what the operator *sees* with
**ground truth**. Each scenario sets up a known state through the control API, then drives the real UI in Chromium at phone
(390×844), tablet (768×1024) and desktop (1440×900) sizes. **Oracles** then check the screen against the API and socket data.
Every run records a real-time video, a Playwright trace, a screenshot and a `verdict.json`. A **mutation lab** injects the
bug classes from the brief into the app and proves that a scenario which passes on the clean build fails on the broken one.

```
 Control API (:4000/api)  ── ground truth: /devices, /control/state, socket payloads ──┐
   │ 1. Arrange: add isolated drone, take off, faults                                  │
   ▼                                                                                   ▼
 Scenario spec ──2. Act──▶ Cockpit page object ──▶ Chromium @ phone / tablet / desktop ──3. Assert──▶ Oracles
   (Sxx.spec.ts)            (open, select drone,      (step captions drawn on screen)                  │
                             read pills, click)                                                        ▼
                                                                        4. Evidence: video.webm, trace.zip,
                                                                           screenshot.png, verdict.json
 Mutation lab: apply Mxx.patch → hot reload → run mapped scenario → expect FAIL → revert → clean again
```

| Part | What it does |
|---|---|
| **Environment controller** (`qa/lib/api.ts`) | Typed control-API client: devices, simulator state, add/remove drones, take off/land, video, faults, and `waitFor` polling. |
| **Fixtures** (`qa/lib/fixtures.ts`) | `isolatedDrone` adds a drone of our own before each test and deletes it afterwards, so tests don't disturb each other or the shared fleet. `appLock` serialises anything global. |
| **Cockpit page object** (`qa/lib/cockpit.ts`) | Operator-level actions (open, wait until live, select a drone) and reads (flight pills, telemetry, socket badge), all built on `data-testid`s and roles. |
| **Oracles** (`qa/lib/oracles.ts`) | *Visible and usable*: scrolled into view, centre inside the viewport, and `elementFromPoint` hits the element itself (not an overlay). Also *no horizontal scroll*, *no overlap*, and fleet vs API comparison. |
| **Screen contracts** (`qa/contracts/*.json`) | A declarative list of what each screen must offer. One generic checker enforces it, so a removed button or hidden panel is caught without writing a dedicated test. |
| **Runner + evidence** (`qa/tools/run.sh`) | Runs a clean or mutant batch while holding the shared app lock, then copies the canonical artefacts to `evidence/Sxx/<clean|mutant-Mxx>/`. |
| **Mutation lab** (`qa/mutations/`, `qa/tools/mutate.sh`) | Applies a mutant patch to the app, runs the mapped scenarios, reverts, and writes `evidence/mutation-matrix.md`. |

**Why the results are trustworthy.** We assert on meaning (IDs, names, statuses, hit-testing), never on pixels or wording. Each
test starts from a state it created itself and cleans up after itself. We poll live data instead of using fixed sleeps. Each
scenario is qualified 3× in a row on the clean app at every viewport it runs on. Failure messages name the operator impact.

---

## 2. Scenarios

Order: static screens → live data → responsive → security. **Proof** = qualified clean runs (3× in a row, no retries) plus the
injected mutants the scenario catches, with the exact failure message it printed. Each video shows the clean run, then each mutant run,
separated by title cards.

### A. Static screens

### 1. Cockpit shell: every region the operator needs is present and reachable (S01)
- **Categories:** Visual · Functional · Responsive
- **Description:** On opening the cockpit, the operator expects to see the brand, the socket connection badge, the "Control panel"
  link, the Devices list, the selected drone's telemetry, the map, the video tile and its live/off label. Each must be reachable
  and not covered, at phone, tablet and desktop sizes.
- **Starting state:** One isolated drone added through `POST /api/control/drones` (removed in `finally`), so the fleet is never empty.
- **Steps:** 1. Open `http://localhost:4010` and wait until the cockpit is live. 2. For each element in the cockpit screen contract
  (`qa/contracts/cockpit.json`), scroll it into view and check that it is visible, inside the viewport and not covered
  (`elementFromPoint` hit-test); links must be clickable.
- **Approach:** Contract-driven: the required regions are data, and one generic checker enforces them, retrying for up to 15 s.
  A missing region fails with `Cockpit: operator cannot reach <region>`, which is how "sign-in button removed"-type mutations are caught.
- **Proof:** Clean PASS 3× at each of the 3 viewports. **M01** (video tile removed) → *"Cockpit: operator cannot reach Video tile"*.
  **M02** (Control panel link removed) → *"Cockpit: operator cannot reach Control panel action"*.
- **Video:** VIDEO: L1_S01_shell-contract.mp4

### 2. Control panel: every drone can be commanded, and take-off reaches the cockpit (S12)
- **Categories:** Visual · Functional · API & data
- **Description:** From the control panel, the operator must find every drone with **Take off** and **Land** buttons, plus the fault
  controls. Pressing Take off must really launch the drone, and the cockpit must then show it flying.
- **Starting state:** Isolated drone added through the API and confirmed `standby` in `/api/control/state`; desktop.
- **Steps:** 1. Open `/dashboard`; the socket shows `connected`. 2. Check the control-panel contract (heading, connection and simulator status,
  cockpit link, Add drone, fleet table, Faults). 3. Every API drone has a row with Take off and Land. 4. Open Faults; Clear is present.
  5. Click Take off on the isolated drone; the API status must reach `in_flight` within 20 s. 6. In the cockpit, the fleet-row pill and the telemetry pill both show `in_flight`.
- **Approach:** The contract check plus a real effect check: the click has to change simulator truth, and both cockpit views have to reflect it.
- **Proof:** Clean PASS 3× (desktop). **M13** (Land button removed) → *"Operator cannot land Drone 1: Land control missing"*.
- **Video:** VIDEO: L1_S12_dashboard-contract.mp4

### 3. Accessibility: no new serious barriers on the cockpit or control panel (S13)
- **Categories:** Visual · Accessibility
- **Description:** Every control must communicate its purpose (for example, buttons need accessible names) so that all operators,
  including screen-reader users, can act.
- **Starting state:** Isolated drone added; desktop; control panel with the Faults section expanded so its controls are audited too.
- **Steps:** 1. Run axe-core on the live cockpit. 2. Run it on the control panel. 3. Compare each serious/critical violation, node by node,
  with the reviewed baseline (`qa/contracts/a11y-baseline.json`).
- **Approach:** The baseline allows only two exact, pre-existing low-contrast pills, matched by rule, severity *and* selector. Anything else fails.
- **Proof:** Clean PASS 3× (desktop). **M14** (simulator Start button loses its accessible name) → *"Operators face new serious/critical
  accessibility barriers on dashboard; unnamed buttons cannot communicate their action"*.
- **Video:** VIDEO: L1_S13_accessibility-baseline.mp4

### B. Live data

### 4. The device list follows the real fleet, live (S02)
- **Categories:** Functional · API & data · Real-time
- **Description:** The operator relies on the Devices list to show every drone with its correct name and paired dock, and to update on
  its own, with no reload, when drones are added or removed.
- **Starting state:** Current fleet from `GET /api/devices`; cockpit open and live.
- **Steps:** 1. Compare every row with the API (drone IDs, names, paired dock names). 2. `POST /api/control/drones` with a unique name.
  3. Its row must appear within 5 s; select it, and the telemetry header must show its name. 4. `DELETE` it; its row must disappear within 5 s.
  5. The fleet must match the API again, with zero page navigations.
- **Approach:** It compares identities and dock pairing (not ordering or wording), polling for up to 5 s after each change. A navigation
  listener proves the update arrived live rather than through a reload.
- **Proof:** Clean PASS 3× at each of the 3 viewports. **M04** (last drone silently omitted) → *"Initial fleet: operators must see every API
  drone with its correct name and paired dock within 5 seconds"*.
- **Video:** VIDEO: L1_S02_live-fleet.mp4

### 5. The telemetry panel shows the selected drone's real values (S03)
- **Categories:** Telemetry · Visual · API & data
- **Description:** The telemetry panel must show the battery, altitude and speed of *the drone the operator selected*, matching what
  that drone is really reporting. Switching drones must switch the values.
- **Starting state:** Two isolated drones: A takes off and reaches cruise (≥28 m, moving); B stays grounded. An independent socket client
  subscribes to both drones' `battery` and `global_position` topics as ground truth.
- **Steps:** 1. Select A; the heading names A. 2. Compare the panel with `/api/control/state` **and** the raw socket (battery ±2 %,
  altitudes ±2 m, speeds ±1 m/s; the raw data must be under 2 s old). 3. Select B; the values must match B, and altitude and speed must drop (>25 m, >8 m/s).
  4. Select A again; flying values return.
- **Approach:** Two independent truth sources, and a flying-vs-grounded pair that makes "another drone's data" impossible to miss.
- **Proof:** Clean PASS 3× (desktop). **M05** (battery shown as 0) → *"battery: operator sees 0, but API says 98.2 (allowed difference 2);
  telemetry may belong to the wrong drone or be stale"*. **M05b** (battery taken from the previously selected drone) → caught (assertion failure on the telemetry text).
- **Video:** VIDEO: L1_S03_selected-telemetry.mp4

### 6. Flight workflow: take off → cruise → land, consistent everywhere (S04)
- **Categories:** Functional · Telemetry · Real-time
- **Description:** The operator takes off a drone and lands it. At every phase, the device-list pill, the telemetry pill, the API and the
  raw socket must agree, and the altitude shown must follow the real climb to about 30 m and back to 0.
- **Starting state:** Isolated drone, grounded (`standby`, height 0), selected in the cockpit; raw socket subscribed to its `flight_status` and `global_position`.
- **Steps:** 1. `standby` everywhere. 2. `POST /api/control/command {type:"takeoff"}` → `taking_off` → `in_flight`, with the displayed altitude
  within 2 m of the API and the socket at ≥28 m. 3. `{type:"land"}` → `landing` → `standby`, with the displayed altitude back to 0.
- **Approach:** For each phase, it polls until `{api, socket, list pill, panel pill}` are all equal to the phase. The message names the phase that went wrong.
- **Proof:** Clean PASS 3× (desktop). **M06** (panel status stuck) and **M03c** (grounded shown as airborne in the list) → both *"Flight phase standby:
  device list and selected telemetry must agree with API/raw socket; a wrong phase misleads the operator"*.
- **Video:** VIDEO: L1_S04_flight-workflow.mp4

### 7. Offline truth: when the simulator goes offline, the UI must not invent a flying/online drone (S05)
- **Categories:** Visual · Telemetry · Network & recovery
- **Description:** If the simulator disconnects, the operator must not be told a grounded drone is flying or online. The last truthful
  status must be kept, and the browser's own socket badge must still describe the browser connection correctly.
- **Starting state:** Faults cleared; isolated drone (grounded) selected; its last raw `flight_status` and dock status recorded from the socket.
- **Steps:** 1. `POST /api/control/fault {kind:"sim-offline", seconds:20}`. 2. `/api/health` reports the simulator `disconnected`.
  3. The list pill, dock pill and panel pill must still equal the last raw truth (never `in_flight`/online). 4. The badge still reads
  `socket connected` (the browser socket is fine). 5. Faults cleared; the simulator recovers.
- **Approach:** The UI is compared with the last value the system really reported, not with a hard-coded status.
- **Proof:** Hard check (S05a) clean PASS 3× (desktop). **M03** (row claims online while offline) and **M03c** → *"Offline drone list must
  preserve the last truthful grounded status, never invent in_flight/online"*.
  **Known gap: M03b missed.** M03b changes what the UI shows when the status is *missing*. Our check waits for initialised telemetry, so it
  never reaches that state, and the mutant passes. We report this rather than hide it.
  The second half of this scenario (lost telemetry must be flagged as stale) fails on the unmodified app: see **F1**.
- **Video:** VIDEO: L1_S05_offline-truth.mp4 (clean, M03, M03b = missed, M03c)

### 8. The socket badge tells the truth and recovers without a reload (S06)
- **Categories:** Network & recovery · Visual
- **Description:** The header badge is the operator's only sign that the cockpit is connected. When connections are refused, it must
  stop saying "connected"; when they're allowed again, it must recover, and fresh telemetry must flow, without a reload.
- **Starting state:** Faults cleared; isolated drone selected; an independent socket client receiving its telemetry.
- **Steps:** 1. `POST /api/control/fault {kind:"socket-refuse", seconds:15}`; the independent client disconnects (proving the fault is real).
  2. Within 5 s the badge must not read `socket connected`. 3. Clear faults; the badge returns to `socket connected` within 15 s.
  4. Take off; the displayed altitude rises above 3 m (new data, not old values), matched by the raw socket; the page URL is unchanged (no reload).
- **Approach:** Ground truth for "disconnected" comes from our own socket client, not from the UI. Recovery is proved with *new*
  telemetry, not just the badge.
- **Proof:** Clean PASS 3× (desktop). **M07** (badge hard-coded "connected") → *"Socket is disconnected/refused but operator is falsely told connected"*.
- **Video:** VIDEO: L1_S06_socket-recovery.mp4

### 9. The video label matches real playback and the selected drone's stream (S07)
- **Categories:** Video & media · Visual
- **Description:** The operator reads the video label to know whether they are watching live footage. A stopped stream must say `off`
  with the placeholder; `live` must mean frames are really playing; each drone must show its own camera.
- **Starting state:** Isolated drone A plus camera drone B, both with video stopped (confirmed on the raw `video` topic).
- **Steps:** 1. Select A: the label reads `off`, the "Video off" placeholder shows, and there's no `<video>` element. 2. `POST /api/control/video {action:"start"}` for A:
  the label reads `live`, decoded frames exist (`videoWidth>0`), `currentTime` advances ≥1 s over 2 s, and the player requests the stream URL A announced.
  3. Start B and select it: B announces a different URL, the player requests B's URL, and B plays.
- **Approach:** The label is checked against real decoding and playback and against the network request for the announced stream, never against the label itself.
- **Proof:** Clean PASS 3× (desktop). **M08** (stopped video labelled live) → *"Stopped stream must be labelled off; a live label would mislead the operator"*.
- **Video:** VIDEO: L1_S07_video-truth.mp4

### C. Responsive

### 10. Phone and tablet: fleet selection and primary content stay reachable (S08)
- **Categories:** Responsive · Visual
- **Description:** An operator on a phone or tablet must be able to pick a drone and then see its telemetry, video and connection badge.
  Nothing may be pushed off screen or covered, and the page must never scroll sideways.
- **Starting state:** Isolated drone added through the API; viewports 390×844, 768×1024 and 1440×900 (video shows the phone run).
- **Steps:** 1. Check there's no horizontal scroll. 2. Scroll to the isolated drone's row, hit-test it and tap it; the telemetry heading and video header show its name.
  3. Battery, home distance, video player, video state, socket badge and "Control panel" link are each visible and usable. 4. The header, left panel and map don't overlap; still no horizontal scroll.
- **Approach:** Geometry oracles only (scroll width, bounding boxes, `elementFromPoint`), with no pixel baselines.
- **Proof:** Clean PASS 3× at each of the 3 viewports. **M09** (content pushed off a narrow screen) → *"Operator must scroll horizontally: content 1040px
  exceeds viewport 390px"*. **M09b** (device list collapsed at ≤480 px) → *"Operator cannot reach/use device-row-…: is vertically clipped by an ancestor; centre is covered by section"*.
- **Video:** VIDEO: L1_S08_responsive.mp4

### D. Security

### 11. Operator-supplied drone names are rendered as text in the cockpit (S09)
- **Categories:** Security & permissions
- **Description:** Drone names come from users. The cockpit must show them as literal text and never run them as code.
- **Starting state:** `POST /api/control/drones` with name `<img src=x onerror=window.__xss=1>` (second payload `"><svg onload=window.__xss=2>`); removed in `finally`.
- **Steps:** 1. Open the cockpit and scroll to the new row. 2. `window.__xss` must stay undefined. 3. The row must contain the literal name, and no `<img src=x>` / `<svg onload>` node may exist.
- **Approach:** A runtime execution marker plus DOM checks, with 2 payloads.
- **Proof:** Cockpit: clean PASS 3× for both payloads (desktop). **M10** (name rendered as HTML) → *"Stored XSS: a drone name executes JavaScript in
  the cockpit, compromising the operator session"*. The same test on the control panel fails on the unmodified app: see **F3**.
- **Video:** VIDEO: L1_S09_xss.mp4

---

## 3. Baseline findings (real bugs in the unmodified app)

These were reproduced by our scenarios on the clean app and confirmed by manual review. The videos show the failure on the unmodified app (red title card).

### 12. F1: Lost telemetry is presented as live data (S05, part b)
- **Categories:** Telemetry · Network & recovery
- **Description:** When telemetry stops arriving, the operator should be told within a few seconds that the values are stale.
  **Actual:** the panel keeps showing the last numbers and the `in_flight` pill with no stale or offline warning, so the operator believes the
  drone is being tracked live.
- **Starting state:** Faults cleared; isolated drone selected, taken off and `in_flight`.
- **Steps:** 1. `POST /api/control/fault {kind:"socket-drop", value:100, seconds:20}` (all telemetry messages dropped). 2. Watch the telemetry panel for 5 s.
- **Approach:** Passes if the panel shows any stale/offline/no-data wording or clears its values. It records the visible values, flight pill,
  badge and simulator truth as an attachment when it fails.
- **Result on baseline:** FAIL, reproduced in each recorded run: *"F1: telemetry delivery stopped but the operator still sees numeric values and in_flight without a stale/offline
  warning after 5 seconds"*.
- **Impact:** A drone that's out of contact looks healthy and flying normally.
- **Video:** VIDEO: L1_F1_stale-telemetry.mp4

### 13. F2: No tenant isolation on the live-data socket (S10)
- **Categories:** Security & permissions · Real-time
- **Description:** Live fleet and telemetry belong to the `flytbase` organisation. A client with another org-id, or none, should be refused
  or receive nothing. **Actual:** the server sends it the FlytBase device list and drone telemetry.
- **Starting state:** Default fleet running; cockpit open; no faults.
- **Steps:** 1. **Control:** a client with `org-id: "flytbase"` subscribes to `devices` and `flytbase/<drone>/telemetry/battery` and receives both.
  2. A client with `org-id: "evil"` subscribes to the same topics. 3. Repeat with an empty auth object (missing org-id). 4. Everything received is shown in an on-screen proof panel.
- **Approach:** Passes only if the unauthorised client is refused or gets no `devices` / `flytbase/*` topic. The positive control rules out a broken probe.
- **Result on baseline:** FAIL for both identities: *"Organization isolation broken: evil org receives FlytBase fleet/telemetry (devices, flytbase/drone-1/telemetry/battery)"*.
- **Impact:** Anyone who can reach the socket can watch every drone's position and status without credentials.
- **Video:** VIDEO: L1_F2_org-isolation.mp4

### 14. F3: Stored XSS in the control panel through drone names (S09, dashboard)
- **Categories:** Security & permissions
- **Description:** Drone names must render as text. **Actual:** the control panel inserts `d.name` into `innerHTML` without escaping
  (`backend/public/dashboard.html` line 165, and again at line 227), so a drone name runs JavaScript in the operator's browser.
- **Starting state / Steps:** As in scenario 11, but on `http://localhost:4000/dashboard`.
- **Result on baseline:** FAIL for both payloads (the runtime marker executed): *"Stored XSS: a drone name executes JavaScript in the dashboard, compromising the operator session"*.
- **Impact:** Anyone who can add a drone (the API has no auth) can run script in every operator's control-panel session and issue take-off or land commands.
- **Video:** VIDEO: L1_F3_dashboard-xss.mp4

---

## 4. Mutation matrix

A mutant is **caught** when the targeted scenario fails with the message shown, while the same test passed on 3 clean runs in a row.
Source: `evidence/mutation-matrix.md`.

| Mutant (injected bug) | Scenario | Result | Failure message |
|---|---|---|---|
| M01 video tile removed | S01 | **caught** | Cockpit: operator cannot reach Video tile |
| M02 Control panel link removed | S01 | **caught** | Cockpit: operator cannot reach Control panel action |
| M04 last drone omitted from list | S02 | **caught** | Initial fleet: operators must see every API drone with its correct name and paired dock within 5 seconds |
| M05 battery shown as 0 | S03 | **caught** | battery: operator sees 0, but API says 98.2 (allowed difference 2) … |
| M05b battery from previously selected drone | S03 | **caught** | assertion failure on telemetry text (generic message) |
| M06 panel flight status stuck | S04 | **caught** | Flight phase standby: device list and selected telemetry must agree with API/raw socket … |
| M03c grounded shown airborne in list | S04, S05 | **caught** (both) | S04: Flight phase standby … / S05: Offline drone list must preserve the last truthful grounded status … |
| M03 online while simulator offline | S05 | **caught** | Offline drone list must preserve the last truthful grounded status, never invent in_flight/online |
| M03b missing status shown as active flight | S05 | **missed** | mutant passed: known gap (a missing-status state isn't exercised) |
| M07 badge always "connected" | S06 | **caught** | Socket is disconnected/refused but operator is falsely told connected |
| M08 stopped video labelled live | S07 | **caught** | Stopped stream must be labelled off; a live label would mislead the operator |
| M09 content pushed off a narrow screen | S08 | **caught** | Operator must scroll horizontally: content 1040px exceeds viewport 390px |
| M09b device list collapsed ≤480 px | S08 | **caught** | Operator cannot reach/use device-row-…: is vertically clipped by an ancestor … |
| M10 cockpit renders name as HTML | S09 | **caught** | Stored XSS: a drone name executes JavaScript in the cockpit … |
| M13 Land button removed | S12 | **caught** | Operator cannot land Drone 1: Land control missing |
| M14 unnamed dashboard button | S13 | **caught** | Operators face new serious/critical accessibility barriers on dashboard … |

**Score: 15 of 16 targeted mutants caught, 1 missed (M03b).** Clean row: every hard check passes 3× in a row; the only clean failures are the three
baseline findings (F1, F2, F3). M11 (org guard) has no mutant because the baseline already lacks the guard (F2). The sign-in guard scenario (S11, a
login fixture with email + OTP, mutants M12/M16) and the map-position scenario (S14/M15) are **still in progress** and not claimed here.

---

## 5. How to run

```bash
cd product && docker compose up --build -d && curl -s localhost:4000/api/health   # 1. start the app
cd ../qa && npm ci && npx playwright install chromium                            # 2. install the tests
./tools/run.sh clean --repeat-each=3                                             # 3. run all scenarios (evidence → evidence/Sxx/clean/)
```
Mutant: `qa/tools/mutate.sh M03` (applies the patch, runs the mapped scenarios as `mutant-M03`, reverts). Matrix: `evidence/mutation-matrix.md`.
Videos: `qa/tools/reel.sh --overview` → `submission/videos/`.
