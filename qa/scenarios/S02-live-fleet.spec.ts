import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../lib/fixtures.js';
import type { ControlApi } from '../lib/api.js';
import { narrate } from '../lib/overlay.js';

/** Compare identities and paired dock text, not ordering or status wording. */
async function fleetMismatch(page: Page, api: ControlApi): Promise<string> {
 const { devices } = await api.devices();
 const drones = devices.filter(device => device.type === 'drone');
 const rows = await page.locator('[data-testid^="device-row-drone-"]').evaluateAll(elements => elements.map(element => ({
  id: element.getAttribute('data-testid')!.replace('device-row-', ''),
  name: element.querySelector('.device-name')?.textContent ?? '',
  dock: element.querySelector('.device-sub')?.textContent ?? '',
 })));
 const actualIds = rows.map(row => row.id).sort();
 const expectedIds = drones.map(drone => drone.id).sort();
 if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) return `Fleet rows differ: operator sees [${actualIds}], API has [${expectedIds}]`;
 for (const drone of drones) {
  const row = rows.find(row => row.id === drone.id)!;
  const dock = devices.find(device => device.id === drone.dockId);
  if (row.name !== drone.name) return `${drone.id}: operator sees name ${JSON.stringify(row.name)}, API says ${JSON.stringify(drone.name)}`;
  if (!dock) return `${drone.id}: API fleet has no paired dock ${drone.dockId}`;
  if (row.dock !== dock.name) return `${drone.id}: operator sees dock ${JSON.stringify(row.dock)}, API says ${JSON.stringify(dock.name)}`;
 }
 return '';
}

async function expectFleet(page: Page, api: ControlApi, phase: string) {
 await expect.poll(() => fleetMismatch(page, api), {
  timeout: 5_000, intervals: [100, 200, 300],
  message: `${phase}: operators must see every API drone with its correct name and paired dock within 5 seconds`,
 }).toBe('');
}

test('S02 @functional @api @realtime device list follows fleet additions and removals without reload', async ({ page, api, cockpit }) => {
 await cockpit.open();
 await cockpit.waitReady();
 await narrate(page, 'S02 · Verify every fleet drone name and paired dock against the control API');
 await expectFleet(page, api, 'Initial fleet');
 await page.waitForTimeout(700); // Recording-only pause; all readiness checks poll.
 let navigations = 0;
 page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
 let addedId: string | undefined;
 try {
  await narrate(page, 'S02 · Add one isolated drone; its row must arrive live within 5 seconds');
  const added = await api.addDrone({ name: `S02-live-${randomUUID().slice(0, 8)}` });
  addedId = added.drone.id;
  await expect(page.getByTestId(`device-row-${addedId}`), 'New drone must appear live within 5 seconds so the operator can select it').toBeVisible({ timeout: 5_000 });
  await expectFleet(page, api, 'After adding isolated drone');
  await cockpit.selectDrone(addedId);
  await expect(page.getByRole('heading', { name: `Drone Telemetry · ${added.drone.name}`, exact: false }), 'Selecting the newly added drone must show its telemetry panel').toBeVisible();
  await page.waitForTimeout(700); // Let the recording show the selected new aircraft.
  await narrate(page, 'S02 · Remove that drone; its row must disappear live within 5 seconds');
  const removedId = addedId;
  await api.removeDrone(removedId);
  addedId = undefined;
  await expect(page.getByTestId(`device-row-${removedId}`), 'Removed drone must disappear within 5 seconds so operators cannot select a nonexistent aircraft').toHaveCount(0, { timeout: 5_000 });
  await expectFleet(page, api, 'After removing isolated drone');
  expect(navigations, 'Fleet changes must update through the live connection without a page reload').toBe(0);
  await narrate(page, 'S02 · PASS: fleet identities and docks match, live add/remove completed without reload');
  await page.waitForTimeout(700); // Recording-only final verdict hold.
 } finally {
  if (addedId) await api.removeDrone(addedId);
 }
});
