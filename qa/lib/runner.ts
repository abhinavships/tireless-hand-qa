import { spawn } from 'node:child_process';
import { rm, access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { acquireAppLock } from './fixtures.js';
process.env.RUN_ID??=`run-${Date.now()}-${randomUUID().slice(0,8)}`;
if(!/^[a-zA-Z0-9_-]+$/.test(process.env.RUN_ID))throw new Error('Invalid RUN_ID');
const report=`test-results/${process.env.RUN_ID}/results.json`;
const release=await acquireAppLock(`${process.env.AGENT_NAME??'qa'} runner ${process.env.RUN_ID}`);
let child:ReturnType<typeof spawn>|undefined;
const forward=(signal:NodeJS.Signals)=>child?.kill(signal);
const onInt=()=>forward('SIGINT');const onTerm=()=>forward('SIGTERM');
process.on('SIGINT',onInt);process.on('SIGTERM',onTerm);
async function run(args:string[]):Promise<number> {
 return await new Promise((resolve,reject)=>{
  child=spawn('npx',args,{stdio:'inherit',env:process.env});
  child.once('error',reject);child.once('exit',(code,signal)=>{child=undefined;resolve(code??(signal==='SIGINT'?130:143));});
 });
}
let status=1;
try {
 await rm(report,{force:true});
 status=await run(['playwright','test',...process.argv.slice(2)]);
 if(await access(report).then(()=>true,()=>false)) {
  const collection=await run(['tsx','tools/evidence.ts']);if(status===0)status=collection;
 } else {console.error('No Playwright JSON report generated; evidence not collected.');if(status===0)status=1;}
} finally {process.off('SIGINT',onInt);process.off('SIGTERM',onTerm);await release();}
process.exitCode=status;
