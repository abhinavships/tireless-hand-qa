/**
 * REFEREE: runs a blind trial between two isolated processes and shows it live.
 *   npm run blind      → http://localhost:4600, press Start.
 * 1. The saboteur process secretly plants a random bug (or none) and publishes only a sha256 commitment.
 * 2. The QA inspector process, told nothing, runs every check against the live app.
 * 3. The referee reveals the sealed answer, verifies the commitment and scores the result.
 */
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.BLIND_PORT ?? 4600);
const QA_DIR = fileURLToPath(new URL('..', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SEALED = `${ROOT}.context/sealed/answer.json`;
/** Which inspector check is the primary detector for each bug (used only for scoring, after QA is done). */
const EXPECT: Record<string, string[]> = { M01: ['C1', 'C6'], M02: ['C1'], M03: ['C4', 'C8', 'C10'], M04: ['C2', 'C10'], M05: ['C5', 'C10'], M05b: ['C10', 'C11'], M06: ['C4', 'C10'], M07: ['C9'], M08: ['C6'], M10: ['C7'], M13: ['C3'] };

type Ev = Record<string, unknown>;
const clients = new Set<http.ServerResponse>();
let history: Ev[] = []; let lastFrame: string | undefined; let running = false;
function emit(ev: Ev) {
  if (ev.event === 'frame') lastFrame = ev.data as string; else { history.push(ev); if (history.length > 1500) history = history.slice(-1500); }
  const s = `data: ${JSON.stringify(ev)}\n\n`; for (const c of clients) c.write(s);
}
const ref = (text: string, level = 'info') => emit({ from: 'referee', event: 'log', text, level });

function child(args: string[], env: Record<string, string> = {}): Promise<Ev[]> {
  return new Promise((resolve) => {
    const p = spawn('npx', ['tsx', ...args], { cwd: QA_DIR, env: { ...process.env, ...env } });
    const out: Ev[] = []; let buf = '';
    p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const ev = JSON.parse(line); out.push(ev); emit(ev); } catch { /* non-JSON noise */ } } });
    p.stderr.on('data', (d) => { const t = String(d).trim(); if (t && !/ExperimentalWarning|DeprecationWarning/.test(t)) emit({ from: args[0].includes('saboteur') ? 'saboteur' : 'qa', event: 'log', text: t.slice(0, 400), level: 'dim' }); });
    p.on('close', () => resolve(out));
  });
}
function takeLock() {
  const lock = `${ROOT}.context/locks/app.lock`;
  mkdirSync(`${ROOT}.context/locks`, { recursive: true });
  try { mkdirSync(lock); } catch { throw new Error('The shared app lock is held by another run. Wait a minute and try again.'); }
  writeFileSync(`${lock}/owner`, `blind-referee ${new Date().toISOString()} pid=${process.pid}\n`);
  return () => rmSync(lock, { recursive: true, force: true });
}

