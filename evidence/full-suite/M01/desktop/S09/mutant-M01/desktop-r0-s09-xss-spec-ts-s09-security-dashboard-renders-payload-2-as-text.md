# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S09-xss.spec.ts >> S09 @security dashboard renders payload 2 as text
- Location: scenarios/S09-xss.spec.ts:6:2

# Error details

```
Error: Drone name is interpreted as HTML on dashboard rather than shown as literal operator text

expect(locator).toContainText(expected) failed

Locator: getByTestId('dash-row-drone-211')
Timeout: 10000ms
- Expected substring  -  1
+ Received string     + 14

- "><svg onload=window.__xss=2>
+
+         ">drone-211 · dock-211
+         standby
+         100 %
+         0.0 m
+         0.0 m/s
+         0 m
+         off
+         
+           Take off
+           Land
+           Start video
+           Remove
+         

Call log:
  - Drone name is interpreted as HTML on dashboard rather than shown as literal operator text getByTestId('dash-row-drone-211') with timeout 10000ms
  - waiting for getByTestId('dash-row-drone-211')
    24 × locator resolved to <tr data-testid="dash-row-drone-211">…</tr>
       - unexpected value "
        ">drone-211 · dock-211
        standby
        100 %
        0.0 m
        0.0 m/s
        0 m
        off
        
          Take off
          Land
          Start video
          Remove
        "

```

```yaml
- row "\"> drone-211 · dock-211 standby 100 % 0.0 m 0.0 m/s 0 m off Take off Land Start video Remove":
  - cell "\"> drone-211 · dock-211":
    - text: "\">"
    - img
    - text: drone-211 · dock-211
  - cell "standby"
  - cell "100 %"
  - cell "0.0 m"
  - cell "0.0 m/s"
  - cell "0 m"
  - cell "off"
  - cell "Take off Land Start video Remove":
    - button "Take off"
    - button "Land" [disabled]
    - button "Start video"
    - button "Remove"
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
  15 |    await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__xss')),{message:`Stored XSS: a drone name executes JavaScript in the ${surface}, compromising the operator session`}).toBeUndefined();
> 16 |    await expect(row,`Drone name is interpreted as HTML on ${surface} rather than shown as literal operator text`).toContainText(name);
     |                                                                                                                   ^ Error: Drone name is interpreted as HTML on dashboard rather than shown as literal operator text
  17 |    await expect(row.locator('img[src="x"],svg[onload]'),'Operator-supplied name must not create executable HTML nodes').toHaveCount(0);
  18 |   } finally {await api.removeDrone(drone.id);}
  19 |  });
  20 | }
  21 | 
```