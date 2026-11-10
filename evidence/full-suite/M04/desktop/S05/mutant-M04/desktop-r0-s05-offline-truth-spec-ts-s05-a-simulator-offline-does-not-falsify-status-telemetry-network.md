# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S05-offline-truth.spec.ts >> S05(a) simulator offline does not falsify status @telemetry @network
- Location: scenarios/S05-offline-truth.spec.ts:6:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByTestId('device-row-drone-242')

```

# Page snapshot

```yaml
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
    - generic [ref=e34]:
      - heading "Drone Telemetry · Drone 1 standby" [level=2] [ref=e35]:
        - generic [ref=e36]: Drone Telemetry · Drone 1
        - generic [ref=e37]: standby
      - generic [ref=e38]:
        - generic [ref=e39]:
          - term [ref=e40]: Battery
          - definition [ref=e41]: 100 %
        - generic [ref=e42]:
          - term [ref=e43]: Altitude RLT
          - definition [ref=e44]: 0.0 m
        - generic [ref=e45]:
          - term [ref=e46]: Altitude AGL
          - definition [ref=e47]: 0.0 m
        - generic [ref=e48]:
          - term [ref=e49]: Altitude ASL
          - definition [ref=e50]: 560.0 m
        - generic [ref=e51]:
          - term [ref=e52]: H-Speed
          - definition [ref=e53]: 0.0 m/s
        - generic [ref=e54]:
          - term [ref=e55]: V-Speed
          - definition [ref=e56]: 0.0 m/s
        - generic [ref=e57]:
          - term [ref=e58]: Heading
          - definition [ref=e59]: 47 °
        - generic [ref=e60]:
          - term [ref=e61]: Wind
          - definition [ref=e62]: SW 5.5 m/s
        - generic [ref=e63]:
          - term [ref=e64]: Dist. from home
          - definition [ref=e65]: 0 m
  - main [ref=e66]:
    - group "Map view" [ref=e72]:
      - button "2D" [ref=e73] [cursor=pointer]
      - button "3D" [pressed] [ref=e74] [cursor=pointer]
    - generic [ref=e76]:
      - generic [ref=e77]: FPV · Drone 1
      - generic [ref=e78]: live
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
     |                                                                                 ^ Error: locator.click: Test timeout of 60000ms exceeded.
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