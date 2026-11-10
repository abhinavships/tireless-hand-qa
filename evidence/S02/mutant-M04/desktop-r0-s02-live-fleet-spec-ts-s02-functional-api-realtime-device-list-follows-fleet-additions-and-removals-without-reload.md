# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S02-live-fleet.spec.ts >> S02 @functional @api @realtime device list follows fleet additions and removals without reload
- Location: scenarios/S02-live-fleet.spec.ts:36:1

# Error details

```
Error: Initial fleet: operators must see every API drone with its correct name and paired dock within 5 seconds

Initial fleet: operators must see every API drone with its correct name and paired dock within 5 seconds

expect(received).toBe(expected) // Object.is equality

Expected: ""
Received: "Fleet rows differ: operator sees [drone-1,drone-2,drone-3], API has [drone-1,drone-2,drone-3,drone-4]"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
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
            - definition [ref=e62]: SW 4.0 m/s
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
  - generic [aria-hidden]: S02 · Verify every fleet drone name and paired dock against the control API
```

# Test source

```ts
  1  | import { randomUUID } from 'node:crypto';
  2  | import type { Page } from '@playwright/test';
  3  | import { test, expect } from '../lib/fixtures.js';
  4  | import type { ControlApi } from '../lib/api.js';
  5  | import { narrate } from '../lib/overlay.js';
  6  | 
  7  | /** Compare identities and paired dock text, not ordering or status wording. */
  8  | async function fleetMismatch(page: Page, api: ControlApi): Promise<string> {
  9  |  const { devices } = await api.devices();
  10 |  const drones = devices.filter(device => device.type === 'drone');
  11 |  const rows = await page.locator('[data-testid^="device-row-drone-"]').evaluateAll(elements => elements.map(element => ({
  12 |   id: element.getAttribute('data-testid')!.replace('device-row-', ''),
  13 |   name: element.querySelector('.device-name')?.textContent ?? '',
  14 |   dock: element.querySelector('.device-sub')?.textContent ?? '',
  15 |  })));
  16 |  const actualIds = rows.map(row => row.id).sort();
  17 |  const expectedIds = drones.map(drone => drone.id).sort();
  18 |  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) return `Fleet rows differ: operator sees [${actualIds}], API has [${expectedIds}]`;
  19 |  for (const drone of drones) {
  20 |   const row = rows.find(row => row.id === drone.id)!;
  21 |   const dock = devices.find(device => device.id === drone.dockId);
  22 |   if (row.name !== drone.name) return `${drone.id}: operator sees name ${JSON.stringify(row.name)}, API says ${JSON.stringify(drone.name)}`;
  23 |   if (!dock) return `${drone.id}: API fleet has no paired dock ${drone.dockId}`;
  24 |   if (row.dock !== dock.name) return `${drone.id}: operator sees dock ${JSON.stringify(row.dock)}, API says ${JSON.stringify(dock.name)}`;
  25 |  }
  26 |  return '';
  27 | }
  28 | 
  29 | async function expectFleet(page: Page, api: ControlApi, phase: string) {
  30 |  await expect.poll(() => fleetMismatch(page, api), {
  31 |   timeout: 5_000, intervals: [100, 200, 300],
  32 |   message: `${phase}: operators must see every API drone with its correct name and paired dock within 5 seconds`,
> 33 |  }).toBe('');
     |     ^ Error: Initial fleet: operators must see every API drone with its correct name and paired dock within 5 seconds
  34 | }
  35 | 
  36 | test('S02 @functional @api @realtime device list follows fleet additions and removals without reload', async ({ page, api, cockpit }) => {
  37 |  await cockpit.open();
  38 |  await cockpit.waitReady();
  39 |  await narrate(page, 'S02 · Verify every fleet drone name and paired dock against the control API');
  40 |  await expectFleet(page, api, 'Initial fleet');
  41 |  await page.waitForTimeout(700); // Recording-only pause; all readiness checks poll.
  42 |  let navigations = 0;
  43 |  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  44 |  let addedId: string | undefined;
  45 |  try {
  46 |   await narrate(page, 'S02 · Add one isolated drone; its row must arrive live within 5 seconds');
  47 |   const added = await api.addDrone({ name: `S02-live-${randomUUID().slice(0, 8)}` });
  48 |   addedId = added.drone.id;
  49 |   await expect(page.getByTestId(`device-row-${addedId}`), 'New drone must appear live within 5 seconds so the operator can select it').toBeVisible({ timeout: 5_000 });
  50 |   await expectFleet(page, api, 'After adding isolated drone');
  51 |   await cockpit.selectDrone(addedId);
  52 |   await expect(page.getByRole('heading', { name: `Drone Telemetry · ${added.drone.name}`, exact: false }), 'Selecting the newly added drone must show its telemetry panel').toBeVisible();
  53 |   await page.waitForTimeout(700); // Let the recording show the selected new aircraft.
  54 |   await narrate(page, 'S02 · Remove that drone; its row must disappear live within 5 seconds');
  55 |   const removedId = addedId;
  56 |   await api.removeDrone(removedId);
  57 |   addedId = undefined;
  58 |   await expect(page.getByTestId(`device-row-${removedId}`), 'Removed drone must disappear within 5 seconds so operators cannot select a nonexistent aircraft').toHaveCount(0, { timeout: 5_000 });
  59 |   await expectFleet(page, api, 'After removing isolated drone');
  60 |   expect(navigations, 'Fleet changes must update through the live connection without a page reload').toBe(0);
  61 |   await narrate(page, 'S02 · PASS: fleet identities and docks match, live add/remove completed without reload');
  62 |   await page.waitForTimeout(700); // Recording-only final verdict hold.
  63 |  } finally {
  64 |   if (addedId) await api.removeDrone(addedId);
  65 |  }
  66 | });
  67 | 
```