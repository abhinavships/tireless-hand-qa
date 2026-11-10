# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S09-xss.spec.ts >> S09 @security dashboard renders payload 1 as text
- Location: scenarios/S09-xss.spec.ts:6:2

# Error details

```
Error: Stored XSS: a drone name executes JavaScript in the dashboard, compromising the operator session

Stored XSS: a drone name executes JavaScript in the dashboard, compromising the operator session

expect(received).toBeUndefined()

Received: 1

Call Log:
- Timeout 10000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - heading "Cockpit Control Panel" [level=1] [ref=e3]
    - generic [ref=e4]: connected
    - generic [ref=e5]: "sim: connected"
    - generic [ref=e6]: "video: up"
    - link "Open cockpit ↗" [ref=e8] [cursor=pointer]:
      - /url: http://localhost:4010
  - main [ref=e9]:
    - generic [ref=e10]:
      - heading "Simulator" [level=2] [ref=e11]
      - generic [ref=e12]:
        - button "Start" [ref=e13] [cursor=pointer]
        - button "Stop" [ref=e14] [cursor=pointer]
        - button "Reset" [ref=e15] [cursor=pointer]
        - generic [ref=e16]:
          - text: Speed
          - spinbutton "Speed" [ref=e17]: "1"
        - button "Apply" [ref=e18] [cursor=pointer]
        - generic [ref=e19]: tick 5015 · running · 1x
    - generic [ref=e20]:
      - heading "Add drone" [level=2] [ref=e21]
      - generic [ref=e22]:
        - textbox "Name (optional)" [ref=e23]
        - textbox "Latitude (optional)" [ref=e24]
        - textbox "Longitude (optional)" [ref=e25]
        - button "Add drone + dock" [ref=e26] [cursor=pointer]
        - button "Start all video" [ref=e27] [cursor=pointer]
        - button "Stop all video" [ref=e28] [cursor=pointer]
    - generic [ref=e29]:
      - heading "Drones" [level=2] [ref=e30]
      - table [ref=e31]:
        - rowgroup [ref=e32]:
          - row [ref=e33]:
            - columnheader "Drone" [ref=e34]
            - columnheader "Status" [ref=e35]
            - columnheader "Battery" [ref=e36]
            - columnheader "Height" [ref=e37]
            - columnheader "H-speed" [ref=e38]
            - columnheader "Dist. home" [ref=e39]
            - columnheader "Video" [ref=e40]
            - columnheader "Actions" [ref=e41]
        - rowgroup [ref=e42]:
          - row [ref=e43]:
            - cell "Drone 1 drone-1 · dock-1" [ref=e44]: Drone 1drone-1 · dock-1
            - cell "standby" [ref=e45]
            - cell "100 %" [ref=e46]
            - cell "0.0 m" [ref=e47]
            - cell "0.0 m/s" [ref=e48]
            - cell "0 m" [ref=e49]
            - cell "on" [ref=e50]
            - cell [ref=e51]:
              - button "Take off" [ref=e52] [cursor=pointer]
              - button "Land" [disabled] [ref=e53]
              - button "Stop video" [ref=e54] [cursor=pointer]
              - button "Remove" [ref=e55] [cursor=pointer]
          - row [ref=e56]:
            - cell "Drone 2 drone-2 · dock-2" [ref=e57]: Drone 2drone-2 · dock-2
            - cell "standby" [ref=e58]
            - cell "100 %" [ref=e59]
            - cell "0.0 m" [ref=e60]
            - cell "0.0 m/s" [ref=e61]
            - cell "0 m" [ref=e62]
            - cell "on" [ref=e63]
            - cell [ref=e64]:
              - button "Take off" [ref=e65] [cursor=pointer]
              - button "Land" [disabled] [ref=e66]
              - button "Stop video" [ref=e67] [cursor=pointer]
              - button "Remove" [ref=e68] [cursor=pointer]
          - row [ref=e69]:
            - cell "Drone 3 drone-3 · dock-3" [ref=e70]: Drone 3drone-3 · dock-3
            - cell "standby" [ref=e71]
            - cell "100 %" [ref=e72]
            - cell "0.0 m" [ref=e73]
            - cell "0.0 m/s" [ref=e74]
            - cell "0 m" [ref=e75]
            - cell "on" [ref=e76]
            - cell [ref=e77]:
              - button "Take off" [ref=e78] [cursor=pointer]
              - button "Land" [disabled] [ref=e79]
              - button "Stop video" [ref=e80] [cursor=pointer]
              - button "Remove" [ref=e81] [cursor=pointer]
          - row [ref=e82]:
            - cell "Drone 4 drone-4 · dock-4" [ref=e83]: Drone 4drone-4 · dock-4
            - cell "standby" [ref=e84]
            - cell "100 %" [ref=e85]
            - cell "0.0 m" [ref=e86]
            - cell "0.0 m/s" [ref=e87]
            - cell "0 m" [ref=e88]
            - cell "on" [ref=e89]
            - cell [ref=e90]:
              - button "Take off" [ref=e91] [cursor=pointer]
              - button "Land" [disabled] [ref=e92]
              - button "Stop video" [ref=e93] [cursor=pointer]
              - button "Remove" [ref=e94] [cursor=pointer]
    - group [ref=e95]:
      - generic "▸ Faults — break things on purpose (socket and video)" [ref=e96] [cursor=pointer]
      - option "all" [selected]
      - option "Drone 1"
      - option "Drone 2"
      - option "Drone 3"
      - option "Drone 4"
    - heading "Log" [level=2] [ref=e98]
  - generic [aria-hidden]: "S09 FAILED: drone name executed JavaScript on dashboard; __xss=1"
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
     |                                                                                                                                                                                        ^ Error: Stored XSS: a drone name executes JavaScript in the dashboard, compromising the operator session
  16 |    await expect(row,`Drone name is interpreted as HTML on ${surface} rather than shown as literal operator text`).toContainText(name);
  17 |    await expect(row.locator('img[src="x"],svg[onload]'),'Operator-supplied name must not create executable HTML nodes').toHaveCount(0);
  18 |   } finally {await api.removeDrone(drone.id);}
  19 |  });
  20 | }
  21 | 
```