async function trial(choice: string) {
  if (running) return; running = true; history = []; lastFrame = undefined;
  emit({ from: 'referee', event: 'reset' });
  let release: (() => void) | undefined;
  try {
    release = takeLock();
    if (existsSync(SEALED)) { ref('found a leftover planted bug from an earlier run; reverting it first', 'warn'); await child(['blind/saboteur.ts', 'revert']); }
    emit({ from: 'referee', event: 'phase', phase: 'sabotage' });
    ref('Phase 1: the SABOTEUR process chooses and plants a bug in secret. The QA process is not running yet and will be told nothing.', 'warn');
    const sab = await child(['blind/saboteur.ts', 'plant', choice]);
    const planted = sab.find((e) => e.event === 'planted');
    if (!planted) throw new Error('saboteur failed: ' + JSON.stringify(sab.find((e) => e.event === 'error') ?? {}));
    const commitment = String(planted.commitment);
    ref(`Public fingerprint of the saboteur's choice: ${commitment.slice(0, 16)}…`, 'dim');

    emit({ from: 'referee', event: 'phase', phase: 'inspect' });
    ref('Phase 2: the BLIND QA process starts. It has no access to the bug list or the sealed answer.', 'warn');
    const qa = await child(['blind/inspector.ts']);
    const verdict = qa.find((e) => e.event === 'verdict') as { failures: { id: string; title: string; message: string }[] } | undefined;
    const failures = verdict?.failures ?? [];

    emit({ from: 'referee', event: 'phase', phase: 'reveal' });
    ref('Phase 3: REVEAL. Opening the sealed answer and checking it against the published fingerprint.', 'warn');
    const ans = JSON.parse(readFileSync(SEALED, 'utf8')) as { id: string; description: string; salt: string; commitment: string };
    const verified = createHash('sha256').update(`${ans.id}:${ans.salt}`).digest('hex') === commitment;
    const exp = EXPECT[ans.id] ?? [];
    const hit = failures.filter((f) => exp.includes(f.id));
    let outcome: 'caught' | 'clean' | 'missed' | 'false-positive' | 'detected-other';
    if (ans.id === 'none') outcome = failures.length ? 'false-positive' : 'clean';
    else outcome = hit.length ? 'caught' : failures.length ? 'detected-other' : 'missed';
    const headline = {
      caught: `CAUGHT ✔ The blind QA found the planted bug without being told about it.`,
      clean: `CORRECT ✔ No bug was planted, and the blind QA reported no problems (no false positive).`,
      missed: `MISSED ✖ A bug was planted but QA reported nothing.`,
      'false-positive': `FALSE ALARM ✖ No bug was planted but QA reported a problem.`,
      'detected-other': `DETECTED ✔ QA reported a problem caused by the planted bug, in a different check than expected.`,
    }[outcome];
    emit({ from: 'referee', event: 'reveal', answer: { id: ans.id, description: ans.description }, verified, commitment, failures, outcome, headline });
    ref(headline, outcome === 'caught' || outcome === 'clean' || outcome === 'detected-other' ? 'ok' : 'bad');

    emit({ from: 'referee', event: 'phase', phase: 'restore' });
    await child(['blind/saboteur.ts', 'revert']);
  } catch (e: any) {
    ref(`Stopped: ${e?.message ?? e}`, 'bad');
    if (existsSync(SEALED)) await child(['blind/saboteur.ts', 'revert']);
  } finally {
    await fetch('http://localhost:4000/api/control/fault', { method: 'DELETE' }).catch(() => undefined);
    release?.(); running = false; emit({ from: 'referee', event: 'idle' });
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    clients.add(res); res.write(`data: ${JSON.stringify({ from: 'referee', event: running ? 'busy' : 'idle' })}\n\n`);
    for (const ev of history) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    if (lastFrame) res.write(`data: ${JSON.stringify({ from: 'qa', event: 'frame', data: lastFrame })}\n\n`);
    req.on('close', () => clients.delete(res)); return;
  }
  if (url.pathname === '/start' && req.method === 'POST') { const was = running; if (!was) void trial(url.searchParams.get('choice') ?? 'random'); res.writeHead(was ? 409 : 202).end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
}).listen(PORT, () => {
  console.log(`Blind trial referee → http://localhost:${PORT}  (Ctrl+C to quit)`);
  try { execSync(`open http://localhost:${PORT}`); } catch { /* not macOS */ }
});

