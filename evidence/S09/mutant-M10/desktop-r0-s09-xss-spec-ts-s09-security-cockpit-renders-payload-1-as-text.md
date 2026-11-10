# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S09-xss.spec.ts >> S09 @security cockpit renders payload 1 as text
- Location: scenarios/S09-xss.spec.ts:6:2

# Error details

```
Error: Stored XSS: a drone name executes JavaScript in the cockpit, compromising the operator session

Stored XSS: a drone name executes JavaScript in the cockpit, compromising the operator session

expect(received).toBeUndefined()

Received: 1

Call Log:
- Timeout 10000ms exceeded while waiting on the predicate
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
            - definition [ref=e69]: W 3.3 m/s
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
  - generic [aria-hidden]: "S09 FAILED: drone name executed JavaScript on cockpit; __xss=1"
```

# Test source

```ts
  1  | import { expect } from '../lib/fixtures.js';
  2  | import { securityTest as test } from '../lib/ext/t04.js';
  3  | import { narrate } from '../lib/overlay.js';
  4  | const payloads=['<img src=x onerror=window.__xss=1>', '"><svg onload=window.__xss=2>'];
  5  | for (const surface of ['cockpit','dashboard'] as const) for (const [index,name] of payloads.entries()) {
  6  |  test(`S09 @security ${surface} renders payload ${index+1} as text`,async({page,api,cockpit,appLock})=>{
  7  |   const {drone}=await api.addDrone({name});
  8  |   try {
  9  |    if(surface==='cockpit') await cockpit.open(); else await page.goto(`${api.baseURL}/dashboard`);
  10 |    await narrate(page,`S09: operator-supplied name must remain text on ${surface}`);
  11 |    const row=page.getByTestId(`${surface==='cockpit'?'device-row':'dash-row'}-${drone.id}`);
  12 |    await expect(row).toBeVisible(); await row.evaluate(element=>element.scrollIntoView({block:"center"}));
  13 |    const marker=await page.evaluate(()=>Reflect.get(window,'__xss'));
  14 |    if(marker!==undefined)await narrate(page,`S09 FAILED: drone name executed JavaScript on ${surface}; __xss=${marker}`);
> 15 |    await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__xss')),{message:`Stored XSS: a drone name executes JavaScript in the ${surface}, compromising the operator session`}).toBeUndefined();
     |                                                                                                                                                                                        ^ Error: Stored XSS: a drone name executes JavaScript in the cockpit, compromising the operator session
  16 |    await expect(row,`Drone name is interpreted as HTML on ${surface} rather than shown as literal operator text`).toContainText(name);
  17 |    await expect(row.locator('img[src="x"],svg[onload]'),'Operator-supplied name must not create executable HTML nodes').toHaveCount(0);
  18 |   } finally {await api.removeDrone(drone.id);}
  19 |  });
  20 | }
  21 | 
```