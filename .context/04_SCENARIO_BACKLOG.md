# 04 — Scenario backlog (master-owned; workers report status in their reports and on BOARD.md)

Priority: P0 = must ship in the L1 submission; P1 = ship if time allows; P2 = stretch.
Each scenario needs a paired mutant (Mxx) or a real baseline bug to prove detection.

| ID | P | Title | Categories | Oracle (short) | Mutant it must catch | Task |
|---|---|---|---|---|---|---|
| S01 | P0 | Cockpit shell: every required region is present and usable | Visual | Screen contract: brand, badge, Devices, Telemetry, map, video, Control-panel link are visible and not covered | M01 remove/hide the video tile or Devices panel; M02 Control panel link removed | T02 |
| S02 | P0 | Device list matches the fleet (add/remove live) | Functional, API&data, Real-time | list rows == `/api/devices` drones (names + dock); add drone via API → row appears ≤5 s without reload; delete → gone | M04 list drops the last drone / wrong dock name | T02 |
| S03 | P0 | Telemetry shows the selected drone's real values | Telemetry, Visual | panel values ≈ `/control/state` for that drone (battery, alt, speed); no `—` when data exists; switch drone → the name + values change | M05 panel shows the wrong drone's data / battery shown as 0 | T03 |
| S04 | P0 | Flight workflow: take off → in flight → land reflected everywhere | Functional, Telemetry | list pill == panel pill == API through taking_off→in_flight→landing→landed; altitude rises to ~30 m | M06 status pill stuck / label mapping wrong | T03 |
| S05 | P0 | Offline truth: the simulator goes offline → drones must not look online/live | Visual, Telemetry, Network | after `sim-offline`, the UI must signal offline/stale within N s (not `in_flight` with fresh-looking values) | M03 status forced "online/in_flight" | T03 |
| S06 | P0 | Socket badge tells the truth + recovers | Network&recovery, Visual | `socket-refuse` → badge ≠ connected; after the window → `connected` again and telemetry resumes, no reload | M07 badge hard-coded "connected" | T03 |
| S07 | P0 | Video tile label matches the stream state | Video, Visual | video stop → label `off` and the placeholder shows; start → `live` with a playing `<video>` (currentTime advances); switch drone → a different stream URL | M08 label says live when off | T03 |
| S08 | P0 | Phone width: primary content and actions are reachable | Responsive | at 390×844 and 768×1024: no horizontal scroll; device rows clickable (elementFromPoint); telemetry + video reachable; nothing is off-screen or overlapping | M09 CSS pushes the device list / main action off screen at narrow width | T02 |
| S09 | P0 | XSS-safe rendering of operator-supplied names | Security | add a drone named `<img src=x onerror=window.__xss=1>` → rendered as literal text, `window.__xss` undefined, no new `<img>` | M10 `dangerouslySetInnerHTML` for the name | T04 |
| S10 | P0 | Org isolation on the live data socket | Security & permissions | socket connecting with a wrong/missing `org-id` gets refused or gets no flytbase topics; the right org gets data | M11 server ignores the org-id | T04 |
| S11 | P1 | Protected-route / sign-in guard (generic) | Security | route crawler: any route marked `requiresAuth` in the contracts must redirect a signed-out user; login form contract (email, OTP, submit enabled). Ready for evaluator-added login pages | M12 add a stub `/settings` requiring auth, then break the guard | T04 |
| S12 | P1 | Control panel contract: every drone has Take off / Land, faults section | Visual, Functional | dashboard lists all devices with working buttons; clicking Take off causes a state change in the API | M13 Land button removed | T02 |
| S13 | P1 | Accessibility baseline: no critical axe violations, buttons have names | Visual, a11y | axe-core on the cockpit + the control panel: 0 critical/serious (baseline allowlist for pre-existing ones) | M14 icon-only button without a label | T02 |
| S14 | P1 | Map shows the drone where telemetry says, track while flying | Map & geospatial | read Cesium entity positions via `window` / canvas probe vs API lat/lon; 2D/3D toggle works | M15 lat/lon swapped | T03 |
| S15 | RETIRED→S05(b) | Stale telemetry under socket-drop / delay is flagged | Telemetry, Network | drop 100% → values frozen; the UI must mark them stale (expected to FAIL on baseline = a real finding) | baseline bug | T03 |
| S16 | P2 | LLM judge sweep: operator-sense check per screen and viewport | Visual | Gemini Flash on screenshots vs contracts, advisory | any | T06 |
| S17 | P2 | Security headers / CORS / open destructive API | Security | report missing CSP, X-Frame-Options (clickjacking of the control panel), `Access-Control-Allow-Origin: *` on a POST | baseline | T04 |

Grouping rule: one root cause = one scenario. E.g. "badge says connected" and "telemetry frozen during refuse" belong under S06 if they share a cause.
