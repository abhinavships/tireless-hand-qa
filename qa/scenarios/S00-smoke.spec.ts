import { test, expect } from '../lib/fixtures.js';
import { narrate } from '../lib/overlay.js';
test('S00 · harness smoke: connected fleet, telemetry and live video',async({api,cockpit,page})=>{
 const health=await api.health();
 expect(health.simulator,'Smoke requires the running simulator to be connected').toBe('connected');
 const drones=(await api.devices()).devices.filter(d=>d.type==='drone');
 expect(drones.length,'Smoke starting state requires the baseline fleet of four drones').toBe(4);
 await cockpit.open(); await cockpit.waitReady();
 await narrate(page,'S00 · step 1 · connected fleet has four drones');
 await expect(page.locator('[data-testid^="device-row-drone-"]'),'Every baseline drone must appear in the cockpit').toHaveCount(4);
 await narrate(page,'S00 · step 2 · select drone and read numeric telemetry');
 await cockpit.selectDrone(drones[0].id);
 await expect.poll(async()=>{const t=await cockpit.readTelemetry();return [t.battery,t.altRlt,t.hspeed].every(v=>v!==null&&Number.isFinite(v));},{message:'Selected drone must show numeric battery, altitude and speed'}).toBe(true);
 await narrate(page,'S00 · step 3 · video reports live');
 await expect(cockpit.videoLabel(),'Baseline drone video must be labelled live').toHaveText('live',{timeout:30_000});
});
