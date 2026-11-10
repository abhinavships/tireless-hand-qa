import { readFile, mkdir, cp, writeFile, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const qaRoot=fileURLToPath(new URL('../',import.meta.url));
const label=process.env.RUN_LABEL??'clean';
const outputRunId=process.env.RUN_ID??'default';
if(!/^(clean|mutant-M\d+[a-z]?)$/.test(label))throw new Error(`Invalid RUN_LABEL ${label}; use clean or mutant-Mxx`);
if(!/^[a-zA-Z0-9_-]+$/.test(outputRunId))throw new Error('Invalid RUN_ID');
const report=JSON.parse(await readFile(path.join(qaRoot,`test-results/${outputRunId}/results.json`),'utf8'));
const groups=new Map<string,any[]>();
const prepared=new Set<string>();
const repeats=new Map<string,number>();
const slug=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,150);
async function walk(suites:any[],parents:string[]=[]):Promise<void> {
 for(const suite of suites??[]) {
  const titles=[...parents,suite.title];
  for(const spec of suite.specs??[]) {
   const scenario=([spec.title,...titles].join(' ').match(/\bS\d{2}\b/)??[])[0];
   if(!scenario)continue;
   for(const test of spec.tests??[]) {
    const repeatKey=`${titles.join('/')}/${spec.title}-${test.projectName}`;
    const repeat=test.repeatEachIndex??repeats.get(repeatKey)??0;
    repeats.set(repeatKey,repeat+1);
    for(const [index,result]of(test.results??[]).entries()) {
     const entry={sourceSpecId:spec.id,scenario,project:test.projectName,label,status:result.status,message:(result.errors??[]).map((e:any)=>e.message??e.value??'').join('\n').replace(/\u001b\[[0-9;]*m/g,''),duration:result.duration,title:spec.title,repeat,attempt:index,artifacts:[] as string[]};
     const directory=path.join(process.env.EVIDENCE_ROOT??path.join(qaRoot,'../evidence'),scenario,label);
     await mkdir(directory,{recursive:true});
     if(!prepared.has(directory)) {
      try {
       const previous=JSON.parse(await readFile(path.join(directory,'runs.json'),'utf8'));
       for(const run of previous)for(const artifact of run.artifacts??[]) {
        if(typeof artifact==='string'&&path.basename(artifact)===artifact)await rm(path.join(directory,artifact),{force:true});
       }
      }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      for(const canonical of ['video.webm','trace.zip','screenshot.png'])await rm(path.join(directory,canonical),{force:true});
      prepared.add(directory);
     }
     const used=new Map<string,number>();
     for(const attachment of result.attachments??[]) {
      if(!attachment.path)continue;
      const ext=path.extname(attachment.path)||'.bin';
      const count=used.get(ext)??0;used.set(ext,count+1);
      const suffix=(index?`-attempt${index}`:'')+(count?`-${slug(attachment.name??'attachment')}-${count}`:'');
      const basename=`${slug(test.projectName)}-r${repeat}-${slug(titles.concat(spec.title).join(' '))}${suffix}${ext}`;
      await cp(attachment.path,path.join(directory,basename));entry.artifacts.push(basename);
     }
     const entries=groups.get(directory)??[];entries.push(entry);groups.set(directory,entries);
    }
   }
  }
  await walk(suite.suites,titles);
 }
}
await walk(report.suites);
const execFileAsync=promisify(execFile);
async function videoScore(filename:string) {
 try {const {stdout}=await execFileAsync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',filename]);const duration=Number(stdout.trim());if(Number.isFinite(duration))return duration;}
 catch {}
 return (await stat(filename)).size;
}
for(const [directory,runs]of groups) {
 const failed=runs.find(r=>r.status!=='passed'&&r.status!=='skipped');
 const message=(failed?.message??'').split('\n').map((line:string)=>line.trim()).find(Boolean)?.slice(0,200)??'';
 const verdict={scenario:runs[0].scenario,project:[...new Set(runs.map(r=>r.project))].join(','),label,status:failed?.status??(runs.every(r=>r.status==='skipped')?'skipped':'passed'),message,duration:runs.reduce((n,r)=>n+r.duration,0)};
 const canonicalProject=process.env.CANONICAL_PROJECT??'desktop';
 const eligible=runs.filter(r=>r.project===canonicalProject&&r.artifacts.length);
 const scoped=eligible.length?eligible:runs.filter(r=>r.artifacts.length);
 const failures=label.startsWith('mutant-')?scoped.filter(r=>r.status==='failed'):[];
 const canonical=(failures.length?failures:scoped).sort((a,b)=>a.repeat-b.repeat||a.attempt-b.attempt)[0];
 if(canonical) {
  const videos=canonical.artifacts.filter((name:string)=>name.endsWith('.webm'));
  // Axe opens temporary pages: choose the longest recording from the designated first repeat.
  const scored=await Promise.all(videos.map(async(name:string)=>({name,score:await videoScore(path.join(directory,name))})));
  // Signed-out guard's explicit context recording is attached before the unused default page.
  const video=canonical.scenario==='S11' && canonical.title.includes('signed-out route')
   ? videos[0] : scored.sort((a,b)=>b.score-a.score)[0]?.name;
  for(const [source,target]of [[video,'video.webm'],[canonical.artifacts.find((n:string)=>n.endsWith('.zip')),'trace.zip'],[canonical.artifacts.find((n:string)=>n.endsWith('.png')),'screenshot.png']]) {
   if(source)await cp(path.join(directory,source),path.join(directory,target));
  }
 }
 await writeFile(path.join(directory,'verdict.json'),JSON.stringify(verdict,null,2)+'\n');
 await writeFile(path.join(directory,'runs.json'),JSON.stringify(runs,null,2)+'\n');
}
console.log(`Evidence collected for ${groups.size} scenarios (${label}; RUN_ID=${outputRunId})`);
