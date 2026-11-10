# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S09-xss.spec.ts >> S09 @security cockpit renders payload 2 as text
- Location: scenarios/S09-xss.spec.ts:6:2

# Error details

```
Error: Drone name is interpreted as HTML on cockpit rather than shown as literal operator text

expect(locator).toContainText(expected) failed

Locator: getByTestId('device-row-drone-151')
Expected substring: "\"><svg onload=window.__xss=2>"
Received string:    "\">Dock 151dock closedstandby"
Timeout: 10000ms

Call log:
  - Drone name is interpreted as HTML on cockpit rather than shown as literal operator text getByTestId('device-row-drone-151') with timeout 10000ms
  - waiting for getByTestId('device-row-drone-151')
    23 × locator resolved to <li class="device-row " data-testid="device-row-drone-151">…</li>
       - unexpected value "">Dock 151dock closedstandby"

```

```yaml
- listitem:
  - text: "\">"
  - img
  - text: Dock 151 dock closed standby
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
     |                                                                                                                   ^ Error: Drone name is interpreted as HTML on cockpit rather than shown as literal operator text
  17 |    await expect(row.locator('img[src="x"],svg[onload]'),'Operator-supplied name must not create executable HTML nodes').toHaveCount(0);
  18 |   } finally {await api.removeDrone(drone.id);}
  19 |  });
  20 | }
  21 | 
```