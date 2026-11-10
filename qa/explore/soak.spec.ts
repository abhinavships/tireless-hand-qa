import {test,expect,acquireAppLock} from '../lib/fixtures.js';
import {narrate} from '../lib/overlay.js';
import {writeFile} from 'node:fs/promises';
for(let segment=1;segment<=4;segment++){
 test(`T06 locked soak segment ${segment} of 4 (150 seconds)`,async({page,context,cockpit,api},info)=>{
  test.setTimeout(500000);
  // Leave a gap outside the mutex so other workers can take their turn.
  await new Promise(r=>setTimeout(r,2500));
  const release=await acquireAppLock(`codex-t04 T06 soak segment ${segment}`,300000);
  const errors:string[]=[];const samples:any[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await cockpit.open();await cockpit.waitReady();await narrate(page,`Locked endurance segment ${segment}/4: observe cockpit for 150 seconds, then close browser and yield runtime.`);
   const start=Date.now();
   while(Date.now()-start<150000){samples.push({elapsed:Date.now()-start,badge:await cockpit.badge().innerText(),video:await cockpit.videoLabel().innerText(),rows:await page.locator('[data-testid^="device-row-drone-"]').count(),fleet:(await api.devices()).devices.filter(d=>d.type==='drone').length,faults:await api.faults(),telemetry:await cockpit.readTelemetry()});await page.waitForTimeout(10000);}
   await writeFile(info.outputPath('soak.json'),JSON.stringify({segment,durationMs:Date.now()-start,samples,errors},null,2));
   await page.screenshot({path:info.outputPath('screenshot.png')});
   expect(errors,'Cockpit must not crash during a locked endurance segment').toEqual([]);
   await expect(cockpit.badge()).toHaveText('socket connected');
  }finally{await context.close();await release();}
 });
}
