# Autonomous QA report

6 generated scenarios · 0 passed · 6 failed · 401/412 assertions exact

## Problems (clustered by root cause)

### P1. USE · [data-testid="video-state"]
- **Located at:** screen (layout)
- **Seen in:** 6 scenario(s): G01, G02, G03, G04, G05, G06
- **Simplest reproducer:** G01: On desktop, with a grounded drone and normal network, the operator watches the screen
- **Observed:** was usable on the known-good build, now missing

### P2. ECHO · .video-header > span:nth-child(1)
- **Located at:** wire→screen (frontend rendering)
- **Seen in:** 5 scenario(s): G01, G02, G06
- **Simplest reproducer:** G01: On desktop, with a grounded drone and normal network, the operator watches the screen
- **Observed:** after selecting "GEN-12063" it shows ""

## Product findings (true on this build, not regressions)

None.

## Scenarios

| ID | Scenario | Result |
|---|---|---|
| G01 | On desktop, with a grounded drone and normal network, the operator watches the screen | ✖ ECHO, USE |
| G02 | On desktop, with a grounded drone and normal network, the operator reloads the page | ✖ ECHO, USE |
| G03 | On tablet, with a grounded drone and telemetry delayed by 1.5 s, the operator reloads the page | ✖ USE |
| G04 | On phone, with a grounded drone and 40 % of telemetry dropped, the operator sees a drone added and removed | ✖ USE |
| G05 | On desktop, with a grounded drone and the simulator offline, the operator selects every drone in turn | ✖ USE |
| G06 | On desktop, with a grounded drone and its video stream frozen, the operator switches to another drone and back | ✖ ECHO, ECHO, ECHO, USE |
