# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S03-selected-telemetry.spec.ts >> S03 · selected drone shows its real battery, altitude and speed @telemetry @visual
- Location: scenarios/S03-selected-telemetry.spec.ts:10:1

# Error details

```
Test timeout of 110000ms exceeded.
```

```
Error: locator.click: Test timeout of 110000ms exceeded.
Call log:
  - waiting for getByTestId('device-row-drone-234')

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
            - definition [ref=e69]: E 3.2 m/s
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
  - generic [aria-hidden]: "S03 · prepare distinct batteries: fly B until it is at least 6% below grounded A"
```

# Test source

```ts
  1  | import { expect, type Page } from '@playwright/test';
  2  | /** Numeric values actually shown to the operator; null denotes missing data. */
  3  | export type Telemetry = Record<'battery'|'altRlt'|'altAgl'|'altAsl'|'hspeed'|'vspeed'|'heading'|'wind'|'homeDistance',number|null>;
  4  | /** Cockpit page object using stable public UI test ids. */
  5  | export class Cockpit {
  6  |  constructor(readonly page:Page) {}
  7  |  /** Navigate to the cockpit. */
  8  |  async open() { await this.page.goto('/'); }
  9  |  /** Wait for connected fleet and a populated telemetry panel. */
  10 |  async waitReady() { await expect(this.badge()).toHaveText('socket connected'); await expect(this.page.locator('[data-testid^="device-row-drone-"]').first()).toBeVisible(); await expect(this.page.getByTestId('telemetry-battery')).toContainText(/\d/); }
  11 |  /** Wait for a specific live fleet row to appear. */
  12 |  async waitRow(id:string) { await expect(this.page.getByTestId(`device-row-${id}`),`Fleet row ${id} must appear in the cockpit`).toBeVisible(); }
  13 |  /** Select a drone through the same row an operator clicks. */
> 14 |  async selectDrone(id:string) { await this.page.getByTestId(`device-row-${id}`).click(); await expect(this.page.getByTestId(`device-row-${id}`)).toHaveClass(/selected/); }
     |                                                                                 ^ Error: locator.click: Test timeout of 110000ms exceeded.
  15 |  /** Read selected drone telemetry without silently converting missing values to zero. */
  16 |  async readTelemetry():Promise<Telemetry> {
  17 |   const ids={battery:'battery',altRlt:'alt-rlt',altAgl:'alt-agl',altAsl:'alt-asl',hspeed:'hspeed',vspeed:'vspeed',heading:'heading',wind:'wind',homeDistance:'home-distance'};
  18 |   const result={} as Telemetry;
  19 |   for(const [key,suffix] of Object.entries(ids)) { const text=await this.page.getByTestId(`telemetry-${suffix}`).innerText(); const match=text.match(/-?\d+(?:\.\d+)?/); result[key as keyof Telemetry]=match?Number(match[0]):null; }
  20 |   return result;
  21 |  }
  22 |  /** Locate the list flight-status pill or the selected panel pill. */
  23 |  flightPill(id?:string) { return id?this.page.getByTestId(`device-row-${id}`).locator('.device-pills .pill').last():this.page.getByTestId('status-flight'); }
  24 |  /** Locate the displayed video state. */
  25 |  videoLabel() { return this.page.getByTestId('video-state'); }
  26 |  /** Locate the socket connectivity badge. */
  27 |  badge() { return this.page.getByTestId('socket-status'); }
  28 | }
  29 | /** Compatibility alias for the cockpit page object. */
  30 | export { Cockpit as CockpitPage };
  31 | 
```