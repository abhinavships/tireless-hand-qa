import { readFile, readdir } from 'node:fs/promises';
import { expect, type Page, type Locator } from '@playwright/test';
import { expectVisibleAndUsable } from '../oracles.js';
export interface ScreenContract {
 name:string; url:string; scenario?:string; requiresAuth?:boolean;
 elements:{name:string;locator:{role?:Parameters<Page['getByRole']>[0];name?:string;testid?:string;css?:string};mustBeVisible?:boolean;mustBeClickable?:boolean;region:string}[];
}
export async function screenContracts():Promise<ScreenContract[]> {
 const dir=new URL('../../contracts/',import.meta.url);
 const contracts:ScreenContract[]=[];
 for(const file of (await readdir(dir)).filter(f=>f.endsWith('.json')).sort()) {
  const value=JSON.parse(await readFile(new URL(file,dir),'utf8'));
  if(Array.isArray(value.elements)&&value.url) contracts.push(value);
 }
 return contracts;
}
export function contractLocator(page:Page, locator:ScreenContract['elements'][number]['locator']):Locator {
 if(locator.testid) return page.getByTestId(locator.testid);
 if(locator.role) return page.getByRole(locator.role,{name:locator.name});
 if(locator.css) return page.locator(locator.css);
 throw new Error('Screen contract locator requires role, testid, or css');
}
export async function checkContract(page:Page,contract:ScreenContract) {
 for(const item of contract.elements) {
  await expect(async()=>{
   const target=contractLocator(page,item.locator);
   await expect(target,`${contract.name}: ${item.name} missing; operator cannot access the ${item.region} region`).toHaveCount(1,{timeout:2_000});
   if(item.mustBeVisible||item.mustBeClickable) await expectVisibleAndUsable(target);
  },`${contract.name}: operator cannot reach ${item.name}`).toPass({timeout:15_000});
 }
}
