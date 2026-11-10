# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S00-smoke.spec.ts >> S00 · harness smoke: connected fleet, telemetry and live video
- Location: scenarios/S00-smoke.spec.ts:3:1

# Error details

```
Error: Every baseline drone must appear in the cockpit

expect(locator).toHaveCount(expected) failed

Locator:  locator('[data-testid^="device-row-drone-"]')
Expected: 4
Received: 3
Timeout:  10000ms

Call log:
  - Every baseline drone must appear in the cockpit locator('[data-testid^="device-row-drone-"]') with timeout 10000ms
  - waiting for locator('[data-testid^="device-row-drone-"]')
    23 × locator resolved to 3 elements
       - unexpected value "3"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]: FlytBase Cockpit
      - generic [ref=e6]:
        - generic "Socket connection" [ref=e7]: socket connected
        - link "Control panel →" [ref=e8] [cursor=pointer]:
          - /url: http://localhost:4000/dashboard
    - complementary [ref=e9]:
      - generic [ref=e10]:
        - heading "Devices" [level=2] [ref=e11]
        - list [ref=e12]:
          - listitem [ref=e13] [cursor=pointer]:
            - generic [ref=e14]:
              - generic [ref=e15]: Drone 1
              - generic [ref=e16]: Dock 1
            - generic [ref=e17]:
              - generic [ref=e18]: dock closed
              - generic [ref=e19]: standby
          - listitem [ref=e20] [cursor=pointer]:
            - generic [ref=e21]:
              - generic [ref=e22]: Drone 2
              - generic [ref=e23]: Dock 2
            - generic [ref=e24]:
              - generic [ref=e25]: dock closed
              - generic [ref=e26]: standby
          - listitem [ref=e27] [cursor=pointer]:
            - generic [ref=e28]:
              - generic [ref=e29]: Drone 3
              - generic [ref=e30]: Dock 3
            - generic [ref=e31]:
              - generic [ref=e32]: dock closed
              - generic [ref=e33]: standby
      - generic [ref=e34]:
        - heading "Drone Telemetry · Drone 1 standby" [level=2] [ref=e35]:
          - generic [ref=e36]: Drone Telemetry · Drone 1
          - generic [ref=e37]: standby
        - generic [ref=e38]:
          - generic [ref=e39]:
            - term [ref=e40]: Battery
            - definition [ref=e41]: 100 %
          - generic [ref=e42]:
            - term [ref=e43]: Altitude RLT
            - definition [ref=e44]: 0.0 m
          - generic [ref=e45]:
            - term [ref=e46]: Altitude AGL
            - definition [ref=e47]: 0.0 m
          - generic [ref=e48]:
            - term [ref=e49]: Altitude ASL
            - definition [ref=e50]: 560.0 m
          - generic [ref=e51]:
            - term [ref=e52]: H-Speed
            - definition [ref=e53]: 0.0 m/s
          - generic [ref=e54]:
            - term [ref=e55]: V-Speed
            - definition [ref=e56]: 0.0 m/s
          - generic [ref=e57]:
            - term [ref=e58]: Heading
            - definition [ref=e59]: 47 °
          - generic [ref=e60]:
            - term [ref=e61]: Wind
            - definition [ref=e62]: SE 3.8 m/s
          - generic [ref=e63]:
            - term [ref=e64]: Dist. from home
            - definition [ref=e65]: 0 m
    - main [ref=e66]:
      - group "Map view" [ref=e72]:
        - button "2D" [ref=e73] [cursor=pointer]
        - button "3D" [pressed] [ref=e74] [cursor=pointer]
      - generic [ref=e76]:
        - generic [ref=e77]: FPV · Drone 1
        - generic [ref=e78]: live
  - generic [aria-hidden]: S00 · step 1 · connected fleet has four drones
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
> 10 |  await expect(page.locator('[data-testid^="device-row-drone-"]'),'Every baseline drone must appear in the cockpit').toHaveCount(4);
     |                                                                                                                     ^ Error: Every baseline drone must appear in the cockpit
  11 |  await narrate(page,'S00 · step 2 · select drone and read numeric telemetry');
  12 |  await cockpit.selectDrone(drones[0].id);
  13 |  await expect.poll(async()=>{const t=await cockpit.readTelemetry();return [t.battery,t.altRlt,t.hspeed].every(v=>v!==null&&Number.isFinite(v));},{message:'Selected drone must show numeric battery, altitude and speed'}).toBe(true);
  14 |  await narrate(page,'S00 · step 3 · video reports live');
  15 |  await expect(cockpit.videoLabel(),'Baseline drone video must be labelled live').toHaveText('live',{timeout:30_000});
  16 | });
  17 | 
```