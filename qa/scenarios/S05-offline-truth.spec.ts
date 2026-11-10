import { writeFile } from 'node:fs/promises';
import { test, expect } from '../lib/fixtures.js';
import { TruthSocket, topic } from '../lib/socket.js';
import { narrate } from '../lib/overlay.js';

test('S05(a) simulator offline does not falsify status @telemetry @network', async ({appLock,api,cockpit,page,isolatedDrone}) => {
 void appLock;
 const truth=new TruthSocket();
 try {
  await api.clearFaults(); await truth.connect();
  const flight=await truth.waitFor<{flight_status:string}>(topic(isolatedDrone.id,'flight_status'));
  const dock=await truth.waitFor<{status:string}>(topic(isolatedDrone.dockId,'dock'));
  await cockpit.open(); await cockpit.waitReady(); await cockpit.selectDrone(isolatedDrone.id);
  await narrate(page,'S05: disconnect the simulator; distinguish browser socket from drone flight state');
  await api.fault({kind:'sim-offline',seconds:20});
  await expect.poll(async()=>(await api.health()).simulator,{message:'Simulator-offline fault must disconnect the simulator truth source'}).toBe('disconnected');
  await expect(cockpit.flightPill(isolatedDrone.id),'Offline drone list must preserve the last truthful grounded status, never invent in_flight/online').toHaveText(flight.flight_status);
  await expect(page.getByTestId(`device-row-${isolatedDrone.id}`).locator('.device-pills .pill').first(),'Offline dock pill must agree with retained raw dock truth').toHaveText(`dock ${dock.status}`);
  await expect(cockpit.flightPill(),'Offline selected panel must agree with the last raw flight status, never invent in_flight/online').toHaveText(flight.flight_status);
  await expect.poll(()=>truth.socket.connected,{message:'Browser-topic truth socket remains connected while simulator is offline'}).toBe(true);
  await expect(cockpit.badge(),'Browser socket badge must match its connected socket (not simulator connectivity)').toHaveText('socket connected');
 } finally {truth.close();await api.clearFaults(); await api.waitFor(async()=>(await api.health()).simulator==='connected',{timeout:15000,message:'Simulator must recover after fault cleanup'});}
});

test('S05(b) lost telemetry is visibly stale within five seconds @finding @telemetry @network', async ({appLock,api,cockpit,page,isolatedDrone},testInfo) => {
 void appLock; test.setTimeout(90000);
 try {
  await api.clearFaults();await cockpit.open();await cockpit.waitReady();await cockpit.selectDrone(isolatedDrone.id);
  await api.command(isolatedDrone.id,'takeoff');
  await api.waitFor(async()=>(await api.state()).drones[isolatedDrone.id]?.status==='in_flight',{timeout:30000});
  await expect(cockpit.flightPill()).toHaveText('in_flight');
  await narrate(page,'S05 finding: stop all telemetry delivery; operator must see a stale/offline warning within 5 seconds');
  await api.fault({kind:'socket-drop',value:100,seconds:20});
  const panel=page.locator('.panel').filter({has:page.getByTestId('telemetry-battery')});
  await expect.poll(async()=>{
   const text=await panel.innerText();
   const explicit=/stale|offline|disconnected|unavailable|last (?:update|seen)|no (?:data|signal)/i.test(text);
   const cleared=(await cockpit.readTelemetry()).battery===null;
   return explicit||cleared;
  },{timeout:5000,message:'F1: telemetry delivery stopped but the operator still sees numeric values and in_flight without a stale/offline warning after 5 seconds'}).toBe(true);
 } catch(error) {
  const observationPath=testInfo.outputPath('stale-telemetry-observation.json');
  await writeFile(observationPath,JSON.stringify({faults:await api.faults(),truth:(await api.state()).drones[isolatedDrone.id],visible:await cockpit.readTelemetry(),flight:await cockpit.flightPill().innerText(),socket:await cockpit.badge().innerText()},null,2));
  await testInfo.attach('stale-telemetry-observation',{path:observationPath,contentType:'application/json'});
  const screenPath=testInfo.outputPath('stale-telemetry-screen.png');
  await page.screenshot({path:screenPath});
  await testInfo.attach('stale-telemetry-screen',{path:screenPath,contentType:'image/png'});
  throw error;
 } finally {await api.clearFaults();await api.command(isolatedDrone.id,'land');}
});


test('S05(c) new drone without telemetry never claims active flight @telemetry @network', async ({appLock,api,cockpit,page,isolatedDrone},testInfo)=>{
 void appLock;void isolatedDrone;
 const truth=new TruthSocket();let id:string|undefined;
 try {
  await api.clearFaults();await truth.connect();await cockpit.open();await cockpit.waitReady();
  await narrate(page,'S05 · drop telemetry BEFORE adding a new drone: unknown data must not invent in_flight');
  await api.fault({kind:'socket-drop',value:100,seconds:45});
  const added=await api.addDrone({name:'QA-no-telemetry'});id=added.drone.id;
  truth.subscribe(topic(id,'flight_status'));truth.subscribe(topic(id,'battery'));
  await cockpit.selectDrone(id);
  await expect(page.getByTestId('telemetry-battery'),'New drone has never delivered battery telemetry; values must be unavailable').toHaveText('—');
  expect(truth.messages.has(topic(id,'flight_status')),'Independent socket confirms this new drone has no retained or delivered flight status').toBe(false);
  expect((await api.state()).drones[id].status,'Known new drone is grounded in simulator truth').toBe('standby');
  await expect(cockpit.flightPill(id),'A drone with no telemetry must show unknown/unavailable, never invented in_flight or online').toHaveText(/^(—|unknown|offline|unavailable|no data)$/i);
  await expect(cockpit.flightPill(),'Selected drone without telemetry must not claim a known flight phase').toHaveText(/^(—|unknown|offline|unavailable|no data)$/i);
  const screen=testInfo.outputPath('no-telemetry-screen.png');await page.screenshot({path:screen});
  await testInfo.attach('no-telemetry-screen',{path:screen,contentType:'image/png'});
 } catch(error) {
  const screen=testInfo.outputPath('no-telemetry-screen.png');await page.screenshot({path:screen});
  await testInfo.attach('no-telemetry-screen',{path:screen,contentType:'image/png'});
  throw error;
 } finally {
  truth.close();
  try {await api.clearFaults();} finally {if(id)await api.removeDrone(id);}
 }
});
