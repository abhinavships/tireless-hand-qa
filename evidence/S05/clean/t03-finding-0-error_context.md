# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S05-offline-truth.spec.ts >> S05(b) lost telemetry is visibly stale within five seconds @finding @telemetry @network
- Location: scenarios/S05-offline-truth.spec.ts:25:1

# Error details

```
Error: F1: telemetry delivery stopped but the operator still sees numeric values and in_flight without a stale/offline warning after 5 seconds

F1: telemetry delivery stopped but the operator still sees numeric values and in_flight without a stale/offline warning after 5 seconds

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]: FlytBase Cockpit
      - generic [ref=e6]:
        - generic "Socket connection" [ref=e7]: socket connected
        - link "Control panel →" [ref=e8] [cursor=pointer]:
          - /url: http://localhost:4000/dashboard
    - complementary [ref=e9]:
      - generic [ref=e10]:
        - heading "Devices" [level=2] [ref=e11]
        - list [ref=e12]:
          - listitem [ref=e13] [cursor=pointer]:
            - generic [ref=e14]:
              - generic [ref=e15]: Drone 1
              - generic [ref=e16]: Dock 1
            - generic [ref=e17]:
              - generic [ref=e18]: dock closed
              - generic [ref=e19]: standby
          - listitem [ref=e20] [cursor=pointer]:
            - generic [ref=e21]:
              - generic [ref=e22]: Drone 2
              - generic [ref=e23]: Dock 2
            - generic [ref=e24]:
              - generic [ref=e25]: dock closed
              - generic [ref=e26]: standby
          - listitem [ref=e27] [cursor=pointer]:
            - generic [ref=e28]:
              - generic [ref=e29]: Drone 3
              - generic [ref=e30]: Dock 3
            - generic [ref=e31]:
              - generic [ref=e32]: dock closed
              - generic [ref=e33]: standby
          - listitem [ref=e34] [cursor=pointer]:
            - generic [ref=e35]:
              - generic [ref=e36]: Drone 4
              - generic [ref=e37]: Dock 4
            - generic [ref=e38]:
              - generic [ref=e39]: dock closed
              - generic [ref=e40]: standby
          - listitem [ref=e41] [cursor=pointer]:
            - generic [ref=e42]:
              - generic [ref=e43]: QA-934a1f71
              - generic [ref=e44]: Dock 139
            - generic [ref=e45]:
              - generic [ref=e46]: dock open
              - generic [ref=e47]: in_flight
      - generic [ref=e48]:
        - heading "Drone Telemetry · QA-934a1f71 in_flight" [level=2] [ref=e49]:
          - generic [ref=e50]: Drone Telemetry · QA-934a1f71
          - generic [ref=e51]: in_flight
        - generic [ref=e52]:
          - generic [ref=e53]:
            - term [ref=e54]: Battery
            - definition [ref=e55]: 99 %
          - generic [ref=e56]:
            - term [ref=e57]: Altitude RLT
            - definition [ref=e58]: 30.0 m
          - generic [ref=e59]:
            - term [ref=e60]: Altitude AGL
            - definition [ref=e61]: 30.0 m
          - generic [ref=e62]:
            - term [ref=e63]: Altitude ASL
            - definition [ref=e64]: 590.0 m
          - generic [ref=e65]:
            - term [ref=e66]: H-Speed
            - definition [ref=e67]: 10.0 m/s
          - generic [ref=e68]:
            - term [ref=e69]: V-Speed
            - definition [ref=e70]: 0.0 m/s
          - generic [ref=e71]:
            - term [ref=e72]: Heading
            - definition [ref=e73]: 51 °
          - generic [ref=e74]:
            - term [ref=e75]: Wind
            - definition [ref=e76]: SW 3.9 m/s
          - generic [ref=e77]:
            - term [ref=e78]: Dist. from home
            - definition [ref=e79]: 50 m
    - main [ref=e80]:
      - group "Map view" [ref=e86]:
        - button "2D" [ref=e87] [cursor=pointer]
        - button "3D" [pressed] [ref=e88] [cursor=pointer]
      - generic [ref=e89]:
        - generic [ref=e90]:
          - generic [ref=e91]: FPV · QA-934a1f71
          - generic [ref=e92]: "off"
        - generic [ref=e93]: Video off
  - generic [aria-hidden]: "S05 finding: stop all telemetry delivery; operator must see a stale/offline warning within 5 seconds"
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
  17 |   await expect(cockpit.flightPill(isolatedDrone.id),'Offline drone list must preserve the last truthful grounded status, never invent in_flight/online').toHaveText(flight.flight_status);
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
> 40 |   },{timeout:5000,message:'F1: telemetry delivery stopped but the operator still sees numeric values and in_flight without a stale/offline warning after 5 seconds'}).toBe(true);
     |                                                                                                                                                                       ^ Error: F1: telemetry delivery stopped but the operator still sees numeric values and in_flight without a stale/offline warning after 5 seconds
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