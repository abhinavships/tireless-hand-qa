# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: operator.spec.ts >> T06 operator add remove rapid switch and phone
- Location: explore/operator.spec.ts:5:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.video-header')
Expected substring: "Explore Alpha"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" locator('.video-header') with timeout 5000ms
  - waiting for locator('.video-header')

```

```yaml
- banner:
  - text: FlytBase Cockpit socket connected
  - link "Control panel →":
    - /url: http://localhost:4000/dashboard
- complementary:
  - heading "Devices" [level=2]
  - list:
    - listitem: Drone 1 Dock 1 dock closed standby
    - listitem: Drone 2 Dock 2 dock closed standby
    - listitem: Drone 3 Dock 3 dock closed standby
    - listitem: Drone 4 Dock 4 dock closed standby
    - listitem: Explore Alpha Dock 14 dock closed standby
    - listitem: Explore Beta Dock 15 dock closed standby
    - listitem: QA-bd0050b0 Dock 16 dock closed standby
  - heading "Drone Telemetry · Explore Alpha standby" [level=2]
  - term: Battery
  - definition: 100 %
  - term: Altitude RLT
  - definition: 0.0 m
  - term: Altitude AGL
  - definition: 0.0 m
  - term: Altitude ASL
  - definition: 560.0 m
  - term: H-Speed
  - definition: 0.0 m/s
  - term: V-Speed
  - definition: 0.0 m/s
  - term: Heading
  - definition: 134 °
  - term: Wind
  - definition: W 4.6 m/s
  - term: Dist. from home
  - definition: 0 m
- main:
  - group "Map view":
    - button "2D"
    - button "3D" [pressed]
```

# Test source

```ts
  1  | import {test,expect,acquireAppLock} from '../lib/fixtures.js';
  2  | import {narrate} from '../lib/overlay.js';
  3  | import {writeFile} from 'node:fs/promises';
  4  | 
  5  | test('T06 operator add remove rapid switch and phone',async({page,api,cockpit})=>{
  6  |  const a=await api.addDrone({name:'Explore Alpha'}),b=await api.addDrone({name:'Explore Beta'});
  7  |  try{
  8  |  await cockpit.open(); await cockpit.waitReady();
  9  |  await narrate(page,'Add two isolated drones, rapidly switch selection, and remove the selected drone.');
> 10 |  for(let i=0;i<20;i++){ const d=i%2?a.drone:b.drone;await cockpit.selectDrone(d.id); await expect(page.locator('.telemetry').locator('..')).toContainText(d.name); await expect(page.locator('.video-header')).toContainText(d.name);}
     |                                                                                                                                                                                                                ^ Error: expect(locator).toContainText(expected) failed
  11 |  await api.command(a.drone.id,'takeoff');await cockpit.selectDrone(a.drone.id);
  12 |  await expect(cockpit.flightPill()).toHaveText(/taking_off|in_flight/);
  13 |  await api.removeDrone(a.drone.id);await expect(page.getByTestId(`device-row-${a.drone.id}`)).toHaveCount(0);await expect(page.locator('.telemetry').locator('..')).not.toContainText(a.drone.name);
  14 |  await page.setViewportSize({width:390,height:844});await narrate(page,'Phone viewport: selected drone telemetry and video remain reachable.');await cockpit.selectDrone(b.drone.id);
  15 |  for(const loc of [page.getByTestId('telemetry-battery'),page.getByTestId('video-player'),page.getByTestId('map-canvas')]){await loc.scrollIntoViewIfNeeded();await expect(loc).toBeVisible();}
  16 |  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  17 |  }finally{await api.removeDrone(a.drone.id).catch(()=>{});await api.removeDrone(b.drone.id);}
  18 | });
  19 | 
  20 | for(const kind of ['socket-kick','socket-refuse','socket-delay','socket-drop','sim-offline','video-freeze','video-stutter','video-degrade','video-flicker'] as const){
  21 |  test(`T06 fault exploration ${kind}`,async({page,api,cockpit,isolatedDrone},info)=>{
  22 |  const release=await acquireAppLock(`codex-t04 T06 ${kind}`,300000);
  23 |  const observations:any[]=[];
  24 |  try{
  25 |  await api.clearFaults();await api.video('start',isolatedDrone.id);await cockpit.open();await cockpit.waitReady();await cockpit.selectDrone(isolatedDrone.id);
  26 |  await expect(cockpit.videoLabel()).toHaveText('live',{timeout:30000});
  27 |  await narrate(page,`Explore ${kind}: observe connectivity, telemetry and video degradation, then recovery without reload.`);
  28 |  await api.fault({kind,deviceId:isolatedDrone.id,seconds:12,value:kind==='socket-drop'?100:kind==='socket-delay'?1200:3});
  29 |  for(let i=0;i<18;i++){
  30 |  observations.push({at:i,badge:await cockpit.badge().innerText(),video:await cockpit.videoLabel().innerText(),telemetry:await cockpit.readTelemetry(),player:await page.getByTestId('video-player').evaluate((e:any)=>({time:e.currentTime,width:e.videoWidth,height:e.videoHeight,ready:e.readyState})),health:await api.health()});
  31 |  await page.waitForTimeout(1000);
  32 |  }
  33 |  await api.clearFaults();await expect(cockpit.badge()).toHaveText('socket connected',{timeout:25000});await expect(cockpit.videoLabel()).toHaveText('live',{timeout:30000});
  34 |  await writeFile(info.outputPath('observations.json'),JSON.stringify(observations,null,2));
  35 |  }finally{await api.clearFaults();await api.video('stop',isolatedDrone.id);await release();}
  36 |  });
  37 | }
  38 | 
```