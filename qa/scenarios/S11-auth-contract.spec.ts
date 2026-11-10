import { readFileSync } from 'node:fs';
import {expect} from '../lib/fixtures.js';
import {securityTest as test} from '../lib/ext/t04.js';
import { narrate } from '../lib/overlay.js';
interface Route {url:string;requiresAuth:boolean;loginRoute?:string;protectedSelector?:string}
interface Login {url:string;emailLabel:string;otpLabel:string;submitName:string;successRoute?:string}
const contracts=JSON.parse(readFileSync(new URL('../contracts/routes.json',import.meta.url),'utf8')) as {routes:Route[];loginForms:Login[]};
for(const url of [...contracts.routes.map(r=>r.url),...contracts.loginForms.map(f=>f.url)]) {
 if(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)) throw new Error('S11 is restricted to localhost contracts');
}
test.use({storageState:{cookies:[],origins:[]}});
test.skip(process.env.AUTH_FIXTURE!=='1','S11 requires T05 F-auth base overlay (AUTH_FIXTURE=1)');
test('S11 @security signed-out route guards (evaluator-ready)',async({page,appLock},info)=>{
 const protectedRoutes=contracts.routes.filter(r=>r.requiresAuth);
 test.skip(!protectedRoutes.length,'Baseline declares no protected routes; no guard coverage claimed');
 for(const route of protectedRoutes){
  const context=await page.context().browser()!.newContext({storageState:{cookies:[],origins:[]},recordVideo:{dir:info.outputPath("signed-out-video")}});
  const fresh=await context.newPage();const video=fresh.video();
  try{const response=await fresh.goto(route.url);await narrate(fresh,'S11: fresh signed-out visitor must be denied protected content');
   await expect.poll(()=>response?.status()===401 || (route.loginRoute!==undefined && new URL(fresh.url()).pathname===new URL(route.loginRoute,route.url).pathname),{message:`Signed-out visitor can open protected route ${route.url}`}).toBe(true);
   if(route.protectedSelector)await expect(fresh.locator(route.protectedSelector),'Signed-out visitor must not see protected content').toHaveCount(0);
  }finally{if(!fresh.isClosed()){const shot=info.outputPath('signed-out-settings.png');await fresh.screenshot({path:shot});await info.attach('signed-out-settings',{path:shot,contentType:'image/png'});}await context.close();if(video)await info.attach('signed-out-route-video',{path:await video.path(),contentType:'video/webm'});}
 }
});
test('S11 @security sign-in required controls (evaluator-ready)',async({page,appLock})=>{
 test.skip(!contracts.loginForms.length,'Baseline has no login form; no sign-in coverage claimed');
 for(const form of contracts.loginForms){await page.goto(form.url);await narrate(page,'S11: email, OTP and usable sign-in action are required');
 const email=page.getByLabel(form.emailLabel,{exact:true});const otp=page.getByLabel(form.otpLabel,{exact:true});const submit=page.getByRole('button',{name:form.submitName,exact:true});
 await expect(email).toBeVisible();await expect(otp).toBeVisible();await email.fill('operator@example.test');await otp.fill('123456');await expect(submit,'Operator cannot sign in: Sign in action missing').toBeVisible();await expect(submit,'Sign-in action must be enabled after email and OTP are entered').toBeEnabled();
 if(form.successRoute){await submit.click();await expect.poll(()=>new URL(page.url()).pathname,{message:'Valid fixture sign-in must open protected settings'}).toBe(form.successRoute);await expect(page.getByTestId('auth-settings')).toBeVisible();}
 }
});
