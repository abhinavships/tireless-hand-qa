import { test, expect } from '../lib/fixtures.js';
import { TruthSocket, topic } from '../lib/socket.js';
import { narrate } from '../lib/overlay.js';

test('S06 socket badge reports refusal and recovers without reload @network @visual', async ({appLock,api,cockpit,page,isolatedDrone})=>{
 void appLock; const truth=new TruthSocket();
 try {
  await api.clearFaults();await truth.connect();await truth.waitFor(topic(isolatedDrone.id,'battery'));
  await cockpit.open();await cockpit.waitReady();await cockpit.selectDrone(isolatedDrone.id);
  const navigation=page.url();
  await narrate(page,'S06: refuse and kick browser sockets; connected badge must disappear');
  await api.fault({kind:'socket-refuse',seconds:15});
  await expect.poll(()=>truth.socket.connected,{message:'Fault must disconnect the independent truth socket'}).toBe(false);
  await expect(cockpit.badge(),'Socket is disconnected/refused but operator is falsely told connected').not.toHaveText('socket connected',{timeout:5000});
  await narrate(page,'S06: clear refusal; socket and fresh telemetry must recover without a reload');
  await api.clearFaults();
  await expect(cockpit.badge(),'Socket badge must recover without operator reload').toHaveText('socket connected',{timeout:15000});
  await truth.connect();
  await api.command(isolatedDrone.id,'takeoff');
  await expect.poll(async()=>(await cockpit.readTelemetry()).altRlt,{timeout:15000,message:'Recovered socket must deliver new altitude rather than retain old telemetry'}).toBeGreaterThan(3);
  const pos=await truth.waitFor<{position:{height:number}}>(topic(isolatedDrone.id,'global_position'),p=>p.position.height>3,15000);
  expect(pos.position.height).toBeGreaterThan(3);expect(page.url()).toBe(navigation);
 } finally {truth.close();await api.clearFaults();await api.command(isolatedDrone.id,'land');}
});
