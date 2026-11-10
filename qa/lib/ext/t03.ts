import type { Page } from '@playwright/test';
import type { Telemetry } from '../cockpit.js';
/** Task-local evidence collector; separate output/report paths avoid concurrent worker deletion. */
import { readFile,mkdir,copyFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
export async function collect(reportFile:string,label:string) {
 const report=JSON.parse(await readFile(reportFile,'utf8'));
 const groups=new Map<string,any[]>();
 async function walk(suites:any[]) {
  for(const suite of suites??[]) {
   for(const spec of suite.specs??[]) {
    const scenario=spec.title.match(/S\d\d/)?.[0];if(!scenario)continue;
    for(const test of spec.tests)for(const result of test.results) {
     const directory=path.resolve('../evidence',scenario,label);await mkdir(directory,{recursive:true});
     const runs=groups.get(directory)??[];
     const entry={scenario,project:test.projectName,label,status:result.status,message:(result.errors??[]).map((e:any)=>e.message??e.value??'').join('\n').replace(/\u001b\[[0-9;]*m/g,''),duration:result.duration,title:spec.title,repeat:spec.id,attempt:result.retry??0,artifacts:[] as string[]};
     for(const attachment of result.attachments??[])if(attachment.path){
      const suffix=path.extname(attachment.path);const file=`t03-${spec.title.includes("(b)")?"finding":"hard"}-${runs.length}-${attachment.name.replace(/\W/g,'_')}${suffix}`;
      await copyFile(attachment.path,path.join(directory,file));entry.artifacts.push(file);
      {const canonical=attachment.name==='video'?'video.webm':attachment.name==='trace'?'trace.zip':suffix==='.png'&&(spec.title.includes('(b)')?attachment.name==='stale-telemetry-screen':spec.title.includes('(c)')?attachment.name==='no-telemetry-screen':true)?'screenshot.png':null;if(canonical)await copyFile(attachment.path,path.join(directory,canonical));}
     }
     runs.push(entry);groups.set(directory,runs);
    }
   }await walk(suite.suites);
  }
 }await walk(report.suites);
 for(const [directory,runs]of groups){
  try { const previous=JSON.parse(await readFile(path.join(directory,'runs.json'),'utf8'));const titles=new Set(runs.map(r=>r.title));runs.push(...previous.filter((r:any)=>!titles.has(r.title))); } catch {}
  const failed=runs.find(r=>r.status!=='passed');const {scenario,project,duration}=runs[0];await writeFile(path.join(directory,'runs.json'),JSON.stringify(runs,null,2));await writeFile(path.join(directory,'verdict.json'),JSON.stringify({scenario,project,label,status:failed?.status??'passed',message:failed?.message??'',duration:runs.reduce((n,r)=>n+r.duration,0)},null,2));}
}
if(process.argv[2]?.endsWith(".json"))await collect(process.argv[2],process.argv[3]??'clean');

export async function readTelemetryFast(page:Page):Promise<Telemetry> {
 return page.evaluate(()=>{
  const ids={battery:'battery',altRlt:'alt-rlt',altAgl:'alt-agl',altAsl:'alt-asl',hspeed:'hspeed',vspeed:'vspeed',heading:'heading',wind:'wind',homeDistance:'home-distance'};
  return Object.fromEntries(Object.entries(ids).map(([key,suffix])=>{const match=document.querySelector(`[data-testid="telemetry-${suffix}"]`)?.textContent?.match(/-?\d+(?:\.\d+)?/);return [key,match?Number(match[0]):null];})) as Telemetry;
 });
}
