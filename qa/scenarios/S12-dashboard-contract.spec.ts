import { test, expect } from '../lib/fixtures.js';
import { narrate } from '../lib/overlay.js';
import { expectVisibleAndUsable } from '../lib/oracles.js';
import { checkContract, screenContracts } from '../lib/ext/t02.js';

test('S12 @visual @functional control panel offers flight controls and takeoff reaches the cockpit', async ({ page, api, cockpit, isolatedDrone }, info) => {
  test.skip(info.project.name !== 'desktop', 'Desktop control-panel contract; cockpit responsiveness is covered by S08');
  const id = isolatedDrone.id;
  expect((await api.state()).drones[id].status, 'Isolated drone must start safely on the ground').toBe('standby');
  await page.goto(`${api.baseURL}/dashboard`);
  await narrate(page, 'S12: Check every drone has Take off and Land; use our isolated drone.');
  await expect(page.getByTestId('dash-socket')).toHaveText('connected');
  const contract = (await screenContracts()).find(item => item.scenario === 'S12');
  expect(contract, 'Control panel requires a declarative screen contract').toBeDefined();
  await checkContract(page, contract!);
  const drones = (await api.devices()).devices.filter(d => d.type === 'drone');
  for (const drone of drones) {
    const row = page.getByTestId(`dash-row-${drone.id}`);
    await expect(row, `Operator cannot find fleet drone ${drone.name} on the control panel`).toBeVisible();
    await expect(row.getByRole('button', { name: 'Take off', exact: true }), `Operator cannot take off ${drone.name}: Take off control missing`).toBeVisible();
    await expect(row.getByRole('button', { name: 'Land', exact: true }), `Operator cannot land ${drone.name}: Land control missing`).toBeVisible();
  }
  const faults = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Faults' }) });
  await expectVisibleAndUsable(faults.locator('summary'));
  await faults.locator('summary').click();
  await expect(page.getByTestId('dash-fault-clear'), 'Operator cannot find fault recovery controls').toBeVisible();
  const takeoff = page.getByTestId(`dash-takeoff-${id}`);
  await expectVisibleAndUsable(takeoff);
  await narrate(page, 'S12: Click Take off; simulator truth must change and Land must become usable.');
  await takeoff.click();
  await expect.poll(async () => (await api.state()).drones[id].status, {
    message: 'Take off click did not launch the drone: control panel action is broken', timeout: 20_000,
  }).toBe('in_flight');
  await expectVisibleAndUsable(page.getByTestId(`dash-land-${id}`));
  await cockpit.open();
  await cockpit.waitReady();
  await cockpit.selectDrone(id);
  await narrate(page, 'S12: Selected drone must show in_flight in both fleet row and telemetry.');
  await expect(cockpit.flightPill(id), 'Takeoff succeeded but fleet row does not show the actual flight status').toHaveText('in_flight');
  await expect(cockpit.flightPill(), 'Takeoff succeeded but telemetry does not show the selected drone flying').toHaveText('in_flight');
});
