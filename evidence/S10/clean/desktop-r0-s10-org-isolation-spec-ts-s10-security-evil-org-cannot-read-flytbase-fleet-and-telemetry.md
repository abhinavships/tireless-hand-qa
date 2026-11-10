# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S10-org-isolation.spec.ts >> S10 @security evil org cannot read FlytBase fleet and telemetry
- Location: scenarios/S10-org-isolation.spec.ts:6:52

# Error details

```
Error: Organization isolation broken: evil org receives FlytBase fleet/telemetry (devices, flytbase/drone-1/telemetry/battery)

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 4

- Array []
+ Array [
+   "devices",
+   "flytbase/drone-1/telemetry/battery",
+ ]
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
            - definition [ref=e69]: N 5.1 m/s
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
  - generic [aria-hidden]: "S10 FAILED: evil org received 2 forbidden topics; expected no FlytBase fleet/telemetry"
  - generic [ref=e87]: "CLIENT org-id: evil EXPECTED: refused or no FlytBase topics ACTUAL RECEIVED: { \"devices\": [ { \"id\": \"dock-1\", \"type\": \"dock\", \"name\": \"Dock 1\", \"droneId\": \"drone-1\" }, { \"id\": \"dock-2\", \"type\": \"dock\", \"name\": \"Dock 2\", \"droneId\": \"drone-2\" }, { \"id\": \"dock-3\", \"type\": \"dock\", \"name\": \"Dock 3\", \"droneId\": \"drone-3\" }, { \"id\": \"dock-4\", \"type\": \"dock\", \"name\": \"Dock 4\", \"droneId\": \"drone-4\" }, { \"id\": \"drone-1\", \"type\": \"drone\", \"name\": \"Drone 1\", \"dockId\": \"dock-1\" }, { \"id\": \"drone-2\", \"type\": \"drone\", \"name\": \"Drone 2\", \"dockId\": \"dock-2\" }, { \"id\": \"drone-3\", \"type\": \"drone\", \"name\": \"Drone 3\", \"dockId\": \"dock-3\" }, { \"id\": \"drone-4\", \"type\": \"drone\", \"name\": \"Drone 4\", \"dockId\": \"dock-4\" } ], \"flytbase/drone-1/telemetry/battery\": { \"percent\": 100, \"voltage\": 25.2, \"temperature\": 30, \"remaining_flight_time\": 1000 } }"
```

# Test source

```ts
  1  | import { expect } from '../lib/fixtures.js';
  2  | import { securityTest as test } from '../lib/ext/t04.js';
  3  | import { io } from 'socket.io-client';
  4  | import { narrate } from '../lib/overlay.js';
  5  | import { TruthSocket, topic } from '../lib/socket.js';
  6  | for(const identity of ['evil','missing'] as const) test(`S10 @security ${identity} org cannot read FlytBase fleet and telemetry`,async({page,api,cockpit,appLock},info)=>{
  7  |  await cockpit.open(); await narrate(page,`S10: ${identity} org must not receive FlytBase private fleet or telemetry`);
  8  |  const fleet=await api.devices(); const drone=fleet.devices.find(d=>d.type==='drone')!;
  9  |  const telemetry=topic(drone.id,'battery'); const valid=new TruthSocket('flytbase',api.baseURL);
  10 |  // Explicit empty auth: TruthSocket(undefined) has a default parameter and would accidentally send flytbase.
  11 |  const unauthorized=io(api.baseURL,{autoConnect:false,reconnection:false,auth:identity==='missing'?{}:{'org-id':identity}});
  12 |  const received:Record<string,unknown>={}; unauthorized.onAny((event,payload)=>{received[event]=payload;});
  13 |  try {
  14 |   await valid.connect(); await valid.waitFor('devices'); await valid.waitFor(telemetry);
  15 |   const result=await new Promise<string>(resolve=>{
  16 |    const timer=setTimeout(()=>resolve('observation complete'),2500);
  17 |    unauthorized.once('connect_error',()=>{clearTimeout(timer);resolve('refused');});
  18 |    unauthorized.once('connect',()=>{unauthorized.emit('Subscribe',{topic:'devices'});unauthorized.emit('Subscribe',{topic:telemetry});unauthorized.emit('Subscribe',{topic:topic(drone.id,'battery','another-org')});});
  19 |    unauthorized.connect();
  20 |   });
  21 |   await info.attach('org-probe.json',{body:JSON.stringify({identity,result,received},null,2),contentType:'application/json'});
  22 |   const leaked=Object.keys(received).filter(t=>t==='devices'||t.startsWith('flytbase/'));
  23 |   await page.evaluate(({identity,received})=>{const proof=document.createElement('pre');proof.id='org-isolation-proof';proof.textContent=`CLIENT org-id: ${identity}\nEXPECTED: refused or no FlytBase topics\nACTUAL RECEIVED:\n${JSON.stringify(received,null,2)}`;Object.assign(proof.style,{position:'fixed',bottom:'12px',right:'12px',width:'min(600px,90vw)',maxHeight:'45vh',overflow:'auto',background:'#101827',color:'#fff',padding:'14px',zIndex:'2147483646',font:'13px monospace'});document.body.appendChild(proof);},{identity,received});
  24 |   await narrate(page,`S10 FAILED: ${identity} org received ${leaked.length} forbidden topics; expected no FlytBase fleet/telemetry`);
> 25 |   expect(leaked,`Organization isolation broken: ${identity} org receives FlytBase fleet/telemetry (${leaked.join(', ')})`).toEqual([]);
     |                                                                                                                            ^ Error: Organization isolation broken: evil org receives FlytBase fleet/telemetry (devices, flytbase/drone-1/telemetry/battery)
  26 |  } finally {valid.close();unauthorized.disconnect();unauthorized.removeAllListeners();}
  27 | });
  28 | 
```