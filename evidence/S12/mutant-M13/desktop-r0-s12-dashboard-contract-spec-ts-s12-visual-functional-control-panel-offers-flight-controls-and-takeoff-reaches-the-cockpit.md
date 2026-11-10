# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S12-dashboard-contract.spec.ts >> S12 @visual @functional control panel offers flight controls and takeoff reaches the cockpit
- Location: scenarios/S12-dashboard-contract.spec.ts:6:1

# Error details

```
Error: Operator cannot land Drone 1: Land control missing

expect(locator).toBeVisible() failed

Locator: getByTestId('dash-row-drone-1').getByRole('button', { name: 'Land', exact: true })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Operator cannot land Drone 1: Land control missing getByTestId('dash-row-drone-1').getByRole('button', { name: 'Land', exact: true }) with timeout 10000ms
  - waiting for getByTestId('dash-row-drone-1').getByRole('button', { name: 'Land', exact: true })

```

```yaml
- banner:
  - heading "Cockpit Control Panel" [level=1]
  - text: "connected sim: connected video: up"
  - link "Open cockpit ↗":
    - /url: http://localhost:4010
- main:
  - heading "Simulator" [level=2]
  - button "Start"
  - button "Stop"
  - button "Reset"
  - text: Speed
  - spinbutton "Speed": "1"
  - button "Apply"
  - text: tick 6567 · running · 1x
  - heading "Add drone" [level=2]
  - textbox "Name (optional)"
  - textbox "Latitude (optional)"
  - textbox "Longitude (optional)"
  - button "Add drone + dock"
  - button "Start all video"
  - button "Stop all video"
  - heading "Drones" [level=2]
  - table:
    - rowgroup:
      - row "Drone Status Battery Height H-speed Dist. home Video Actions":
        - columnheader "Drone"
        - columnheader "Status"
        - columnheader "Battery"
        - columnheader "Height"
        - columnheader "H-speed"
        - columnheader "Dist. home"
        - columnheader "Video"
        - columnheader "Actions"
    - rowgroup:
      - row "Drone 1 drone-1 · dock-1 standby 100 % 0.0 m 0.0 m/s 0 m on Take off Stop video Remove":
        - cell "Drone 1 drone-1 · dock-1"
        - cell "standby"
        - cell "100 %"
        - cell "0.0 m"
        - cell "0.0 m/s"
        - cell "0 m"
        - cell "on"
        - cell "Take off Stop video Remove":
          - button "Take off"
          - button "Stop video"
          - button "Remove"
      - row "Drone 2 drone-2 · dock-2 standby 100 % 0.0 m 0.0 m/s 0 m on Take off Stop video Remove":
        - cell "Drone 2 drone-2 · dock-2"
        - cell "standby"
        - cell "100 %"
        - cell "0.0 m"
        - cell "0.0 m/s"
        - cell "0 m"
        - cell "on"
        - cell "Take off Stop video Remove":
          - button "Take off"
          - button "Stop video"
          - button "Remove"
      - row "Drone 3 drone-3 · dock-3 standby 100 % 0.0 m 0.0 m/s 0 m on Take off Stop video Remove":
        - cell "Drone 3 drone-3 · dock-3"
        - cell "standby"
        - cell "100 %"
        - cell "0.0 m"
        - cell "0.0 m/s"
        - cell "0 m"
        - cell "on"
        - cell "Take off Stop video Remove":
          - button "Take off"
          - button "Stop video"
          - button "Remove"
      - row "Drone 4 drone-4 · dock-4 standby 100 % 0.0 m 0.0 m/s 0 m on Take off Stop video Remove":
        - cell "Drone 4 drone-4 · dock-4"
        - cell "standby"
        - cell "100 %"
        - cell "0.0 m"
        - cell "0.0 m/s"
        - cell "0 m"
        - cell "on"
        - cell "Take off Stop video Remove":
          - button "Take off"
          - button "Stop video"
          - button "Remove"
      - row "QA-b98dc21b drone-141 · dock-141 standby 100 % 0.0 m 0.0 m/s 0 m off Take off Start video Remove":
        - cell "QA-b98dc21b drone-141 · dock-141"
        - cell "standby"
        - cell "100 %"
        - cell "0.0 m"
        - cell "0.0 m/s"
        - cell "0 m"
        - cell "off"
        - cell "Take off Start video Remove":
          - button "Take off"
          - button "Start video"
          - button "Remove"
  - group: ▸ Faults — break things on purpose (socket and video)
  - heading "Log" [level=2]
```

