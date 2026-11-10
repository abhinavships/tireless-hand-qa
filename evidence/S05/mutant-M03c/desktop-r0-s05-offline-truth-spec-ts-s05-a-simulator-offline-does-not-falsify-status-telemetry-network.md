# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S05-offline-truth.spec.ts >> S05(a) simulator offline does not falsify status @telemetry @network
- Location: scenarios/S05-offline-truth.spec.ts:6:1

# Error details

```
Error: Offline drone list must preserve the last truthful grounded status, never invent in_flight/online

expect(locator).toHaveText(expected) failed

Locator:  getByTestId('device-row-drone-160').locator('.device-pills .pill').last()
Expected: "standby"
Received: "in_flight"
Timeout:  10000ms

Call log:
  - Offline drone list must preserve the last truthful grounded status, never invent in_flight/online getByTestId('device-row-drone-160').locator('.device-pills .pill').last() with timeout 10000ms
  - waiting for getByTestId('device-row-drone-160').locator('.device-pills .pill').last()
    24 × locator resolved to <span class="pill pill-in_flight">in_flight</span>
       - unexpected value "in_flight"

```

```yaml
- text: in_flight
```

# Test source

```ts
  1  | import { writeFile } from 'node:fs/promises';
  2  | import { test, expect } from '../lib/fixtures.js';
  3  | import { TruthSocket, topic } from '../lib/socket.js';
  4  | import { narrate } from '../lib/overlay.js';
  5  | 
  6  | test('S05(a) simulator offline does not falsify status @telemetry @network', async ({appLock,api,cockpit,page,isolatedDrone}) => {
  7  |  void appLock;
  8  |  const truth=new TruthSocket();
  9  |  try {
  10 |   await api.clearFaults(); await truth.connect();
  11 |   const flight=await truth.waitFor<{flight_status:string}>(topic(isolatedDrone.id,'flight_status'));
  12 |   const dock=await truth.waitFor<{status:string}>(topic(isolatedDrone.dockId,'dock'));
  13 |   await cockpit.open(); await cockpit.waitReady(); await cockpit.selectDrone(isolatedDrone.id);
  14 |   await narrate(page,'S05: disconnect the simulator; distinguish browser socket from drone flight state');
  15 |   await api.fault({kind:'sim-offline',seconds:20});
  16 |   await expect.poll(async()=>(await api.health()).simulator,{message:'Simulator-offline fault must disconnect the simulator truth source'}).toBe('disconnected');
> 17 |   await expect(cockpit.flightPill(isolatedDrone.id),'Offline drone list must preserve the last truthful grounded status, never invent in_flight/online').toHaveText(flight.flight_status);
     |                                                                                                                                                          ^ Error: Offline drone list must preserve the last truthful grounded status, never invent in_flight/online
  18 |   await expect(page.getByTestId(`device-row-${isolatedDrone.id}`).locator('.device-pills .pill').first(),'Offline dock pill must agree with retained raw dock truth').toHaveText(`dock ${dock.status}`);
  19 |   await expect(cockpit.flightPill(),'Offline selected panel must agree with the last raw flight status, never invent in_flight/online').toHaveText(flight.flight_status);
  20 |   await expect.poll(()=>truth.socket.connected,{message:'Browser-topic truth socket remains connected while simulator is offline'}).toBe(true);
  21 |   await expect(cockpit.badge(),'Browser socket badge must match its connected socket (not simulator connectivity)').toHaveText('socket connected');
  22 |  } finally {truth.close();await api.clearFaults(); await api.waitFor(async()=>(await api.health()).simulator==='connected',{timeout:15000,message:'Simulator must recover after fault cleanup'});}
  23 | });
  24 | 
  25 | test('S05(b) lost telemetry is visibly stale within five seconds @finding @telemetry @network', async ({appLock,api,cockpit,page,isolatedDrone},testInfo) => {
  26 |  void appLock; test.setTimeout(90000);
  27 |  try {
  28 |   await api.clearFaults();await cockpit.open();await cockpit.waitReady();await cockpit.selectDrone(isolatedDrone.id);
  29 |   await api.command(isolatedDrone.id,'takeoff');
  30 |   await api.waitFor(async()=>(await api.state()).drones[isolatedDrone.id]?.status==='in_flight',{timeout:30000});
  31 |   await expect(cockpit.flightPill()).toHaveText('in_flight');
  32 |   await narrate(page,'S05 finding: stop all telemetry delivery; operator must see a stale/offline warning within 5 seconds');
  33 |   await api.fault({kind:'socket-drop',value:100,seconds:20});
  34 |   const panel=page.locator('.panel').filter({has:page.getByTestId('telemetry-battery')});
  35 |   await expect.poll(async()=>{
  36 |    const text=await panel.innerText();
  37 |    const explicit=/stale|offline|disconnected|unavailable|last (?:update|seen)|no (?:data|signal)/i.test(text);
  38 |    const cleared=(await cockpit.readTelemetry()).battery===null;
  39 |    return explicit||cleared;
  40 |   },{timeout:5000,message:'F1: telemetry delivery stopped but the operator still sees numeric values and in_flight without a stale/offline warning after 5 seconds'}).toBe(true);
  41 |  } catch(error) {
  42 |   const observationPath=testInfo.outputPath('stale-telemetry-observation.json');
  43 |   await writeFile(observationPath,JSON.stringify({faults:await api.faults(),truth:(await api.state()).drones[isolatedDrone.id],visible:await cockpit.readTelemetry(),flight:await cockpit.flightPill().innerText(),socket:await cockpit.badge().innerText()},null,2));
  44 |   await testInfo.attach('stale-telemetry-observation',{path:observationPath,contentType:'application/json'});
  45 |   const screenPath=testInfo.outputPath('stale-telemetry-screen.png');
  46 |   await page.screenshot({path:screenPath});
  47 |   await testInfo.attach('stale-telemetry-screen',{path:screenPath,contentType:'image/png'});
  48 |   throw error;
  49 |  } finally {await api.clearFaults();await api.command(isolatedDrone.id,'land');}
  50 | });
  51 | 
```