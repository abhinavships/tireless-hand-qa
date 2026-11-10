# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S05-offline-truth.spec.ts >> S05(c) new drone without telemetry never claims active flight @telemetry @network
- Location: scenarios/S05-offline-truth.spec.ts:53:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: page.screenshot: Target page, context or browser has been closed
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
      - generic [ref=e41]:
        - heading "Drone Telemetry · Drone 1 standby" [level=2] [ref=e42]:
          - generic [ref=e43]: Drone Telemetry · Drone 1
          - generic [ref=e44]: standby
        - generic [ref=e45]:
          - generic [ref=e46]:
            - term [ref=e47]: Battery
            - definition [ref=e48]: 100 %
          - generic [ref=e49]:
            - term [ref=e50]: Altitude RLT
            - definition [ref=e51]: 0.0 m
          - generic [ref=e52]:
            - term [ref=e53]: Altitude AGL
            - definition [ref=e54]: 0.0 m
          - generic [ref=e55]:
            - term [ref=e56]: Altitude ASL
            - definition [ref=e57]: 560.0 m
          - generic [ref=e58]:
            - term [ref=e59]: H-Speed
            - definition [ref=e60]: 0.0 m/s
          - generic [ref=e61]:
            - term [ref=e62]: V-Speed
            - definition [ref=e63]: 0.0 m/s
          - generic [ref=e64]:
            - term [ref=e65]: Heading
            - definition [ref=e66]: 47 °
          - generic [ref=e67]:
            - term [ref=e68]: Wind
            - definition [ref=e69]: N 5.7 m/s
          - generic [ref=e70]:
            - term [ref=e71]: Dist. from home
            - definition [ref=e72]: 0 m
    - main [ref=e73]:
      - group "Map view" [ref=e79]:
        - button "2D" [ref=e80] [cursor=pointer]
        - button "3D" [pressed] [ref=e81] [cursor=pointer]
      - generic [ref=e83]:
        - generic [ref=e84]: FPV · Drone 1
        - generic [ref=e85]: live
  - generic [aria-hidden]: "S05 · drop telemetry BEFORE adding a new drone: unknown data must not invent in_flight"
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
  52 | 
  53 | test('S05(c) new drone without telemetry never claims active flight @telemetry @network', async ({appLock,api,cockpit,page,isolatedDrone},testInfo)=>{
  54 |  void appLock;void isolatedDrone;
  55 |  const truth=new TruthSocket();let id:string|undefined;
  56 |  try {
  57 |   await api.clearFaults();await truth.connect();await cockpit.open();await cockpit.waitReady();
  58 |   await narrate(page,'S05 · drop telemetry BEFORE adding a new drone: unknown data must not invent in_flight');
  59 |   await api.fault({kind:'socket-drop',value:100,seconds:45});
  60 |   const added=await api.addDrone({name:'QA-no-telemetry'});id=added.drone.id;
  61 |   truth.subscribe(topic(id,'flight_status'));truth.subscribe(topic(id,'battery'));
  62 |   await cockpit.selectDrone(id);
  63 |   await expect(page.getByTestId('telemetry-battery'),'New drone has never delivered battery telemetry; values must be unavailable').toHaveText('—');
  64 |   expect(truth.messages.has(topic(id,'flight_status')),'Independent socket confirms this new drone has no retained or delivered flight status').toBe(false);
  65 |   expect((await api.state()).drones[id].status,'Known new drone is grounded in simulator truth').toBe('standby');
  66 |   await expect(cockpit.flightPill(id),'A drone with no telemetry must show unknown/unavailable, never invented in_flight or online').toHaveText(/^(—|unknown|offline|unavailable|no data)$/i);
  67 |   await expect(cockpit.flightPill(),'Selected drone without telemetry must not claim a known flight phase').toHaveText(/^(—|unknown|offline|unavailable|no data)$/i);
  68 |   const screen=testInfo.outputPath('no-telemetry-screen.png');await page.screenshot({path:screen});
  69 |   await testInfo.attach('no-telemetry-screen',{path:screen,contentType:'image/png'});
  70 |  } catch(error) {
> 71 |   const screen=testInfo.outputPath('no-telemetry-screen.png');await page.screenshot({path:screen});
     |                                                                          ^ Error: page.screenshot: Target page, context or browser has been closed
  72 |   await testInfo.attach('no-telemetry-screen',{path:screen,contentType:'image/png'});
  73 |   throw error;
  74 |  } finally {
  75 |   truth.close();
  76 |   try {await api.clearFaults();} finally {if(id)await api.removeDrone(id);}
  77 |  }
  78 | });
  79 | 
```