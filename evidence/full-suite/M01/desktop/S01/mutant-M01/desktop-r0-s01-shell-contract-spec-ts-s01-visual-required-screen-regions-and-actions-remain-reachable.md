# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S01-shell-contract.spec.ts >> S01 @visual · required screen regions and actions remain reachable
- Location: scenarios/S01-shell-contract.spec.ts:4:1

# Error details

```
Error: Cockpit: operator cannot reach Video tile

Cockpit: Video tile missing; operator cannot access the video region

expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('video-player')
Expected: 1
Received: 0
Timeout:  2000ms

Call log:
  - Cockpit: Video tile missing; operator cannot access the video region getByTestId('video-player') with timeout 2000ms
  - waiting for getByTestId('video-player')
    20 × locator resolved to 0 elements
       - unexpected value "0"


Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
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
            - definition [ref=e69]: N 2.0 m/s
          - generic [ref=e70]:
            - term [ref=e71]: Dist. from home
            - definition [ref=e72]: 0 m
    - main [ref=e73]:
      - group "Map view" [ref=e79]:
        - button "2D" [ref=e80] [cursor=pointer]
        - button "3D" [pressed] [ref=e81] [cursor=pointer]
  - generic [aria-hidden]: "S01 · Cockpit: check identity, fleet, telemetry, map, video and main action"
```

# Test source

```ts
  1  | import { readFile, readdir } from 'node:fs/promises';
  2  | import { expect, type Page, type Locator } from '@playwright/test';
  3  | import { expectVisibleAndUsable } from '../oracles.js';
  4  | export interface ScreenContract {
  5  |  name:string; url:string; scenario?:string; requiresAuth?:boolean;
  6  |  elements:{name:string;locator:{role?:Parameters<Page['getByRole']>[0];name?:string;testid?:string;css?:string};mustBeVisible?:boolean;mustBeClickable?:boolean;region:string}[];
  7  | }
  8  | export async function screenContracts():Promise<ScreenContract[]> {
  9  |  const dir=new URL('../../contracts/',import.meta.url);
  10 |  const contracts:ScreenContract[]=[];
  11 |  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.json')).sort()) {
  12 |   const value=JSON.parse(await readFile(new URL(file,dir),'utf8'));
  13 |   if(Array.isArray(value.elements)&&value.url) contracts.push(value);
  14 |  }
  15 |  return contracts;
  16 | }
  17 | export function contractLocator(page:Page, locator:ScreenContract['elements'][number]['locator']):Locator {
  18 |  if(locator.testid) return page.getByTestId(locator.testid);
  19 |  if(locator.role) return page.getByRole(locator.role,{name:locator.name});
  20 |  if(locator.css) return page.locator(locator.css);
  21 |  throw new Error('Screen contract locator requires role, testid, or css');
  22 | }
  23 | export async function checkContract(page:Page,contract:ScreenContract) {
  24 |  for(const item of contract.elements) {
  25 |   await expect(async()=>{
  26 |    const target=contractLocator(page,item.locator);
  27 |    await expect(target,`${contract.name}: ${item.name} missing; operator cannot access the ${item.region} region`).toHaveCount(1,{timeout:2_000});
  28 |    if(item.mustBeVisible||item.mustBeClickable) await expectVisibleAndUsable(target);
> 29 |   },`${contract.name}: operator cannot reach ${item.name}`).toPass({timeout:15_000});
     |                                                             ^ Error: Cockpit: operator cannot reach Video tile
  30 |  }
  31 | }
  32 | 
```