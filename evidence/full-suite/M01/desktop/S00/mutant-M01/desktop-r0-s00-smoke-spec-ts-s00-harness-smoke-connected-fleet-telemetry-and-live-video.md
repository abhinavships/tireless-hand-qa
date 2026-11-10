# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S00-smoke.spec.ts >> S00 · harness smoke: connected fleet, telemetry and live video
- Location: scenarios/S00-smoke.spec.ts:3:1

# Error details

```
Error: Baseline drone video must be labelled live

expect(locator).toHaveText(expected) failed

Locator: getByTestId('video-state')
Expected: "live"
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Baseline drone video must be labelled live getByTestId('video-state') with timeout 30000ms
  - waiting for getByTestId('video-state')

```

```yaml
- banner:
  - text: FlytBase Cockpit socket connected
  - link "Control panel →":
    - /url: http://localhost:4000/dashboard
- complementary:
  - heading "Devices" [level=2]
  - list:
    - listitem: Drone 1 Dock 1 dock closed standby
    - listitem: Drone 2 Dock 2 dock closed standby
    - listitem: Drone 3 Dock 3 dock closed standby
    - listitem: Drone 4 Dock 4 dock closed standby
  - heading "Drone Telemetry · Drone 1 standby" [level=2]
  - term: Battery
  - definition: 100 %
  - term: Altitude RLT
  - definition: 0.0 m
  - term: Altitude AGL
  - definition: 0.0 m
  - term: Altitude ASL
  - definition: 560.0 m
  - term: H-Speed
  - definition: 0.0 m/s
  - term: V-Speed
  - definition: 0.0 m/s
  - term: Heading
  - definition: 47 °
  - term: Wind
  - definition: N 2.1 m/s
  - term: Dist. from home
  - definition: 0 m
- main:
  - group "Map view":
    - button "2D"
    - button "3D" [pressed]
```

# Test source

```ts
  1  | import { test, expect } from '../lib/fixtures.js';
  2  | import { narrate } from '../lib/overlay.js';
  3  | test('S00 · harness smoke: connected fleet, telemetry and live video',async({api,cockpit,page})=>{
  4  |  const health=await api.health();
  5  |  expect(health.simulator,'Smoke requires the running simulator to be connected').toBe('connected');
  6  |  const drones=(await api.devices()).devices.filter(d=>d.type==='drone');
  7  |  expect(drones.length,'Smoke starting state requires the baseline fleet of four drones').toBe(4);
  8  |  await cockpit.open(); await cockpit.waitReady();
  9  |  await narrate(page,'S00 · step 1 · connected fleet has four drones');
  10 |  await expect(page.locator('[data-testid^="device-row-drone-"]'),'Every baseline drone must appear in the cockpit').toHaveCount(4);
  11 |  await narrate(page,'S00 · step 2 · select drone and read numeric telemetry');
  12 |  await cockpit.selectDrone(drones[0].id);
  13 |  await expect.poll(async()=>{const t=await cockpit.readTelemetry();return [t.battery,t.altRlt,t.hspeed].every(v=>v!==null&&Number.isFinite(v));},{message:'Selected drone must show numeric battery, altitude and speed'}).toBe(true);
  14 |  await narrate(page,'S00 · step 3 · video reports live');
> 15 |  await expect(cockpit.videoLabel(),'Baseline drone video must be labelled live').toHaveText('live',{timeout:30_000});
     |                                                                                  ^ Error: Baseline drone video must be labelled live
  16 | });
  17 | 
```