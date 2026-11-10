import {test,expect,acquireAppLock} from '../lib/fixtures.js';
import {narrate} from '../lib/overlay.js';
import {writeFile} from 'node:fs/promises';

test('T06 operator add remove rapid switch and phone',async({page,api,cockpit})=>{
 const release=await acquireAppLock('codex-t04 T06 operator',300000);
 const a=await api.addDrone({name:'Explore Alpha'}),b=await api.addDrone({name:'Explore Beta'});
 try{
 await cockpit.open(); await cockpit.waitReady();
 await narrate(page,'Add two isolated drones, rapidly switch selection, and remove the selected drone.');
 for(let i=0;i<20;i++){ const d=i%2?a.drone:b.drone;await cockpit.selectDrone(d.id); await expect(page.locator('.telemetry').locator('..')).toContainText(d.name); await expect(page.locator('.video-header')).toContainText(d.name);}
 await api.command(a.drone.id,'takeoff');await cockpit.selectDrone(a.drone.id);
 await expect(cockpit.flightPill()).toHaveText(/taking_off|in_flight/);
 await api.removeDrone(a.drone.id);await expect(page.getByTestId(`device-row-${a.drone.id}`)).toHaveCount(0);await expect(page.locator('.telemetry').locator('..')).not.toContainText(a.drone.name);
 await page.setViewportSize({width:390,height:844});await narrate(page,'Phone viewport: selected drone telemetry and video remain reachable.');await cockpit.selectDrone(b.drone.id);
 for(const loc of [page.getByTestId('telemetry-battery'),page.getByTestId('video-player'),page.getByTestId('map-canvas')]){await loc.scrollIntoViewIfNeeded();await expect(loc).toBeVisible();}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await api.removeDrone(a.drone.id).catch(()=>{});await api.removeDrone(b.drone.id);await release();}
});

for(const kind of ['socket-kick','socket-refuse','socket-delay','socket-drop','sim-offline','video-freeze','video-stutter','video-degrade','video-flicker'] as const){
 test(`T06 fault exploration ${kind}`,async({page,api,cockpit,isolatedDrone},info)=>{
 const release=await acquireAppLock(`codex-t04 T06 ${kind}`,300000);
 const observations:any[]=[];
 try{
 await api.clearFaults();await api.video('start',isolatedDrone.id);await cockpit.open();await cockpit.waitReady();await cockpit.selectDrone(isolatedDrone.id);
 await expect(cockpit.videoLabel()).toHaveText('live',{timeout:30000});
 await narrate(page,`Explore ${kind}: observe connectivity, telemetry and video degradation, then recovery without reload.`);
 await api.fault({kind,deviceId:isolatedDrone.id,seconds:12,value:kind==='socket-drop'?100:kind==='socket-delay'?1200:3});
 for(let i=0;i<12;i++){
 observations.push({at:i,badge:await cockpit.badge().innerText(),video:await cockpit.videoLabel().innerText(),telemetry:await page.locator('.telemetry').innerText(),player:await page.getByTestId('video-player').evaluate((e:any)=>({time:e.currentTime,width:e.videoWidth,height:e.videoHeight,ready:e.readyState})),health:await api.health()});
 await page.waitForTimeout(1000);
 }
 await api.clearFaults();await expect(cockpit.badge()).toHaveText('socket connected',{timeout:25000});await expect(cockpit.videoLabel()).toHaveText('live',{timeout:30000});
 await writeFile(info.outputPath('observations.json'),JSON.stringify(observations,null,2));
 }finally{await api.clearFaults();await api.video('stop',isolatedDrone.id);await release();}
 });
}
