# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S13-accessibility-baseline.spec.ts >> S13 @visual @a11y cockpit and control panel introduce no serious accessibility barriers
- Location: scenarios/S13-accessibility-baseline.spec.ts:11:1

# Error details

```
Error: Operators face new serious/critical accessibility barriers on dashboard; unnamed buttons cannot communicate their action

expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 10

- Array []
+ Array [
+   "button-name (critical) at [\"#sim-start\"]: Fix any of the following:
+   Element does not have inner text that is visible to screen readers
+   aria-label attribute does not exist or is empty
+   aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty
+   Element has no title attribute
+   Element does not have an implicit (wrapped) <label>
+   Element does not have an explicit <label>
+   Element's default semantics were not overridden with role=\"none\" or role=\"presentation\"",
+ ]
```

# Page snapshot

```yaml
- generic [ref=f1e1]:
  - banner [ref=f1e2]:
    - heading "Cockpit Control Panel" [level=1] [ref=f1e3]
    - generic [ref=f1e4]: connected
    - generic [ref=f1e5]: "sim: connected"
    - generic [ref=f1e6]: "video: up"
    - link "Open cockpit ↗" [ref=f1e8] [cursor=pointer]:
      - /url: http://localhost:4010
  - main [ref=f1e9]:
    - generic [ref=f1e10]:
      - heading "Simulator" [level=2] [ref=f1e11]
      - generic [ref=f1e12]:
        - button [ref=f1e13] [cursor=pointer]: ▶
        - button "Stop" [ref=f1e14] [cursor=pointer]
        - button "Reset" [ref=f1e15] [cursor=pointer]
        - generic [ref=f1e16]:
          - text: Speed
          - spinbutton "Speed" [ref=f1e17]: "1"
        - button "Apply" [ref=f1e18] [cursor=pointer]
        - generic [ref=f1e19]: tick 6580 · running · 1x
    - generic [ref=f1e20]:
      - heading "Add drone" [level=2] [ref=f1e21]
      - generic [ref=f1e22]:
        - textbox "Name (optional)" [ref=f1e23]
        - textbox "Latitude (optional)" [ref=f1e24]
        - textbox "Longitude (optional)" [ref=f1e25]
        - button "Add drone + dock" [ref=f1e26] [cursor=pointer]
        - button "Start all video" [ref=f1e27] [cursor=pointer]
        - button "Stop all video" [ref=f1e28] [cursor=pointer]
    - generic [ref=f1e29]:
      - heading "Drones" [level=2] [ref=f1e30]
      - table [ref=f1e31]:
        - rowgroup [ref=f1e32]:
          - row [ref=f1e33]:
            - columnheader "Drone" [ref=f1e34]
            - columnheader "Status" [ref=f1e35]
            - columnheader "Battery" [ref=f1e36]
            - columnheader "Height" [ref=f1e37]
            - columnheader "H-speed" [ref=f1e38]
            - columnheader "Dist. home" [ref=f1e39]
            - columnheader "Video" [ref=f1e40]
            - columnheader "Actions" [ref=f1e41]
        - rowgroup [ref=f1e42]:
          - row [ref=f1e43]:
            - cell "Drone 1 drone-1 · dock-1" [ref=f1e44]: Drone 1drone-1 · dock-1
            - cell "standby" [ref=f1e45]
            - cell "100 %" [ref=f1e46]
            - cell "0.0 m" [ref=f1e47]
            - cell "0.0 m/s" [ref=f1e48]
            - cell "0 m" [ref=f1e49]
            - cell "on" [ref=f1e50]
            - cell [ref=f1e51]:
              - button "Take off" [ref=f1e52] [cursor=pointer]
              - button "Land" [disabled] [ref=f1e53]
              - button "Stop video" [ref=f1e54] [cursor=pointer]
              - button "Remove" [ref=f1e55] [cursor=pointer]
          - row [ref=f1e56]:
            - cell "Drone 2 drone-2 · dock-2" [ref=f1e57]: Drone 2drone-2 · dock-2
            - cell "standby" [ref=f1e58]
            - cell "100 %" [ref=f1e59]
            - cell "0.0 m" [ref=f1e60]
            - cell "0.0 m/s" [ref=f1e61]
            - cell "0 m" [ref=f1e62]
            - cell "on" [ref=f1e63]
            - cell [ref=f1e64]:
              - button "Take off" [ref=f1e65] [cursor=pointer]
              - button "Land" [disabled] [ref=f1e66]
              - button "Stop video" [ref=f1e67] [cursor=pointer]
              - button "Remove" [ref=f1e68] [cursor=pointer]
          - row [ref=f1e69]:
            - cell "Drone 3 drone-3 · dock-3" [ref=f1e70]: Drone 3drone-3 · dock-3
            - cell "standby" [ref=f1e71]
            - cell "100 %" [ref=f1e72]
            - cell "0.0 m" [ref=f1e73]
            - cell "0.0 m/s" [ref=f1e74]
            - cell "0 m" [ref=f1e75]
            - cell "on" [ref=f1e76]
            - cell [ref=f1e77]:
              - button "Take off" [ref=f1e78] [cursor=pointer]
              - button "Land" [disabled] [ref=f1e79]
              - button "Stop video" [ref=f1e80] [cursor=pointer]
              - button "Remove" [ref=f1e81] [cursor=pointer]
          - row [ref=f1e82]:
            - cell "Drone 4 drone-4 · dock-4" [ref=f1e83]: Drone 4drone-4 · dock-4
            - cell "standby" [ref=f1e84]
            - cell "100 %" [ref=f1e85]
            - cell "0.0 m" [ref=f1e86]
            - cell "0.0 m/s" [ref=f1e87]
            - cell "0 m" [ref=f1e88]
            - cell "on" [ref=f1e89]
            - cell [ref=f1e90]:
              - button "Take off" [ref=f1e91] [cursor=pointer]
              - button "Land" [disabled] [ref=f1e92]
              - button "Stop video" [ref=f1e93] [cursor=pointer]
              - button "Remove" [ref=f1e94] [cursor=pointer]
          - row [ref=f1e95]:
            - cell "QA-1ce4cfac drone-142 · dock-142" [ref=f1e96]: QA-1ce4cfacdrone-142 · dock-142
            - cell "standby" [ref=f1e97]
            - cell "100 %" [ref=f1e98]
            - cell "0.0 m" [ref=f1e99]
            - cell "0.0 m/s" [ref=f1e100]
            - cell "0 m" [ref=f1e101]
            - cell "off" [ref=f1e102]
            - cell [ref=f1e103]:
              - button "Take off" [ref=f1e104] [cursor=pointer]
              - button "Land" [disabled] [ref=f1e105]
              - button "Start video" [ref=f1e106] [cursor=pointer]
              - button "Remove" [ref=f1e107] [cursor=pointer]
    - group [ref=f1e108]:
      - generic "▾ Faults — break things on purpose (socket and video)" [active] [ref=f1e109] [cursor=pointer]
      - heading "Socket" [level=2] [ref=f1e110]
      - generic [ref=f1e111]:
        - button "Kick all clients" [ref=f1e112] [cursor=pointer]
        - button "Refuse connections" [ref=f1e113] [cursor=pointer]
        - generic [ref=f1e114]:
          - text: for
          - spinbutton "for s" [ref=f1e115]: "15"
          - text: s
        - button "Simulator offline" [ref=f1e116] [cursor=pointer]
        - generic [ref=f1e117]:
          - text: for
          - spinbutton "for s" [ref=f1e118]: "15"
          - text: s
      - generic [ref=f1e119]:
        - button "Delay telemetry" [ref=f1e120] [cursor=pointer]
        - generic [ref=f1e121]:
          - spinbutton "ms (+50% jitter)" [ref=f1e122]: "1500"
          - text: ms (+50% jitter)
        - button "Drop telemetry" [ref=f1e123] [cursor=pointer]
        - generic [ref=f1e124]:
          - spinbutton "%" [ref=f1e125]: "30"
          - text: "%"
        - generic [ref=f1e126]:
          - text: for
          - spinbutton "for s (0 = until cleared)" [ref=f1e127]: "0"
          - text: s (0 = until cleared)
      - heading "Video" [level=2] [ref=f1e128]
      - generic [ref=f1e129]:
        - generic [ref=f1e130]:
          - text: Drone
          - combobox "Drone" [ref=f1e131]:
            - option "all" [selected]
            - option "Drone 1"
            - option "Drone 2"
            - option "Drone 3"
            - option "Drone 4"
            - option "QA-1ce4cfac"
        - button "Freeze" [ref=f1e132] [cursor=pointer]
        - generic [ref=f1e133]:
          - text: for
          - spinbutton "for s" [ref=f1e134]: "10"
          - text: s
        - button "Stutter (3 fps)" [ref=f1e135] [cursor=pointer]
        - button "Degrade (320x180)" [ref=f1e136] [cursor=pointer]
        - button "Flicker" [ref=f1e137] [cursor=pointer]
        - generic [ref=f1e138]:
          - text: every
          - spinbutton "every s for 30 s" [ref=f1e139]: "5"
          - text: s for
          - spinbutton [ref=f1e140]: "30"
          - text: s
      - button "Clear all faults" [ref=f1e142] [cursor=pointer]
    - heading "Log" [level=2] [ref=f1e144]
  - generic [aria-hidden]: "S13: dashboard audit complete; 1 new serious/critical barriers."
```

