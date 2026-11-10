# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S03-selected-telemetry.spec.ts >> S03 · selected drone shows its real battery, altitude and speed @telemetry @visual
- Location: scenarios/S03-selected-telemetry.spec.ts:10:1

# Error details

```
Error: Selected QA-7733ab3e-flying-B battery must match API for drone-195, not the previously selected drone's battery (tolerance 2%)

Selected QA-7733ab3e-flying-B battery must match API for drone-195, not the previously selected drone's battery (tolerance 2%)

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 2
Received:    6.700000000000003

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
      - generic [ref=e41]:
        - heading "Drone Telemetry · Drone 1 standby" [level=2] [ref=e42]:
          - generic [ref=e43]: Drone Telemetry · Drone 1
          - generic [ref=e44]: standby
        - generic [ref=e45]:
          - generic [ref=e46]:
            - term [ref=e47]: Battery
            - definition [ref=e48]: —
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
            - definition [ref=e69]: N 1.3 m/s
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
  - generic [aria-hidden]: "S03 · select flying drone: compare panel to API and raw socket"
```

# Test source

```ts
  1  | import { test, expect } from '../lib/fixtures.js';
  2  | import { createTruthSocket, topic } from '../lib/socket.js';
  3  | import { expectTelemetryMatchesState } from '../lib/oracles.js';
  4  | import { readTelemetryFast } from '../lib/ext/t03.js';
  5  | import { narrate } from '../lib/overlay.js';
  6  | 
  7  | interface PositionTruth { position: { height:number; elevation:number }; speed:{horizontal:number;vertical:number}; timestamp:number }
  8  | interface BatteryTruth { percent:number }
  9  | 
  10 | test('S03 · selected drone shows its real battery, altitude and speed @telemetry @visual', async ({appLock,api,cockpit,page,isolatedDrone}) => {
  11 |   void appLock; test.setTimeout(110_000);
  12 |   const truth=createTruthSocket();
  13 |   const second=await api.addDrone({name:`${isolatedDrone.name}-flying-B`});
  14 |   const ids=[isolatedDrone.id,second.drone.id];
  15 |   try {
  16 |     for(const id of ids) for(const attribute of ['battery','global_position']) truth.subscribe(topic(id,attribute));
  17 |     await truth.connect();
  18 |     await cockpit.open();
  19 |     await cockpit.waitReady();
  20 |     await narrate(page,'S03 · prepare distinct batteries: fly B until it is at least 6% below grounded A');
  21 |     await cockpit.selectDrone(second.drone.id);
  22 |     expect((await api.command(second.drone.id,'takeoff')).ok,'Isolated drone must accept takeoff before telemetry comparison').toBe(true);
  23 |     await api.waitFor(async()=> (await api.state()).drones[second.drone.id]?.status==='in_flight', {timeout:30_000,message:'Isolated drone failed to reach cruising flight for selected-drone telemetry comparison'});
  24 |     await truth.waitFor<PositionTruth>(topic(second.drone.id,'global_position'),p=>p.position.height>=28 && p.speed.horizontal>0);
  25 | 
  26 |     await api.waitFor(async()=> { const state=await api.state();return state.drones[isolatedDrone.id].battery-state.drones[second.drone.id].battery>=6; },{timeout:75_000,interval:500,message:'Battery-switch oracle requires API-confirmed A/B battery separation of at least 6%, beyond the 2% display tolerance'});
  27 |     await narrate(page,'S03 · select grounded A, then flying B: B battery must match B API, not prior A');
  28 |     await cockpit.selectDrone(isolatedDrone.id);
  29 |     await expect(page.getByRole('heading',{name:new RegExp(`Drone Telemetry.*${isolatedDrone.name}`)})).toBeVisible();
  30 | 
  31 |     const compareSelected=async(id:string,name:string)=> {
  32 |       await cockpit.selectDrone(id);
  33 |       await expect(page.getByRole('heading',{name:new RegExp(`Drone Telemetry.*${name}`)}),'Telemetry heading must identify the drone the operator selected').toBeVisible();
  34 |       await expect.poll(async()=> {
  35 |         const state=(await api.state()).drones[id];
  36 |         const shown=(await readTelemetryFast(page)).battery;
  37 |         return shown===null?Infinity:Math.abs(shown-state.battery);
> 38 |       },{timeout:8_000,message:`Selected ${name} battery must match API for ${id}, not the previously selected drone's battery (tolerance 2%)`}).toBeLessThanOrEqual(2);
     |                                                                                                                                                  ^ Error: Selected QA-7733ab3e-flying-B battery must match API for drone-195, not the previously selected drone's battery (tolerance 2%)
  39 |       await expect(async()=> {
  40 |         const state=(await api.state()).drones[id];
  41 |         const position=await truth.waitFor<PositionTruth>(topic(id,'global_position'));
  42 |         const battery=await truth.waitFor<BatteryTruth>(topic(id,'battery'));
  43 |         expect(Date.now()-position.timestamp,'Raw telemetry must be current within the allowed two-second lag').toBeLessThanOrEqual(2_000);
  44 |         const displayed=await readTelemetryFast(page);
  45 |         expectTelemetryMatchesState(displayed,{battery:state.battery,altRlt:state.height,altAgl:state.height},{battery:2,altRlt:2,altAgl:2});
  46 |         expectTelemetryMatchesState(displayed,{battery:battery.percent,altRlt:position.position.height,altAsl:position.position.elevation,hspeed:position.speed.horizontal,vspeed:position.speed.vertical},{battery:2,altRlt:2,altAsl:2,hspeed:1,vspeed:1});
  47 |       }).toPass({timeout:8_000,intervals:[100,200,300]});
  48 |     };
  49 |     await narrate(page,'S03 · select flying drone: compare panel to API and raw socket');
  50 |     await compareSelected(second.drone.id,second.drone.name);
  51 |     const flying=await readTelemetryFast(page);
  52 |     await narrate(page,'S03 · switch to grounded drone: name, altitude and speed must change');
  53 |     await compareSelected(isolatedDrone.id,isolatedDrone.name);
  54 |     const grounded=await readTelemetryFast(page);
  55 |     expect(flying.altRlt! - grounded.altRlt!,'Switching drones must replace flying altitude with the grounded drone’s altitude').toBeGreaterThan(25);
  56 |     expect(flying.hspeed! - grounded.hspeed!,'Switching drones must replace cruise speed with the grounded drone’s speed').toBeGreaterThan(8);
  57 |     await narrate(page,'S03 · switch back: flying telemetry must return');
  58 |     await compareSelected(second.drone.id,second.drone.name);
  59 |   } finally {
  60 |     truth.close();
  61 |     await api.removeDrone(second.drone.id);
  62 |   }
  63 | });
  64 | 
```