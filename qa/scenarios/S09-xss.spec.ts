import { expect } from '../lib/fixtures.js';
import { securityTest as test } from '../lib/ext/t04.js';
import { narrate } from '../lib/overlay.js';
const payloads=['<img src=x onerror=window.__xss=1>', '"><svg onload=window.__xss=2>'];
for (const surface of ['cockpit','dashboard'] as const) for (const [index,name] of payloads.entries()) {
 test(`S09 @security ${surface} renders payload ${index+1} as text`,async({page,api,cockpit,appLock})=>{
  const {drone}=await api.addDrone({name});
  try {
   if(surface==='cockpit') await cockpit.open(); else await page.goto(`${api.baseURL}/dashboard`);
   await narrate(page,`S09: operator-supplied name must remain text on ${surface}`);
   const row=page.getByTestId(`${surface==='cockpit'?'device-row':'dash-row'}-${drone.id}`);
   await expect(row).toBeVisible(); await row.evaluate(element=>element.scrollIntoView({block:"center"}));
   const marker=await page.evaluate(()=>Reflect.get(window,'__xss'));
   if(marker!==undefined)await narrate(page,`S09 FAILED: drone name executed JavaScript on ${surface}; __xss=${marker}`);
   await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__xss')),{message:`Stored XSS: a drone name executes JavaScript in the ${surface}, compromising the operator session`}).toBeUndefined();
   await expect(row,`Drone name is interpreted as HTML on ${surface} rather than shown as literal operator text`).toContainText(name);
   await expect(row.locator('img[src="x"],svg[onload]'),'Operator-supplied name must not create executable HTML nodes').toHaveCount(0);
  } finally {await api.removeDrone(drone.id);}
 });
}
