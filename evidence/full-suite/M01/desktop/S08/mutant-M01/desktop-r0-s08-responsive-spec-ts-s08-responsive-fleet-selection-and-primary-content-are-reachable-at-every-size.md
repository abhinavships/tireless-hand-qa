# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S08-responsive.spec.ts >> S08 @responsive · fleet selection and primary content are reachable at every size
- Location: scenarios/S08-responsive.spec.ts:4:1

# Error details

```
Error: Video identity must follow selected drone

expect(locator).toContainText(expected) failed

Locator: locator('.video-header')
Expected substring: "QA-941ea96c"
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Video identity must follow selected drone locator('.video-header') with timeout 10000ms
  - waiting for locator('.video-header')

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
    - listitem: QA-941ea96c Dock 207 dock closed standby
  - heading "Drone Telemetry · QA-941ea96c standby" [level=2]
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
  - definition: 218 °
  - term: Wind
  - definition: NE 2.7 m/s
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
  3  | import { expectVisibleAndUsable, expectNoHorizontalScroll, expectNoOverlap } from '../lib/oracles.js';
  4  | test('S08 @responsive · fleet selection and primary content are reachable at every size',async({page,cockpit,isolatedDrone})=>{
  5  |  await cockpit.open(); await cockpit.waitReady();
  6  |  await narrate(page,'S08 · check horizontal fit, then scroll to and select the isolated drone');
  7  |  await expectNoHorizontalScroll(page);
  8  |  const row=page.getByTestId(`device-row-${isolatedDrone.id}`);
  9  |  await expectVisibleAndUsable(row);
  10 |  await cockpit.selectDrone(isolatedDrone.id);
  11 |  await expect(page.getByRole('heading',{name:/Drone Telemetry/}),'Selected drone identity must update after a reachable row click').toContainText(isolatedDrone.name);
> 12 |  await expect(page.locator('.video-header'),'Video identity must follow selected drone').toContainText(isolatedDrone.name);
     |                                                                                          ^ Error: Video identity must follow selected drone
  13 |  await narrate(page,'S08 · telemetry, video and connection badge must be reachable without sideways scrolling');
  14 |  for(const id of ['telemetry-battery','telemetry-home-distance','video-player','video-state','socket-status']) await expectVisibleAndUsable(page.getByTestId(id));
  15 |  await expectVisibleAndUsable(page.getByRole('link',{name:/Control panel/}));
  16 |  await expectNoOverlap(page.locator('.cockpit-top'),page.locator('.cockpit-left'));
  17 |  await expectNoOverlap(page.locator('.cockpit-left'),page.locator('.cockpit-map'));
  18 |  await expectNoHorizontalScroll(page);
  19 | });
  20 | 
```