# Test source

```ts
  1  | import { AxeBuilder } from '@axe-core/playwright';
  2  | import { readFile, writeFile } from 'node:fs/promises';
  3  | import { test, expect } from '../lib/fixtures.js';
  4  | import { narrate } from '../lib/overlay.js';
  5  | 
  6  | interface Allowance { id: string; impact: string; selector: string; reason: string }
  7  | const baseline = JSON.parse(await readFile(new URL('../contracts/a11y-baseline.json', import.meta.url), 'utf8')) as {
  8  |   pages: Record<string, Allowance[]>;
  9  | };
  10 | 
  11 | test('S13 @visual @a11y cockpit and control panel introduce no serious accessibility barriers', async ({ page, cockpit, api, isolatedDrone }, info) => {
  12 |   test.skip(info.project.name !== 'desktop', 'Reviewed desktop accessibility baseline');
  13 |   void isolatedDrone;
  14 |   for (const name of ['cockpit', 'dashboard']) {
  15 |     if (name === 'cockpit') { await cockpit.open(); await cockpit.waitReady(); }
  16 |     else {
  17 |       await page.goto(`${api.baseURL}/dashboard`);
  18 |       await expect(page.getByTestId('dash-socket')).toHaveText('connected');
  19 |       await expect(page.getByTestId(`dash-takeoff-${isolatedDrone.id}`)).toBeVisible();
  20 |       await page.locator('details summary').click();
  21 |     }
  22 |     await narrate(page, `S13: Audit ${name}, including button names; allow only reviewed baseline contrast issues.`);
  23 |     // The shared caption is aria-hidden and noninteractive, so it remains readable in the scan video.
  24 |     const result = await new AxeBuilder({ page }).analyze();
  25 |     const unexpected: string[] = [];
  26 |     for (const violation of result.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')) {
  27 |       for (const node of violation.nodes) {
  28 |         // A rule-wide exemption would hide a new defect; each allowance must match this exact node and severity.
  29 |         const allowed = await page.evaluate(({ target, entries, id, impact }) => {
  30 |           if (target.length !== 1 || typeof target[0] !== 'string') return false;
  31 |           const element = document.querySelector(target[0]);
  32 |           return !!element && entries.some(entry => entry.id === id && entry.impact === impact && element.matches(entry.selector));
  33 |         }, { target: node.target, entries: baseline.pages[name] ?? [], id: violation.id, impact: violation.impact });
  34 |         if (!allowed) unexpected.push(`${violation.id} (${violation.impact}) at ${JSON.stringify(node.target)}: ${node.failureSummary}`);
  35 |       }
  36 |     }
  37 |     const auditPath = info.outputPath(`${name}-axe.json`);
  38 |     await writeFile(auditPath, JSON.stringify(result, null, 2));
  39 |     await info.attach(`${name}-axe.json`, { path: auditPath, contentType: 'application/json' });
  40 |     await narrate(page, `S13: ${name} audit complete; ${unexpected.length} new serious/critical barriers.`);
> 41 |     expect(unexpected, `Operators face new serious/critical accessibility barriers on ${name}; unnamed buttons cannot communicate their action`).toEqual([]);
     |                                                                                                                                                  ^ Error: Operators face new serious/critical accessibility barriers on dashboard; unnamed buttons cannot communicate their action
  42 |   }
  43 | });
  44 | 
```