const PAGE = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tireless Hand · Blind Trial</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--bg:#0d1318;--panel:#141c23;--panel2:#1a242d;--ink:#e6ebf0;--muted:#8d9aa7;--line:#25313b;--accent:#f0a24f;--ok:#4cc38a;--bad:#ff7a5c;--warn:#f0c34f;--sab:#d06bff;--qa:#5aa8ff}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 "IBM Plex Sans",system-ui,sans-serif;display:grid;grid-template-rows:auto auto 1fr;padding:0 16px}
header{display:flex;align-items:center;gap:14px;padding:14px 0;flex-wrap:wrap}
h1{font:700 26px/1 "Barlow Condensed",sans-serif;margin:0;letter-spacing:.02em}
.sub{color:var(--muted)}
select,button{font:600 14px "IBM Plex Sans",sans-serif;border-radius:8px;border:1px solid var(--line);padding:9px 12px;background:var(--panel2);color:var(--ink)}
button{background:var(--accent);color:#1a1206;border:0;padding:10px 22px;cursor:pointer}button:disabled{opacity:.45;cursor:default}
select:focus-visible,button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.phases{display:flex;gap:8px;padding-bottom:12px;flex-wrap:wrap}
.ph{flex:1;min-width:150px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;color:var(--muted);font-size:13px}
.ph b{display:block;color:var(--ink);font-size:14px}.ph.on{border-color:var(--accent);background:#231c12}.ph.done{opacity:.7}
main{display:grid;grid-template-columns:300px 1fr 380px;grid-template-rows:minmax(0,1fr) 210px;gap:14px;padding-bottom:14px;min-height:0}
section{background:var(--panel);border:1px solid var(--line);border-radius:12px;min-height:0;display:flex;flex-direction:column}
section>h2{font:600 12px "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;margin:0;padding:11px 14px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block}
#sab{grid-row:1/2}#sab h2{color:var(--sab)}#qa h2{color:var(--qa)}
.box{padding:12px 14px;display:grid;gap:10px;overflow:auto}
.card{background:var(--panel2);border-radius:10px;padding:10px 12px}
.card .k{font:500 11px "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.mono{font-family:"IBM Plex Mono",monospace;word-break:break-all;font-size:12.5px}
.secret{font:700 20px "Barlow Condensed",sans-serif;letter-spacing:.04em}
.iso{font-size:12.5px;color:var(--muted)}.iso li{margin:3px 0}
#browser .view{flex:1;display:grid;place-items:center;background:#090d11;border-radius:0 0 12px 12px;overflow:hidden;min-height:0}
#browser img{max-width:100%;max-height:100%;display:block}
.empty{color:var(--muted);padding:24px;text-align:center}
#qa{grid-row:1/3}
.chk{display:grid;grid-template-columns:34px 1fr;gap:8px;padding:8px 14px;border-bottom:1px solid var(--line)}
.chk .id{font:600 12px "IBM Plex Mono",monospace;color:var(--muted);padding-top:2px}
.chk .t{font-weight:600}.chk .m{font-size:12.5px;color:var(--muted)}
.chk.running{background:#1b2533}.chk.running .id{color:var(--qa)}
.chk.pass .id{color:var(--ok)}.chk.fail{background:#2c1a16}.chk.fail .id,.chk.fail .m{color:var(--bad)}
.cmp{padding:10px 14px;border-top:1px solid var(--line)}
.cmp .ttl{font-weight:600;margin-bottom:6px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.col{background:var(--panel2);border-radius:8px;padding:8px}
.col h3{margin:0 0 4px;font:600 10.5px "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.kv{display:flex;justify-content:space-between;gap:6px;font-size:12.5px;border-bottom:1px dashed var(--line);padding:2px 0}
.kv span:first-child{color:var(--muted)}.kv span:last-child{font-family:"IBM Plex Mono",monospace;text-align:right;word-break:break-word}
.note{margin-top:6px;font-size:12.5px;padding:6px 8px;border-radius:6px;background:var(--panel2)}.note.ok{color:var(--ok);background:#12301f}.note.bad{color:var(--bad);background:#3a1d17}
.pipe{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:center;gap:6px;padding:10px 14px;border-top:1px solid var(--line)}
.node{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:6px 8px;text-align:center;font-size:12px}
.node b{display:block;font:700 18px "Barlow Condensed",sans-serif;font-variant-numeric:tabular-nums}
.arrow{color:var(--muted);font:600 12px "IBM Plex Mono",monospace;text-align:center}.arrow.bad{color:var(--bad)}
.ledgerStats{display:flex;gap:14px;padding:0 14px 10px;font-size:12.5px;color:var(--muted);flex-wrap:wrap}.ledgerStats b{color:var(--ink);font-variant-numeric:tabular-nums}
#term{grid-column:1/3}
#log{flex:1;overflow:auto;padding:8px 14px;font:12px/1.55 "IBM Plex Mono",monospace;background:#090d11;border-radius:0 0 12px 12px}
#log div{white-space:pre-wrap}
.src-saboteur{color:var(--sab)}.src-qa{color:var(--qa)}.src-referee{color:var(--accent)}
.l-ok{color:var(--ok)}.l-bad{color:var(--bad)}.l-warn{color:var(--warn)}.l-dim{color:#66737f}.l-cmd{color:#8ab4ff}
#reveal{position:fixed;inset:0;background:rgba(5,8,11,.82);display:none;place-items:center;padding:16px;z-index:9}
#reveal .in{background:var(--panel);border:1px solid var(--line);border-radius:16px;max-width:760px;width:100%;padding:24px;display:grid;gap:14px;max-height:90vh;overflow:auto}
#reveal h2{font:700 30px/1.1 "Barlow Condensed",sans-serif;margin:0}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:1100px){main{grid-template-columns:1fr;grid-template-rows:auto}#sab,#qa,#term{grid-row:auto;grid-column:auto}#browser .view{min-height:300px}#term{height:240px}.two{grid-template-columns:1fr}}
</style></head><body>
<header>
  <h1>Tireless Hand · Blind Trial</h1>
  <span class="sub">One process plants a secret bug. A separate QA process, told nothing, finds it by reconciling backend ↔ wire ↔ screen.</span>
  <span style="flex:1"></span>
  <label for="choice" class="sub">Saboteur</label>
  <select id="choice"><option value="random">Random secret choice</option><option value="none">No bug (control run)</option></select>
  <button id="start">Start blind trial</button>
</header>
<div class="phases">
  <div class="ph" data-p="sabotage"><b>1 · Sabotage</b>Saboteur plants a bug in secret</div>
  <div class="ph" data-p="inspect"><b>2 · Blind inspection</b>QA checks everything, knowing nothing</div>
  <div class="ph" data-p="reveal"><b>3 · Reveal</b>Sealed answer opened and verified</div>
  <div class="ph" data-p="restore"><b>4 · Restore</b>Bug removed, app clean again</div>
</div>
<main>
  <section id="sab"><h2><span class="dot" style="background:var(--sab)"></span>Saboteur · isolated process</h2>
    <div class="box">
      <div class="card"><div class="k">Status</div><div id="sabStatus">Waiting</div></div>
      <div class="card"><div class="k">Bug chosen</div><div class="secret" id="sabSecret">— sealed —</div></div>
      <div class="card"><div class="k">Public fingerprint (sha256 commitment)</div><div class="mono" id="sabCommit">—</div></div>
      <div class="card iso"><div class="k">Why QA can't cheat</div><ul>
        <li>Saboteur and QA are separate OS processes.</li>
        <li>QA never reads the bug list or the sealed answer.</li>
        <li>Hidden markers are stripped from the planted code.</li>
        <li>The fingerprint is published before QA starts, so the answer can't be changed afterwards.</li>
        <li>Sometimes no bug is planted at all, which tests for false alarms.</li></ul></div>
    </div>
  </section>
  <section id="browser"><h2><span class="dot" style="background:var(--qa)"></span>Live browser · driven by the QA process</h2><div class="view" id="view"><div class="empty">Press <b>Start blind trial</b>. The browser appears here when QA starts.</div></div></section>
  <section id="qa"><h2><span class="dot" style="background:var(--qa)"></span>Blind QA · isolated process</h2>
    <div id="checks" style="overflow:auto;flex:1"></div>
    <div class="pipe" title="Where did the truth get corrupted?">
      <div class="node">Backend<b>truth</b></div><div class="arrow" id="a1">→</div>
      <div class="node">Wire (tapped)<b id="lgFrames">0</b></div><div class="arrow" id="a2">→</div>
      <div class="node">Screen<b id="lgExact">0/0</b></div>
    </div>
    <div class="ledgerStats"><span>Exact matches <b id="lgExact2">0</b></span><span>Mismatches <b id="lgMis">0</b></span><span id="lgLayer"></span></div>
    <div class="cmp"><div class="ttl" id="cmpT">What QA sees vs what is true</div>
      <div class="cols"><div class="col"><h3>Operator sees</h3><div id="cmpS"></div></div><div class="col"><h3>Actually true</h3><div id="cmpR"></div></div></div>
      <div class="note" id="cmpN">—</div></div>
  </section>
  <section id="term"><h2>Live log · <span class="src-saboteur">saboteur</span> · <span class="src-qa">qa</span> · <span class="src-referee">referee</span></h2><div id="log"></div></section>
</main>
<div id="reveal"><div class="in">
  <div class="k" style="font:600 12px 'IBM Plex Mono',monospace;letter-spacing:.12em;color:var(--muted)">REVEAL</div>
  <h2 id="rvHead"></h2>
  <div class="two">
    <div class="card"><div class="k">Saboteur planted (sealed answer)</div><div class="secret" id="rvAns"></div><div class="iso" id="rvVer"></div></div>
    <div class="card"><div class="k">Blind QA reported</div><div id="rvQa"></div></div>
  </div>
  <button id="rvClose">Close</button>
</div></div>
<script>
const $=s=>document.querySelector(s);const logEl=$('#log');let img=null;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const kv=o=>Object.entries(o||{}).map(([k,v])=>'<div class="kv"><span>'+esc(k)+'</span><span>'+esc(v)+'</span></div>').join('')||'<div class="kv"><span>—</span><span></span></div>';
function line(src,text,cls){const d=document.createElement('div');d.innerHTML='<span class="src-'+src+'">['+src+']</span> <span class="'+cls+'">'+esc(text)+'</span>';logEl.appendChild(d);logEl.scrollTop=logEl.scrollHeight}
function busy(b){$('#start').disabled=b;$('#choice').disabled=b}
function reset(){logEl.innerHTML='';$('#checks').innerHTML='';$('#sabStatus').textContent='Starting';$('#sabSecret').textContent='— sealed —';$('#sabCommit').textContent='—';$('#cmpS').innerHTML='';$('#cmpR').innerHTML='';['#lgFrames','#lgExact2','#lgMis'].forEach(x=>$(x).textContent='0');$('#lgExact').textContent='0/0';$('#lgLayer').textContent='';$('#a1').className=$('#a2').className='arrow';$('#a1').textContent=$('#a2').textContent='→';$('#cmpN').className='note';$('#cmpN').textContent='—';document.querySelectorAll('.ph').forEach(p=>p.className='ph');$('#view').innerHTML='<div class="empty">Waiting for the QA process…</div>';img=null;$('#reveal').style.display='none'}
let phases=['sabotage','inspect','reveal','restore'];
const es=new EventSource('/events');
es.onmessage=m=>{const e=JSON.parse(m.data);const src=e.from||'referee';
 switch(e.event){
  case 'reset':reset();busy(true);break;case 'busy':busy(true);break;case 'idle':busy(false);break;
  case 'phase':{const i=phases.indexOf(e.phase);document.querySelectorAll('.ph').forEach(p=>{const j=phases.indexOf(p.dataset.p);p.className='ph'+(j<i?' done':j===i?' on':'')});break}
  case 'status':$('#sabStatus').textContent=e.text;line(src,e.text,'l-info');break;
  case 'planted':$('#sabStatus').textContent=e.text;$('#sabCommit').textContent=e.commitment;line(src,'planted. fingerprint '+e.commitment.slice(0,16)+'…','l-warn');break;
  case 'reverted':$('#sabStatus').textContent=e.text;line(src,e.text,e.clean?'l-ok':'l-bad');break;
  case 'plan':$('#checks').innerHTML=e.checks.map(c=>'<div class="chk" data-id="'+c.id+'"><div class="id">'+c.id+'</div><div><div class="t">'+esc(c.title)+'</div><div class="m">'+esc(c.why)+'</div></div></div>').join('');break;
  case 'check':{const el=document.querySelector('.chk[data-id="'+e.id+'"]');if(el){el.className='chk '+e.status;el.querySelector('.m').textContent=(e.status==='pass'?'PASS · ':e.status==='fail'?'PROBLEM · ':'')+e.message;if(e.status==='running')el.scrollIntoView({block:'nearest'})}break}
  case 'compare':$('#cmpT').textContent=e.title;$('#cmpS').innerHTML=kv(e.screen);$('#cmpR').innerHTML=kv(e.truth);$('#cmpN').textContent=e.note;$('#cmpN').className='note'+(e.ok===true?' ok':e.ok===false?' bad':'');break;
  case 'frame':if(!img){$('#view').innerHTML='';img=new Image();img.alt='Live view of the browser driven by the QA process';$('#view').appendChild(img)}img.src='data:image/jpeg;base64,'+e.data;break;
  case 'log':line(src,e.text,'l-'+(e.level||'info'));break;
  case 'cmd':line(src,'$ '+e.text,'l-cmd');break;
  case 'error':line(src,'ERROR '+e.text,'l-bad');break;
  case 'ledger':{$('#lgFrames').textContent=e.frames.toLocaleString()+' msgs';$('#lgExact').textContent=e.exact+'/'+e.assertions;$('#lgExact2').textContent=e.exact;$('#lgMis').textContent=e.mismatches;
    const L=e.byLayer||{};const fe=L['wire→screen (frontend rendering)']||0,tr=L['backend→wire (transport/backend)']||0;
    $('#a1').className='arrow'+(tr?' bad':'');$('#a1').textContent=tr?'✖ '+tr:'→';$('#a2').className='arrow'+(fe?' bad':'');$('#a2').textContent=fe?'✖ '+fe:'→';
    $('#lgLayer').textContent=Object.keys(L).length?('Root cause: '+Object.entries(L).map(([k,v])=>k+' ×'+v).join(', ')):'';break}
  case 'verdict':line(src,e.failures.length?('verdict: '+e.failures.length+' problem(s)'):'verdict: no problems','l-warn');break;
  case 'reveal':{$('#sabSecret').textContent=e.answer.id==='none'?'No bug':e.answer.id+' · '+e.answer.description;
    $('#rvHead').textContent=e.headline;$('#rvHead').style.color=/✔/.test(e.headline)?'var(--ok)':'var(--bad)';
    $('#rvAns').textContent=e.answer.id==='none'?'No bug (control run)':e.answer.id+': '+e.answer.description;
    $('#rvVer').textContent=e.verified?'Fingerprint verified ✔ (the answer matches what was committed before QA started)':'Fingerprint MISMATCH ✖';
    $('#rvQa').innerHTML=e.failures.length?e.failures.map(f=>'<div style="margin:6px 0"><b>'+esc(f.id+' · '+f.title)+'</b><div class="iso" style="color:var(--bad)">'+esc(f.message)+'</div>'+(f.layer?'<div class="iso">Located at: <b style="color:var(--ink)">'+esc(f.layer)+'</b></div>':'')+'</div>').join(''):'<div style="color:var(--ok);font-weight:600">No problems found</div>';
    $('#reveal').style.display='grid';break}
 }};
$('#start').onclick=async()=>{busy(true);const r=await fetch('/start?choice='+encodeURIComponent($('#choice').value),{method:'POST'});if(r.status===409)line('referee','A trial is already running.','l-warn')};
$('#rvClose').onclick=()=>{$('#reveal').style.display='none'};
</script></body></html>`;
