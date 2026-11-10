# T02 — Static, visual and responsive scenarios: S01, S02, S08, S12, S13 (see 04_SCENARIO_BACKLOG)

**Owns:** `qa/scenarios/S01-*`, `S02-*`, `S08-*`, `S12-*`, `S13-*`, `qa/contracts/**`, `qa/lib/ext/t02.ts`
**Depends on:** T01 interfaces. If T01 isn't ready yet, write against the signatures in 02_SYSTEM_DESIGN and stub locally in `lib/ext/t02.ts`.

Key ideas:
- **Screen contracts** (`qa/contracts/cockpit.json`, `dashboard.json`): a list of required elements {name, locator (role+name, or testid fallback), mustBeVisible, mustBeClickable, region}. One generic spec checks every contract × every viewport. Make it easy to add a contract for a new page (e.g. a login screen with email/OTP/submit), because evaluators may add pages.
- "Usable" = visible + inside the viewport (or scrollable into it) + `elementFromPoint` at its center hits it (not covered) + size > 0 + not clipped by an overflow:hidden parent.
- S08: phone 390x844 + tablet; `document.documentElement.scrollWidth <= innerWidth`; the device list can select a drone and the telemetry updates; the video tile and badge are reachable.
- S12: control panel at :4000/dashboard; each device has Take off/Land; click Take off on your isolated drone → the API state changes → the cockpit reflects it.
- S13: axe on both pages; record a baseline of pre-existing violations in `qa/contracts/a11y-baseline.json`, and fail only on NEW critical/serious ones.
Give T05 a list of mutants you want (e.g. "hide .cockpit-left under 500px").
