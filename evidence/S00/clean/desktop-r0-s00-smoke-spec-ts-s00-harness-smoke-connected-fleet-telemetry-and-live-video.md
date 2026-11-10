# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S00-smoke.spec.ts >> S00 · harness smoke: connected fleet, telemetry and live video
- Location: scenarios/S00-smoke.spec.ts:3:1

# Error details

```
Error: Smoke starting state requires the baseline fleet of four drones

expect(received).toBe(expected) // Object.is equality

Expected: 4
Received: 5
```

# Test source

```ts
  1  | import { test, expect } from '../lib/fixtures.js';
  2  | import { narrate } from '../lib/overlay.js';
  3  | test('S00 · harness smoke: connected fleet, telemetry and live video',async({api,cockpit,page})=>{
  4  |  const health=await api.health();
  5  |  expect(health.simulator,'Smoke requires the running simulator to be connected').toBe('connected');
  6  |  const drones=(await api.devices()).devices.filter(d=>d.type==='drone');
> 7  |  expect(drones.length,'Smoke starting state requires the baseline fleet of four drones').toBe(4);
     |                                                                                          ^ Error: Smoke starting state requires the baseline fleet of four drones
  8  |  await cockpit.open(); await cockpit.waitReady();
  9  |  await narrate(page,'S00 · step 1 · connected fleet has four drones');
  10 |  await expect(page.locator('[data-testid^="device-row-drone-"]'),'Every baseline drone must appear in the cockpit').toHaveCount(4);
  11 |  await narrate(page,'S00 · step 2 · select drone and read numeric telemetry');
  12 |  await cockpit.selectDrone(drones[0].id);
  13 |  await expect.poll(async()=>{const t=await cockpit.readTelemetry();return [t.battery,t.altRlt,t.hspeed].every(v=>v!==null&&Number.isFinite(v));},{message:'Selected drone must show numeric battery, altitude and speed'}).toBe(true);
  14 |  await narrate(page,'S00 · step 3 · video reports live');
  15 |  await expect(cockpit.videoLabel(),'Baseline drone video must be labelled live').toHaveText('live',{timeout:30_000});
  16 | });
  17 | 
```