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
          - listitem [ref=e41] [cursor=pointer]:
            - generic [ref=e42]:
              - generic [ref=e43]: QA-29a46bf2
              - generic [ref=e44]: Dock 64
            - generic [ref=e45]:
              - generic [ref=e46]: dock closed
              - generic [ref=e47]: standby
      - generic [ref=e48]:
        - heading "Drone Telemetry · Drone 1 standby" [level=2] [ref=e49]:
          - generic [ref=e50]: Drone Telemetry · Drone 1
          - generic [ref=e51]: standby
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
            - definition [ref=e73]: 47 °
          - generic [ref=e74]:
            - term [ref=e75]: Wind
            - definition [ref=e76]: N 3.5 m/s
          - generic [ref=e77]:
            - term [ref=e78]: Dist. from home
            - definition [ref=e79]: 0 m
    - main [ref=e80]:
      - group "Map view" [ref=e86]:
        - button "2D" [ref=e87] [cursor=pointer]
        - button "3D" [pressed] [ref=e88] [cursor=pointer]
      - generic [ref=e90]:
        - generic [ref=e91]: FPV · Drone 1
        - generic [ref=e92]: live
  - generic [aria-hidden]: "S10: evil org received 2 forbidden FlytBase topics"
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
  23 |   await narrate(page,`S10: ${identity} org received ${leaked.length} forbidden FlytBase topics`);
> 24 |   expect(leaked,`Organization isolation broken: ${identity} org receives FlytBase fleet/telemetry (${leaked.join(', ')})`).toEqual([]);
     |                                                                                                                            ^ Error: Organization isolation broken: evil org receives FlytBase fleet/telemetry (devices, flytbase/drone-1/telemetry/battery)
  25 |  } finally {valid.close();unauthorized.disconnect();unauthorized.removeAllListeners();}
  26 | });
  27 | 
```