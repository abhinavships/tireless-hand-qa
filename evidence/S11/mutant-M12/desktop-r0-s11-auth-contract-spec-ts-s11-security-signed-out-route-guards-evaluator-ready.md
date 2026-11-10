# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S11-auth-contract.spec.ts >> S11 @security signed-out route guards (evaluator-ready)
- Location: scenarios/S11-auth-contract.spec.ts:13:1

# Error details

```
Error: Signed-out visitor can open protected route http://localhost:4010/settings

Signed-out visitor can open protected route http://localhost:4010/settings

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 10000ms exceeded while waiting on the predicate
```

# Test source

```ts
  1  | import { readFileSync } from 'node:fs';
  2  | import {expect} from '../lib/fixtures.js';
  3  | import {securityTest as test} from '../lib/ext/t04.js';
  4  | import { narrate } from '../lib/overlay.js';
  5  | interface Route {url:string;requiresAuth:boolean;loginRoute?:string;protectedSelector?:string}
  6  | interface Login {url:string;emailLabel:string;otpLabel:string;submitName:string;successRoute?:string}
  7  | const contracts=JSON.parse(readFileSync(new URL('../contracts/routes.json',import.meta.url),'utf8')) as {routes:Route[];loginForms:Login[]};
  8  | for(const url of [...contracts.routes.map(r=>r.url),...contracts.loginForms.map(f=>f.url)]) {
  9  |  if(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)) throw new Error('S11 is restricted to localhost contracts');
  10 | }
  11 | test.use({storageState:{cookies:[],origins:[]}});
  12 | test.skip(process.env.AUTH_FIXTURE!=='1','S11 requires T05 F-auth base overlay (AUTH_FIXTURE=1)');
  13 | test('S11 @security signed-out route guards (evaluator-ready)',async({page,appLock},info)=>{
  14 |  const protectedRoutes=contracts.routes.filter(r=>r.requiresAuth);
  15 |  test.skip(!protectedRoutes.length,'Baseline declares no protected routes; no guard coverage claimed');
  16 |  for(const route of protectedRoutes){
  17 |   const context=await page.context().browser()!.newContext({storageState:{cookies:[],origins:[]},recordVideo:{dir:info.outputPath("signed-out-video")}});
  18 |   const fresh=await context.newPage();const video=fresh.video();
  19 |   try{const response=await fresh.goto(route.url);await narrate(fresh,'S11: fresh signed-out visitor must be denied protected content');
> 20 |    await expect.poll(()=>response?.status()===401 || (route.loginRoute!==undefined && new URL(fresh.url()).pathname===new URL(route.loginRoute,route.url).pathname),{message:`Signed-out visitor can open protected route ${route.url}`}).toBe(true);
     |                                                                                                                                                                                                                                           ^ Error: Signed-out visitor can open protected route http://localhost:4010/settings
  21 |    if(route.protectedSelector)await expect(fresh.locator(route.protectedSelector),'Signed-out visitor must not see protected content').toHaveCount(0);
  22 |   }finally{if(!fresh.isClosed()){const shot=info.outputPath('signed-out-settings.png');await fresh.screenshot({path:shot});await info.attach('signed-out-settings',{path:shot,contentType:'image/png'});}await context.close();if(video)await info.attach('signed-out-route-video',{path:await video.path(),contentType:'video/webm'});}
  23 |  }
  24 | });
  25 | test('S11 @security sign-in required controls (evaluator-ready)',async({page,appLock})=>{
  26 |  test.skip(!contracts.loginForms.length,'Baseline has no login form; no sign-in coverage claimed');
  27 |  for(const form of contracts.loginForms){await page.goto(form.url);await narrate(page,'S11: email, OTP and usable sign-in action are required');
  28 |  const email=page.getByLabel(form.emailLabel,{exact:true});const otp=page.getByLabel(form.otpLabel,{exact:true});const submit=page.getByRole('button',{name:form.submitName,exact:true});
  29 |  await expect(email).toBeVisible();await expect(otp).toBeVisible();await email.fill('operator@example.test');await otp.fill('123456');await expect(submit,'Operator cannot sign in: Sign in action missing').toBeVisible();await expect(submit,'Sign-in action must be enabled after email and OTP are entered').toBeEnabled();
  30 |  if(form.successRoute){await submit.click();await expect.poll(()=>new URL(page.url()).pathname,{message:'Valid fixture sign-in must open protected settings'}).toBe(form.successRoute);await expect(page.getByTestId('auth-settings')).toBeVisible();}
  31 |  }
  32 | });
  33 | 
```