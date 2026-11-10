// Private paths prevent recording collisions with other workers.
import {fileURLToPath} from 'node:url';
import {defineConfig} from '@playwright/test';
import base from '../../playwright.config.js';
import {test as harness,acquireAppLock} from '../fixtures.js';
export const securityTest=harness.extend<{appLock:void}>({
 appLock:[async({},use,info)=>{const release=await acquireAppLock(`codex-t04 ${info.title}`,360_000);try{await use();}finally{await release();}},{scope:'test',timeout:390_000}],
});
export default defineConfig(base,{
 globalSetup:fileURLToPath(new URL("../run-lock.ts",import.meta.url)),
 use:{...base.use,video:'on',trace:'on',screenshot:'on'},
 testDir:'../../scenarios',testMatch:/S(09|10|11|17)-.*\.spec\.ts/,
 outputDir:'../../../evidence/.t04-artifacts',
 reporter:[['list'],['json',{outputFile:'../../../evidence/.t04-results.json'}]],
});
