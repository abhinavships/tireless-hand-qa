# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S01-shell-contract.spec.ts >> S01 @visual · required screen regions and actions remain reachable
- Location: scenarios/S01-shell-contract.spec.ts:4:1

# Error details

```
Error: Cockpit: operator cannot reach Control panel action

Cockpit: Control panel action missing; operator cannot access the header region

expect(locator).toHaveCount(expected) failed

Locator:  getByRole('link', { name: 'Control panel' })
Expected: 1
Received: 0
Timeout:  2000ms

Call log:
  - Cockpit: Control panel action missing; operator cannot access the header region getByRole('link', { name: 'Control panel' }) with timeout 2000ms
  - waiting for getByRole('link', { name: 'Control panel' })
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
      - generic "Socket connection" [ref=e7]: socket connected
    - complementary [ref=e8]:
      - generic [ref=e9]:
        - heading "Devices" [level=2] [ref=e10]
        - list [ref=e11]:
          - listitem [ref=e12] [cursor=pointer]:
            - generic [ref=e13]:
              - generic [ref=e14]: Drone 1
              - generic [ref=e15]: Dock 1
            - generic [ref=e16]:
              - generic [ref=e17]: dock closed
              - generic [ref=e18]: standby
          - listitem [ref=e19] [cursor=pointer]:
            - generic [ref=e20]:
              - generic [ref=e21]: Drone 2
              - generic [ref=e22]: Dock 2
            - generic [ref=e23]:
              - generic [ref=e24]: dock closed
              - generic [ref=e25]: standby
          - listitem [ref=e26] [cursor=pointer]:
            - generic [ref=e27]:
              - generic [ref=e28]: Drone 3
              - generic [ref=e29]: Dock 3
            - generic [ref=e30]:
              - generic [ref=e31]: dock closed
              - generic [ref=e32]: standby
          - listitem [ref=e33] [cursor=pointer]:
            - generic [ref=e34]:
              - generic [ref=e35]: Drone 4
              - generic [ref=e36]: Dock 4
            - generic [ref=e37]:
              - generic [ref=e38]: dock closed
              - generic [ref=e39]: standby
      - generic [ref=e40]:
        - heading "Drone Telemetry · Drone 1 standby" [level=2] [ref=e41]:
          - generic [ref=e42]: Drone Telemetry · Drone 1
          - generic [ref=e43]: standby
        - generic [ref=e44]:
          - generic [ref=e45]:
            - term [ref=e46]: Battery
            - definition [ref=e47]: 100 %
          - generic [ref=e48]:
            - term [ref=e49]: Altitude RLT
            - definition [ref=e50]: 0.0 m
          - generic [ref=e51]:
            - term [ref=e52]: Altitude AGL
            - definition [ref=e53]: 0.0 m
          - generic [ref=e54]:
            - term [ref=e55]: Altitude ASL
            - definition [ref=e56]: 560.0 m
          - generic [ref=e57]:
            - term [ref=e58]: H-Speed
            - definition [ref=e59]: 0.0 m/s
          - generic [ref=e60]:
            - term [ref=e61]: V-Speed
            - definition [ref=e62]: 0.0 m/s
          - generic [ref=e63]:
            - term [ref=e64]: Heading
            - definition [ref=e65]: 47 °
          - generic [ref=e66]:
            - term [ref=e67]: Wind
            - definition [ref=e68]: SW 4.2 m/s
          - generic [ref=e69]:
            - term [ref=e70]: Dist. from home
            - definition [ref=e71]: 0 m
    - main [ref=e72]:
      - group "Map view" [ref=e78]:
        - button "2D" [ref=e79] [cursor=pointer]
        - button "3D" [pressed] [ref=e80] [cursor=pointer]
      - generic [ref=e82]:
        - generic [ref=e83]: FPV · Drone 1
        - generic [ref=e84]: live
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
     |                                                             ^ Error: Cockpit: operator cannot reach Control panel action
  30 |  }
  31 | }
  32 | 
```