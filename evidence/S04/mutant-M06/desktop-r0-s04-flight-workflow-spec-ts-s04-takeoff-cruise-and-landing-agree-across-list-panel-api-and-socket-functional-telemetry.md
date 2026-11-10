# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S04-flight-workflow.spec.ts >> S04 · takeoff, cruise and landing agree across list, panel, API and socket @functional @telemetry
- Location: scenarios/S04-flight-workflow.spec.ts:9:1

# Error details

```
Error: Flight phase standby: device list and selected telemetry must agree with API/raw socket; a wrong phase misleads the operator

Flight phase standby: device list and selected telemetry must agree with API/raw socket; a wrong phase misleads the operator

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

  Object {
    "api": "standby",
    "list": "standby",
-   "panel": "standby",
+   "panel": "docked",
    "socket": "standby",
  }

Call Log:
- Timeout 8000ms exceeded while waiting on the predicate
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
              - generic [ref=e43]: QA-17e4241b
              - generic [ref=e44]: Dock 146
            - generic [ref=e45]:
              - generic [ref=e46]: dock closed
              - generic [ref=e47]: standby
      - generic [ref=e48]:
        - heading "Drone Telemetry · QA-17e4241b docked" [level=2] [ref=e49]:
          - generic [ref=e50]: Drone Telemetry · QA-17e4241b
          - generic [ref=e51]: docked
        - generic [ref=e52]:
          - generic [ref=e53]:
            - term [ref=e54]: Battery
            - definition [ref=e55]: 100 %
          - generic [ref=e56]:
            - term [ref=e57]: Altitude RLT
            - definition [ref=e58]: 0.0 m
          - generic [ref=e59]:
            - term [ref=e60]: Altitude AGL
            - definition [ref=e61]: 0.0 m
          - generic [ref=e62]:
            - term [ref=e63]: Altitude ASL
            - definition [ref=e64]: 560.0 m
          - generic [ref=e65]:
            - term [ref=e66]: H-Speed
            - definition [ref=e67]: 0.0 m/s
          - generic [ref=e68]:
            - term [ref=e69]: V-Speed
            - definition [ref=e70]: 0.0 m/s
          - generic [ref=e71]:
            - term [ref=e72]: Heading
            - definition [ref=e73]: 129 °
          - generic [ref=e74]:
            - term [ref=e75]: Wind
            - definition [ref=e76]: W 3.6 m/s
          - generic [ref=e77]:
            - term [ref=e78]: Dist. from home
            - definition [ref=e79]: 0 m
    - main [ref=e80]:
      - group "Map view" [ref=e86]:
        - button "2D" [ref=e87] [cursor=pointer]
        - button "3D" [pressed] [ref=e88] [cursor=pointer]
      - generic [ref=e89]:
        - generic [ref=e90]:
          - generic [ref=e91]: FPV · QA-17e4241b
          - generic [ref=e92]: "off"
        - generic [ref=e93]: Video off
  - generic [aria-hidden]: "S04 · start grounded: both status pills match API and socket standby"
```

# Test source

