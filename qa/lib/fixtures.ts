import { test as base, expect } from '@playwright/test';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ControlApi, type DeviceInfo } from './api.js';
import { Cockpit } from './cockpit.js';
/** An isolated drone identity with both convenient ids and fleet objects. */
export interface IsolatedDrone { id:string; deviceId:string; droneId:string; dockId:string; name:string; drone:DeviceInfo; dock:DeviceInfo }
/** Cross-process lock for all global simulator, fault, and runtime operations. */
export async function acquireAppLock(owner:string, timeout=120_000):Promise<()=>Promise<void>> {
 const path=fileURLToPath(new URL('../../.context/locks/app.lock',import.meta.url));
 const inheritedToken=process.env.APP_LOCK_TOKEN;
 if(inheritedToken) {
  const parentToken=await readFile(`${path}/token`,'utf8').catch(()=> '');
  if(parentToken!==inheritedToken)throw new Error('Invalid mutation-parent app lock token');
  return async()=>{};
 }
 await mkdir(fileURLToPath(new URL('../../.context/locks',import.meta.url)),{recursive:true});
 const deadline=Date.now()+timeout;
 while(true) {
  try { await mkdir(path); break; } catch(error) { if((error as NodeJS.ErrnoException).code!=='EEXIST') throw error; if(Date.now()>=deadline) throw new Error(`Shared app lock held beyond ${timeout}ms; ${owner} did not mutate the runtime`); await new Promise(r=>setTimeout(r,500)); }
 }
 const token=randomUUID();
 try { await writeFile(`${path}/token`,token); await writeFile(`${path}/owner`,`${owner} ${new Date().toISOString()} pid=${process.pid}\n`); }
 catch(error) { await rm(path,{recursive:true,force:true}); throw error; }
 process.env.APP_LOCK_TOKEN=token;
 return async()=>{
  if(await readFile(`${path}/token`,'utf8').catch(()=>'')!==token)throw new Error('App lock ownership changed; refusing to remove another owner lock');
  await rm(path,{recursive:true,force:true});
  if(process.env.APP_LOCK_TOKEN===token)delete process.env.APP_LOCK_TOKEN;
 };
}
/** Shared Playwright fixtures; global-mutating scenarios must request appLock. */
export const test=base.extend<{api:ControlApi;cockpit:Cockpit;isolatedDrone:IsolatedDrone;appLock:void;faultLock:void}>({
 api:async({request},use)=>{await use(new ControlApi(request));},
 cockpit:async({page},use)=>{await use(new Cockpit(page));},
 isolatedDrone:async({api},use)=>{
  const {drone,dock}=await api.addDrone({name:`QA-${randomUUID().slice(0,8)}`});
  try { await use({id:drone.id,deviceId:drone.id,droneId:drone.id,dockId:dock.id,name:drone.name,drone,dock}); }
  finally { await api.removeDrone(drone.id); }
 },
 appLock:[async({},use,info)=>{const release=await acquireAppLock(`${process.env.AGENT_NAME??'qa'} ${info.title}`);try{await use();}finally{await release();}},{timeout:150_000}],
 faultLock:async({appLock},use)=>{void appLock;await use();},
});
export { expect };
