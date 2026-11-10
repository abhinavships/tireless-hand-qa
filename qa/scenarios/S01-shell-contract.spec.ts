import { test, expect } from '../lib/fixtures.js';
import { narrate } from '../lib/overlay.js';
import { screenContracts, checkContract } from '../lib/ext/t02.js';
test('S01 @visual · required screen regions and actions remain reachable',async({page,api,cockpit,isolatedDrone})=>{
 void isolatedDrone; // API-created fleet member guarantees a known populated starting state and finally cleanup.
 expect((await api.devices()).devices.some(d=>d.type==='drone'),'Shell contract needs a fleet to inspect').toBe(true);
 for(const contract of (await screenContracts()).filter(c=>c.scenario==='S01'||!c.scenario)) {
  await page.goto(contract.url);
  if(contract.url==='/') await cockpit.waitReady();
  await narrate(page,`S01 · ${contract.name}: check identity, fleet, telemetry, map, video and main action`);
  await checkContract(page,contract);
 }
});
