import { test, expect } from '../lib/fixtures.js';
import { createTruthSocket, topic } from '../lib/socket.js';
import { expectTelemetryMatchesState } from '../lib/oracles.js';
import { readTelemetryFast } from '../lib/ext/t03.js';
import { narrate } from '../lib/overlay.js';

interface PositionTruth { position: { height:number; elevation:number }; speed:{horizontal:number;vertical:number}; timestamp:number }
interface BatteryTruth { percent:number }

test('S03 · selected drone shows its real battery, altitude and speed @telemetry @visual', async ({appLock,api,cockpit,page,isolatedDrone}) => {
  void appLock; test.setTimeout(110_000);
  const truth=createTruthSocket();
  const second=await api.addDrone({name:`${isolatedDrone.name}-flying-B`});
  const ids=[isolatedDrone.id,second.drone.id];
  try {
    for(const id of ids) for(const attribute of ['battery','global_position']) truth.subscribe(topic(id,attribute));
    await truth.connect();
    await cockpit.open();
    await cockpit.waitReady();
    await narrate(page,'S03 · prepare distinct batteries: fly B until it is at least 6% below grounded A');
    await cockpit.selectDrone(second.drone.id);
    expect((await api.command(second.drone.id,'takeoff')).ok,'Isolated drone must accept takeoff before telemetry comparison').toBe(true);
    await api.waitFor(async()=> (await api.state()).drones[second.drone.id]?.status==='in_flight', {timeout:30_000,message:'Isolated drone failed to reach cruising flight for selected-drone telemetry comparison'});
    await truth.waitFor<PositionTruth>(topic(second.drone.id,'global_position'),p=>p.position.height>=28 && p.speed.horizontal>0);

    await api.waitFor(async()=> { const state=await api.state();return state.drones[isolatedDrone.id].battery-state.drones[second.drone.id].battery>=6; },{timeout:75_000,interval:500,message:'Battery-switch oracle requires API-confirmed A/B battery separation of at least 6%, beyond the 2% display tolerance'});
    await narrate(page,'S03 · select grounded A, then flying B: B battery must match B API, not prior A');
    await cockpit.selectDrone(isolatedDrone.id);
    await expect(page.getByRole('heading',{name:new RegExp(`Drone Telemetry.*${isolatedDrone.name}`)})).toBeVisible();

    const compareSelected=async(id:string,name:string)=> {
      await cockpit.selectDrone(id);
      await expect(page.getByRole('heading',{name:new RegExp(`Drone Telemetry.*${name}`)}),'Telemetry heading must identify the drone the operator selected').toBeVisible();
      await expect.poll(async()=> {
        const state=(await api.state()).drones[id];
        const shown=(await readTelemetryFast(page)).battery;
        return shown===null?Infinity:Math.abs(shown-state.battery);
      },{timeout:8_000,message:`Selected ${name} battery must match API for ${id}, not the previously selected drone's battery (tolerance 2%)`}).toBeLessThanOrEqual(2);
      await expect(async()=> {
        const state=(await api.state()).drones[id];
        const position=await truth.waitFor<PositionTruth>(topic(id,'global_position'));
        const battery=await truth.waitFor<BatteryTruth>(topic(id,'battery'));
        expect(Date.now()-position.timestamp,'Raw telemetry must be current within the allowed two-second lag').toBeLessThanOrEqual(2_000);
        const displayed=await readTelemetryFast(page);
        expectTelemetryMatchesState(displayed,{battery:state.battery,altRlt:state.height,altAgl:state.height},{battery:2,altRlt:2,altAgl:2});
        expectTelemetryMatchesState(displayed,{battery:battery.percent,altRlt:position.position.height,altAsl:position.position.elevation,hspeed:position.speed.horizontal,vspeed:position.speed.vertical},{battery:2,altRlt:2,altAsl:2,hspeed:1,vspeed:1});
      }).toPass({timeout:8_000,intervals:[100,200,300]});
    };
    await narrate(page,'S03 · select flying drone: compare panel to API and raw socket');
    await compareSelected(second.drone.id,second.drone.name);
    const flying=await readTelemetryFast(page);
    await narrate(page,'S03 · switch to grounded drone: name, altitude and speed must change');
    await compareSelected(isolatedDrone.id,isolatedDrone.name);
    const grounded=await readTelemetryFast(page);
    expect(flying.altRlt! - grounded.altRlt!,'Switching drones must replace flying altitude with the grounded drone’s altitude').toBeGreaterThan(25);
    expect(flying.hspeed! - grounded.hspeed!,'Switching drones must replace cruise speed with the grounded drone’s speed').toBeGreaterThan(8);
    await narrate(page,'S03 · switch back: flying telemetry must return');
    await compareSelected(second.drone.id,second.drone.name);
  } finally {
    truth.close();
    await api.removeDrone(second.drone.id);
  }
});