# Test source

```ts
  1  | import { test, expect } from '../lib/fixtures.js';
  2  | import { narrate } from '../lib/overlay.js';
  3  | import { expectVisibleAndUsable } from '../lib/oracles.js';
  4  | import { checkContract, screenContracts } from '../lib/ext/t02.js';
  5  | 
  6  | test('S12 @visual @functional control panel offers flight controls and takeoff reaches the cockpit', async ({ page, api, cockpit, isolatedDrone }, info) => {
  7  |   test.skip(info.project.name !== 'desktop', 'Desktop control-panel contract; cockpit responsiveness is covered by S08');
  8  |   const id = isolatedDrone.id;
  9  |   expect((await api.state()).drones[id].status, 'Isolated drone must start safely on the ground').toBe('standby');
  10 |   await page.goto(`${api.baseURL}/dashboard`);
  11 |   await narrate(page, 'S12: Check every drone has Take off and Land; use our isolated drone.');
  12 |   await expect(page.getByTestId('dash-socket')).toHaveText('connected');
  13 |   const contract = (await screenContracts()).find(item => item.scenario === 'S12');
  14 |   expect(contract, 'Control panel requires a declarative screen contract').toBeDefined();
  15 |   await checkContract(page, contract!);
  16 |   const drones = (await api.devices()).devices.filter(d => d.type === 'drone');
  17 |   for (const drone of drones) {
  18 |     const row = page.getByTestId(`dash-row-${drone.id}`);
  19 |     await expect(row, `Operator cannot find fleet drone ${drone.name} on the control panel`).toBeVisible();
  20 |     await expect(row.getByRole('button', { name: 'Take off', exact: true }), `Operator cannot take off ${drone.name}: Take off control missing`).toBeVisible();
> 21 |     await expect(row.getByRole('button', { name: 'Land', exact: true }), `Operator cannot land ${drone.name}: Land control missing`).toBeVisible();
     |                                                                                                                                      ^ Error: Operator cannot land Drone 1: Land control missing
  22 |   }
  23 |   const faults = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Faults' }) });
  24 |   await expectVisibleAndUsable(faults.locator('summary'));
  25 |   await faults.locator('summary').click();
  26 |   await expect(page.getByTestId('dash-fault-clear'), 'Operator cannot find fault recovery controls').toBeVisible();
  27 |   const takeoff = page.getByTestId(`dash-takeoff-${id}`);
  28 |   await expectVisibleAndUsable(takeoff);
  29 |   await narrate(page, 'S12: Click Take off; simulator truth must change and Land must become usable.');
  30 |   await takeoff.click();
  31 |   await expect.poll(async () => (await api.state()).drones[id].status, {
  32 |     message: 'Take off click did not launch the drone: control panel action is broken', timeout: 20_000,
  33 |   }).toBe('in_flight');
  34 |   await expectVisibleAndUsable(page.getByTestId(`dash-land-${id}`));
  35 |   await cockpit.open();
  36 |   await cockpit.waitReady();
  37 |   await cockpit.selectDrone(id);
  38 |   await narrate(page, 'S12: Selected drone must show in_flight in both fleet row and telemetry.');
  39 |   await expect(cockpit.flightPill(id), 'Takeoff succeeded but fleet row does not show the actual flight status').toHaveText('in_flight');
  40 |   await expect(cockpit.flightPill(), 'Takeoff succeeded but telemetry does not show the selected drone flying').toHaveText('in_flight');
  41 | });
  42 | 
```