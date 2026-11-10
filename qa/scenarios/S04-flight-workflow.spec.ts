import { test, expect } from '../lib/fixtures.js';
import { createTruthSocket, topic } from '../lib/socket.js';
import { readTelemetryFast } from '../lib/ext/t03.js';
import { narrate } from '../lib/overlay.js';

interface FlightTruth { flight_status:string }
interface PositionTruth { position:{height:number}; timestamp:number }

test('S04 · takeoff, cruise and landing agree across list, panel, API and socket @functional @telemetry',async({appLock,api,cockpit,page,isolatedDrone})=> {
  void appLock; test.setTimeout(100_000);
  const id=isolatedDrone.id;
  const truth=createTruthSocket();
  truth.subscribe(topic(id,'flight_status'));
  truth.subscribe(topic(id,'global_position'));
  try {
    await truth.connect();
    await cockpit.open(); await cockpit.waitReady(); await cockpit.selectDrone(id);
    const checkStatus=async(status:string)=> {
      await api.waitFor(async()=> (await api.state()).drones[id]?.status===status,{timeout:40_000,message:`Flight command did not reach ${status} in API truth`});
      await truth.waitFor<FlightTruth>(topic(id,'flight_status'),p=>p.flight_status===status,2_000);
      await expect.poll(async()=> {
        const [state,pills]=await Promise.all([api.state(),page.evaluate((id)=>({list:document.querySelector(`[data-testid="device-row-${id}"] .device-pills .pill:last-child`)?.textContent?.trim(),panel:document.querySelector('[data-testid="status-flight"]')?.textContent?.trim()}),id)]);
        return {api:state.drones[id]?.status,socket:(truth.messages.get(topic(id,'flight_status')) as FlightTruth)?.flight_status,...pills};
      },{timeout:8_000,message:`Flight phase ${status}: device list and selected telemetry must agree with API/raw socket; a wrong phase misleads the operator`}).toEqual({api:status,socket:status,list:status,panel:status});

    };
    await narrate(page,'S04 · start grounded: both status pills match API and socket standby');
    // The real simulator calls its grounded/landed state standby.
    await checkStatus('standby');
    const startingHeight=(await api.state()).drones[id].height;
    expect(startingHeight,'Known starting state must be a grounded isolated drone').toBe(0);
    await narrate(page,'S04 · command takeoff: list and panel must show taking_off');
    expect((await api.command(id,'takeoff')).ok,'The isolated drone must accept takeoff').toBe(true);
    await checkStatus('taking_off');
    await narrate(page,'S04 · climb to cruise: both pills show in_flight and altitude reaches 30 m');
    await checkStatus('in_flight');
    await expect(async()=> {
      const state=(await api.state()).drones[id];
      const position=await truth.waitFor<PositionTruth>(topic(id,'global_position'),p=>p.position.height>=28,2_000);
      const displayed=(await readTelemetryFast(page)).altRlt;
      expect(state.height,'API must confirm climb to cruising altitude').toBeGreaterThanOrEqual(28);
      expect(displayed,'Operator must see numeric altitude during flight').not.toBeNull();
      expect(Math.abs(displayed!-state.height),'Operator altitude must match API within 2 m at cruise').toBeLessThanOrEqual(2);
      expect(Math.abs(displayed!-position.position.height),'Operator altitude must match raw socket within 2 m at cruise').toBeLessThanOrEqual(2);
      expect(displayed! - startingHeight,'Operator must see altitude rise from the grounded starting state').toBeGreaterThanOrEqual(28);
    }).toPass({timeout:8_000,intervals:[100,200]});
    await narrate(page,'S04 · command land: list and panel must show landing');
    expect((await api.command(id,'land')).ok,'The flying isolated drone must accept landing').toBe(true);
    await checkStatus('landing');
    await narrate(page,'S04 · complete landing: both status pills return to standby and altitude is zero');
    await checkStatus('standby');
    await expect.poll(async()=> (await readTelemetryFast(page)).altRlt,{timeout:2_000,message:'After landing the operator must see grounded altitude, not a stale cruise height'}).toBe(0);
    expect((await api.state()).drones[id].height,'API must confirm completed landing at zero altitude').toBe(0);
  } finally { truth.close(); }
});
