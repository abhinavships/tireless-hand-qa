# 01 — Product under test: FlytBase Cockpit

Source: `product/` (clone of github.com/FlytBaseAILabs/flytbase-ahc-swe-qa-hackathon). Full docs: `product/README.md`,
`product/AGENTS.md`, `product/docs/reference.md`. Read them if you need more than what's below.

## Run it
```bash
cd product && docker compose up --build -d      # first build takes minutes; docker = colima on this Mac
curl -s localhost:4000/api/health               # expect simulator: connected, video: up
docker compose down                              # stop
```
Only ONE stack can run (fixed ports 4000/4010/8889/8554/8189). **Don't start or stop the stack without the lock** (protocol §5).

| URL | What |
|---|---|
| http://localhost:4010 | **Cockpit** (the SUT, React + Cesium): header, socket badge, device list, telemetry panel, map, video tile, alert toasts |
| http://localhost:4000/dashboard | **Control panel**: add/remove drones, take off, land, video on/off, faults |
| http://localhost:4000/api/* | Control API, no auth (see below) |

## Cockpit anatomy (clean baseline) + data-testids (`product/frontend/src/testids.ts`)
- Header: brand "FlytBase Cockpit", `socket-status` badge (text `socket connected|connecting|reconnecting|disconnected`), "Control panel →" link
- Left: **Devices** panel: `device-row-drone-N`, one row per drone with its dock folded in: name, dock name, pill `dock <status>`, pill `<flight_status>`.
  Clicking a row selects the drone + pans the map. Empty state: "No drones yet — add one from the control dashboard".
- Left: **Drone Telemetry · <name>** panel: status pill `status-flight`; rows `telemetry-battery`, `telemetry-alt-rlt`, `-alt-agl`,
  `-alt-asl`, `telemetry-hspeed`, `-vspeed`, `telemetry-heading`, `telemetry-wind`, `telemetry-home-distance`. A missing value shows `—`.
- Main: Cesium map `map-canvas`, `map-view-toggle` (`map-view-2d` / `map-view-3d`); drones and docks drawn as entities, track line in flight.
- Main: **Video tile** "FPV · <name>": `video-state` label (`off` | `live` | `connecting` | `reconnecting` | …), `video-player` (`<video data-state>` or placeholder "Video off").
- `alert-toast` toasts from the `alerts` topic.

## Control API (`http://localhost:4000/api`)
| Method | Path | Body |
|---|---|---|
| GET | `/health` | → `{status, simulator, video, uptime}` |
| GET | `/devices` | → `{devices: DeviceInfo[], orgId}` |
| GET | `/control/state` | full sim snapshot (ground truth for oracles) |
| POST | `/control/sim` | `{action: start\|stop\|reset, speed?}` |
| POST | `/control/command` | `{deviceId, type: takeoff\|land}` |
| POST | `/control/drones` | `{name?, latitude?, longitude?}` → adds a dock + drone pair |
| DELETE | `/control/drones/:id` | |
| POST | `/control/video` | `{action: start\|stop, deviceId?}` |
| GET/POST/DELETE | `/control/fault` | `{kind, deviceId?, seconds?, value?}`; kinds: `socket-kick`, `socket-refuse`, `socket-delay`, `socket-drop`, `sim-offline`, `video-freeze`, `video-stutter`, `video-degrade`, `video-flicker` |

IDs: `drone-1`, `dock-1`, … Defaults: 4 pairs, seed 42, SIM_SPEED 1. Take off → `taking_off` → `in_flight`, climbs to 30 m, 10 m/s straight line. Land → lands where it is. `reset` = everyone docked, full battery.

Socket: socket.io to :4000 with `auth: {"org-id":"flytbase"}`; `Subscribe {topic}`; topics `devices`, `flytbase/{id}/telemetry/{heartbeat|global_position|attitude|battery|flight_status|alerts|video|dock}`.

## Oracles: what "correct" means to an operator (use these, not pixels)
1. **Truthful status.** Every status the UI shows (socket badge, flight pill, dock pill, video label) matches ground truth
   (`/api/health`, `/api/control/state`, socket payloads). Never "online/live/connected" when it isn't.
2. **Right data, right drone.** The telemetry panel and video tile for drone X show drone X's data (compare with the API snapshot within tolerance).
   Selecting a different drone changes the header name, the values and the video.
3. **Consistency across views.** Device list pill == telemetry panel pill == API state; device count in list == `/api/devices` drones.
4. **Actionable at every size.** At 390×844 (phone), 768×1024 (tablet) and 1440×900 (desktop): every key region (badge, device list, telemetry, video, map) is
   visible, inside the viewport or reachable by scroll, not overlapped, not clipped; no horizontal page scroll; rows are clickable (hit-test with `elementFromPoint`).
5. **Degradation is visible.** Socket down → badge not "connected". Sim offline → the UI must not present old telemetry as live. Video stopped → label `off`, not `live`.
6. **Safe rendering.** User-supplied strings (drone names) render as text, never as HTML/script (XSS). The org-id boundary holds (a wrong org gets no flytbase data).
7. **Recovery.** After a fault clears, the UI returns to correct state without a reload.

## Known baseline gaps (possible REAL findings; verify before claiming)
- No staleness indicator: if telemetry stops (sim-offline / socket-drop 100), the panel keeps showing the last values and the flight pill stays `in_flight`.
- No auth anywhere: the control panel and destructive API are open to anyone; CORS is likely `*`. Probably by design ("no auth"), so frame it carefully or skip.
- Evaluators may add pages (e.g. a login with email + OTP). Our system must be **generic**: route discovery + a "required element" spec per screen.