```ts
  1  | import { test, expect } from '../lib/fixtures.js';
  2  | import { createTruthSocket, topic } from '../lib/socket.js';
  3  | import { readTelemetryFast } from '../lib/ext/t03.js';
  4  | import { narrate } from '../lib/overlay.js';
  5  | 
  6  | interface FlightTruth { flight_status:string }
  7  | interface PositionTruth { position:{height:number}; timestamp:number }
  8  | 
  9  | test('S04 · takeoff, cruise and landing agree across list, panel, API and socket @functional @telemetry',async({appLock,api,cockpit,page,isolatedDrone})=> {
  10 |   void appLock; test.setTimeout(100_000);
  11 |   const id=isolatedDrone.id;
  12 |   const truth=createTruthSocket();
  13 |   truth.subscribe(topic(id,'flight_status'));
  14 |   truth.subscribe(topic(id,'global_position'));
  15 |   try {
  16 |     await truth.connect();
  17 |     await cockpit.open(); await cockpit.waitReady(); await cockpit.selectDrone(id);
  18 |     const checkStatus=async(status:string)=> {
  19 |       await api.waitFor(async()=> (await api.state()).drones[id]?.status===status,{timeout:40_000,message:`Flight command did not reach ${status} in API truth`});
  20 |       await truth.waitFor<FlightTruth>(topic(id,'flight_status'),p=>p.flight_status===status,2_000);
  21 |       await expect.poll(async()=> {
  22 |         const [state,pills]=await Promise.all([api.state(),page.evaluate((id)=>({list:document.querySelector(`[data-testid="device-row-${id}"] .device-pills .pill:last-child`)?.textContent?.trim(),panel:document.querySelector('[data-testid="status-flight"]')?.textContent?.trim()}),id)]);
  23 |         return {api:state.drones[id]?.status,socket:(truth.messages.get(topic(id,'flight_status')) as FlightTruth)?.flight_status,...pills};
> 24 |       },{timeout:8_000,message:`Flight phase ${status}: device list and selected telemetry must agree with API/raw socket; a wrong phase misleads the operator`}).toEqual({api:status,socket:status,list:status,panel:status});
     |                                                                                                                                                                   ^ Error: Flight phase standby: device list and selected telemetry must agree with API/raw socket; a wrong phase misleads the operator
  25 | 
  26 |     };
  27 |     await narrate(page,'S04 · start grounded: both status pills match API and socket standby');
  28 |     // The real simulator calls its grounded/landed state standby.
  29 |     await checkStatus('standby');
  30 |     const startingHeight=(await api.state()).drones[id].height;
  31 |     expect(startingHeight,'Known starting state must be a grounded isolated drone').toBe(0);
  32 |     await narrate(page,'S04 · command takeoff: list and panel must show taking_off');
  33 |     expect((await api.command(id,'takeoff')).ok,'The isolated drone must accept takeoff').toBe(true);
  34 |     await checkStatus('taking_off');
  35 |     await narrate(page,'S04 · climb to cruise: both pills show in_flight and altitude reaches 30 m');
  36 |     await checkStatus('in_flight');
  37 |     await expect(async()=> {
  38 |       const state=(await api.state()).drones[id];
  39 |       const position=await truth.waitFor<PositionTruth>(topic(id,'global_position'),p=>p.position.height>=28,2_000);
  40 |       const displayed=(await readTelemetryFast(page)).altRlt;
  41 |       expect(state.height,'API must confirm climb to cruising altitude').toBeGreaterThanOrEqual(28);
  42 |       expect(displayed,'Operator must see numeric altitude during flight').not.toBeNull();
  43 |       expect(Math.abs(displayed!-state.height),'Operator altitude must match API within 2 m at cruise').toBeLessThanOrEqual(2);
  44 |       expect(Math.abs(displayed!-position.position.height),'Operator altitude must match raw socket within 2 m at cruise').toBeLessThanOrEqual(2);
  45 |       expect(displayed! - startingHeight,'Operator must see altitude rise from the grounded starting state').toBeGreaterThanOrEqual(28);
  46 |     }).toPass({timeout:8_000,intervals:[100,200]});
  47 |     await narrate(page,'S04 · command land: list and panel must show landing');
  48 |     expect((await api.command(id,'land')).ok,'The flying isolated drone must accept landing').toBe(true);
  49 |     await checkStatus('landing');
  50 |     await narrate(page,'S04 · complete landing: both status pills return to standby and altitude is zero');
  51 |     await checkStatus('standby');
  52 |     await expect.poll(async()=> (await readTelemetryFast(page)).altRlt,{timeout:2_000,message:'After landing the operator must see grounded altitude, not a stale cruise height'}).toBe(0);
  53 |     expect((await api.state()).drones[id].height,'API must confirm completed landing at zero altitude').toBe(0);
  54 |   } finally { truth.close(); }
  55 | });
  56 | 
```