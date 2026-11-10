/**
 * TIRELESS HAND HUB: one dashboard for the whole system.
 *   npm run hub   → http://localhost:4700
 * Stages (run one or all):
 *   1 Learn        learner builds the product model on the current (clean) build
 *   2 Blind trial  saboteur plants a secret bug (or none); blind QA with the wire ledger must find it
 *   3 Generate     saboteur plants a secret cockpit bug; the engine generates + runs scenarios and clusters root causes
 *   4 Relearn      the learner is pointed at that broken build and must flag the bug instead of learning it
 *   5 Map trial    saboteur plants a secret map bug; the blind map inspector (14 checks, learned tolerances) must find it
 *   6 Map learner  saboteur plants a secret map bug; the calibrating map learner must REFUSE to learn that build
 * Every stage is a separate OS process; the hub only relays their events and verifies the sealed answers.
 */
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.HUB_PORT ?? 4700);
const QA = fileURLToPath(new URL('..', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SEALED = `${ROOT}.context/sealed/answer.json`;
const EXPECT: Record<string, string[]> = { MAP01: ['G2', 'G6'], MAP02: ['G2', 'G6'], MAP03: ['G8', 'G15'], MAP04: ['G3'], MAP05: ['G4'], MAP06: ['G2', 'G6', 'G7'], MAP07: ['G7'], MAP08: ['G13'], MAP09: ['G5'], MAP10: ['G12'], MAP11: ['G11'], MAP12: ['G10'], MAP13: ['G9'], MAP14: ['G14'], MAP15: ['G3'], M01: ['C1', 'C6'], M02: ['C1'], M03: ['C4', 'C8', 'C10'], M04: ['C2', 'C10'], M05: ['C5', 'C10'], M05b: ['C10', 'C11'], M06: ['C4', 'C10'], M07: ['C9'], M08: ['C6'], M10: ['C7'], M13: ['C3'] };

type Ev = Record<string, unknown>;
const clients = new Set<http.ServerResponse>();
let history: Ev[] = []; let lastFrame: string | undefined; let running = false;
function emit(ev: Ev) {
  if (ev.event === 'frame') lastFrame = ev.data as string; else { history.push(ev); if (history.length > 3000) history = history.slice(-3000); }
  const s = `data: ${JSON.stringify(ev)}\n\n`; for (const c of clients) c.write(s);
}
const hub = (text: string, level = 'info') => emit({ from: 'hub', event: 'log', text, level });
const stage = (n: number, status: string, extra: Ev = {}) => emit({ from: 'hub', event: 'stage', n, status, ...extra });

function child(args: string[], env: Record<string, string> = {}, src = 'qa'): Promise<Ev[]> {
  return new Promise((resolve) => {
    const p = spawn('npx', ['tsx', ...args], { cwd: QA, env: { ...process.env, ...env } });
    const out: Ev[] = []; let buf = '';
    p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const ev = JSON.parse(line); out.push(ev); emit(ev); } catch { if (line.trim()) emit({ from: src, event: 'log', text: line.trim().slice(0, 300), level: 'dim' }); } } });
    p.stderr.on('data', (d) => { const t = String(d).trim(); if (t && !/Warning/.test(t)) emit({ from: src, event: 'log', text: t.slice(0, 300), level: 'dim' }); });
    p.on('close', () => resolve(out));
  });
}
function lock() {
  const l = `${ROOT}.context/locks/app.lock`; mkdirSync(`${ROOT}.context/locks`, { recursive: true });
  try { mkdirSync(l); } catch { throw new Error('The shared app lock is held by another run. Wait and retry.'); }
  writeFileSync(`${l}/owner`, `hub ${new Date().toISOString()} pid=${process.pid}\n`);
  return () => rmSync(l, { recursive: true, force: true });
}
const clean = async () => { if (existsSync(SEALED)) { hub('reverting a bug left planted by an earlier run', 'warn'); await child(['blind/saboteur.ts', 'revert'], {}, 'saboteur'); } };
function openSealed(commitment: string) {
  const a = JSON.parse(readFileSync(SEALED, 'utf8')) as { id: string; description: string; salt: string };
  return { ...a, verified: createHash('sha256').update(`${a.id}:${a.salt}`).digest('hex') === commitment };
}

async function learn() {
  stage(1, 'running'); await clean();
  const ev = await child(['auto/discover.ts'], { EVENTS: '1', MODEL_FILE: 'model.json', HEADLESS: '1' }, 'learn');
  const b = ev.find((e) => e.event === 'bindings');
  stage(1, b ? 'done' : 'fail', { summary: b ? `${(b.bindings as unknown[]).length} bindings learned from ${b.wire} wire messages` : 'learning failed' });
}
async function blind(choice: string) {
  stage(2, 'running'); const release = lock();
  try {
    await clean();
    const sab = await child(['blind/saboteur.ts', 'plant', choice], {}, 'saboteur');
    const planted = sab.find((e) => e.event === 'planted'); if (!planted) throw new Error('saboteur failed');
    const qa = await child(['blind/inspector.ts'], { PACE: process.env.PACE ?? '1', HEADLESS: '1' }, 'qa');
    const failures = ((qa.find((e) => e.event === 'verdict') as any)?.failures ?? []) as { id: string; title: string; message: string; layer?: string }[];
    const a = openSealed(String(planted.commitment));
    const hit = failures.filter((f) => (EXPECT[a.id] ?? []).includes(f.id));
    const outcome = a.id === 'none' ? (failures.length ? 'FALSE ALARM' : 'CORRECT: no bug, no alarm') : hit.length ? 'CAUGHT' : failures.length ? 'DETECTED (other check)' : 'MISSED';
    emit({ from: 'hub', event: 'reveal', stage: 2, answer: { id: a.id, description: a.description }, verified: a.verified, failures, outcome });
    await child(['blind/saboteur.ts', 'revert'], {}, 'saboteur');
    stage(2, /CAUGHT|CORRECT|DETECTED/.test(outcome) ? 'done' : 'fail', { summary: `${outcome} · planted ${a.id}` });
  } finally { await fetch('http://localhost:4000/api/control/fault', { method: 'DELETE' }).catch(() => undefined); release(); }
}
async function generate(limit: number) {
  stage(3, 'running'); await clean();
  const sab = await child(['blind/saboteur.ts', 'plant', 'random-cockpit'], {}, 'saboteur');
  const planted = sab.find((e) => e.event === 'planted'); if (!planted) { stage(3, 'fail'); return; }
  try {
    const ev = await child(['auto/engine.ts', 'run', '--limit', String(limit), '--events'], {}, 'auto');
    const rep = ev.find((e) => e.event === 'report') as any;
    stage(3, rep ? 'done' : 'fail', { summary: rep ? `${rep.passed}/${rep.total} scenarios passed · ${rep.clusters.length} root-cause cluster(s)` : 'engine failed' });
    stage(4, 'running');
    const re = await child(['auto/discover.ts'], { EVENTS: '1', MODEL_FILE: 'model.broken.json', HEADLESS: '1' }, 'relearn');
    const rb = re.find((e) => e.event === 'bindings') as any;
    const a = openSealed(String(planted.commitment));
    const clusters = rep?.clusters ?? [];
    // Model drift: what the clean model had that the broken build no longer has.
    const drift: string[] = [];
    try {
      const good = JSON.parse(readFileSync(`${QA}auto/out/model.json`, 'utf8')); const bad = JSON.parse(readFileSync(`${QA}auto/out/model.broken.json`, 'utf8'));
      for (const vp of Object.keys(good.presenceBy ?? {})) {
        const now = new Set((bad.presenceBy?.[vp] ?? []).map((p: any) => p.sel));
        for (const p of good.presenceBy[vp]) if (!now.has(p.sel)) drift.push(`${vp}: ${p.sel} was usable, now gone`);
      }
      const nowB = new Set((bad.bindings ?? []).map((b: any) => b.selector));
      for (const b of good.bindings ?? []) if (!nowB.has(b.selector)) drift.push(`display rule lost: ${b.label} no longer equals ${b.attr}.${b.path}`);
      const oldU = new Set((good.unexplained ?? []).map((u: any) => u.selector));
      for (const u of bad.unexplained ?? []) if (!oldU.has(u.selector)) drift.push(`new unexplained value: ${u.selector} shows ${u.texts.slice(0, 2).join(', ')}`);
    } catch (e) { drift.push(`could not compare models: ${e}`); }
    emit({ from: 'hub', event: 'reveal', stage: 3, answer: { id: a.id, description: a.description }, verified: a.verified, clusters, unexplained: rb?.unexplained ?? [], drift, bindings: rb?.bindings?.length ?? 0, outcome: clusters.length ? 'DETECTED by generated scenarios' : 'NOT DETECTED by generated scenarios' });
    stage(4, 'done', { summary: `model drift vs clean model: ${drift.length} change(s)` });
  } finally { await child(['blind/saboteur.ts', 'revert'], {}, 'saboteur'); }
}

async function mapTrial(choice: string) {
  stage(5, 'running'); const release = lock();
  try {
    await clean();
    if (!existsSync(`${QA}map/out/map-model.json`)) await child(['map/learn.ts'], { EVENTS: '1' }, 'map');
    const sab = await child(['blind/saboteur.ts', 'plant', choice === 'none' ? 'none' : 'random-map'], {}, 'saboteur');
    const planted = sab.find((e) => e.event === 'planted'); if (!planted) throw new Error('saboteur failed');
    const qa = await child(['map/inspector.ts'], { PACE: process.env.PACE ?? '1' }, 'map');
    const v = qa.find((e) => e.event === 'verdict') as any; const failures = v?.failures ?? []; const findings = v?.findings ?? [];
    const a = openSealed(String(planted.commitment));
    const hit = failures.filter((f: any) => (EXPECT[a.id] ?? []).includes(f.id));
    const outcome = a.id === 'none' ? (failures.length ? 'FALSE ALARM' : 'CORRECT: no bug, no alarm') : hit.length ? 'CAUGHT' : failures.length ? 'DETECTED (other check)' : 'MISSED';
    emit({ from: 'hub', event: 'reveal', stage: 5, answer: { id: a.id, description: a.description }, verified: a.verified, failures, findings, outcome });
    await child(['blind/saboteur.ts', 'revert'], {}, 'saboteur');
    stage(5, /CAUGHT|CORRECT|DETECTED/.test(outcome) ? 'done' : 'fail', { summary: `${outcome} · planted ${a.id}` });
  } finally { await fetch('http://localhost:4000/api/control/fault', { method: 'DELETE' }).catch(() => undefined); release(); }
}

/** The calibrating map learner must refuse a broken build (and accept the clean one): a learner that learns a bug as normal hides it forever. */
async function mapLearnerTrial(choice: string) {
  stage(6, 'running'); const release = lock();
  try {
    await clean();
    // Only bugs that distort what the calibration flight measures (position, heading, height, latency) are fair game.
    const pool = ['none', 'MAP01', 'MAP02', 'MAP05', 'MAP06', 'MAP14', 'MAP15'];
    const pick = choice === 'none' ? 'none' : pool[Math.floor(Math.random() * pool.length)];
    const sab = await child(['blind/saboteur.ts', 'plant', pick], {}, 'saboteur');
    const planted = sab.find((e) => e.event === 'planted'); if (!planted) throw new Error('saboteur failed');
    const ev = await child(['map/learn.ts'], { EVENTS: '1', MAP_MODEL_FILE: 'map-model.relearn.json', CAL_SECONDS: process.env.CAL_SECONDS ?? '18' }, 'learn');
    const rejected = ev.find((e) => e.event === 'rejected') as any; const learned = ev.find((e) => e.event === 'learned');
    const a = openSealed(String(planted.commitment));
    const outcome = a.id === 'none' ? (learned ? 'CORRECT: clean build accepted and learned' : 'FALSE ALARM: learner refused the clean build')
      : rejected ? 'CAUGHT: learner refused to learn the broken build' : 'MISSED: learner accepted a broken build as normal';
    const failures = (rejected?.reasons ?? []).map((r: string) => ({ id: 'LEARN', title: 'Calibration failed physical sanity', message: r, layer: 'map rendering (found while learning)' }));
    emit({ from: 'hub', event: 'reveal', stage: 6, answer: { id: a.id, description: a.description }, verified: a.verified, failures, outcome });
    await child(['blind/saboteur.ts', 'revert'], {}, 'saboteur');
    stage(6, /CAUGHT|CORRECT/.test(outcome) ? 'done' : 'fail', { summary: `${outcome.split(':')[0]} · planted ${a.id}` });
  } finally { await fetch('http://localhost:4000/api/control/fault', { method: 'DELETE' }).catch(() => undefined); release(); }
}

async function run(what: string, choice: string, limit: number) {
  if (running) return; running = true; history = []; lastFrame = undefined;
  emit({ from: 'hub', event: 'reset', what });
  try {
    if (what === 'all' || what === 'learn') await learn();
    if (what === 'all' || what === 'blind') await blind(choice);
    if (what === 'all' || what === 'generate') await generate(limit);
    if (what === 'all' || what === 'map') await mapTrial(choice);
    if (what === 'all' || what === 'maplearn') await mapLearnerTrial(choice);
  } catch (e: any) { hub(`stopped: ${e?.message ?? e}`, 'bad'); }
  finally { await clean().catch(() => undefined); running = false; emit({ from: 'hub', event: 'idle' }); }
}

http.createServer((req, res) => {
  const u = new URL(req.url ?? '/', 'http://x');
  if (u.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    clients.add(res); res.write(`data: ${JSON.stringify({ from: 'hub', event: running ? 'busy' : 'idle' })}\n\n`);
    for (const ev of history) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    if (lastFrame) res.write(`data: ${JSON.stringify({ event: 'frame', data: lastFrame })}\n\n`);
    req.on('close', () => clients.delete(res)); return;
  }
  if (u.pathname === '/run' && req.method === 'POST') {
    const was = running; if (!was) void run(u.searchParams.get('what') ?? 'all', u.searchParams.get('choice') ?? 'random', Number(u.searchParams.get('limit') ?? 8));
    res.writeHead(was ? 409 : 202).end(); return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
}).listen(PORT, () => { console.log(`Tireless Hand hub → http://localhost:${PORT}`); try { execSync(`open http://localhost:${PORT}`); } catch { /* */ } });

const PAGE = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tireless Hand Hub</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--bg:#0d1318;--panel:#141c23;--panel2:#1a242d;--ink:#e6ebf0;--muted:#8d9aa7;--line:#25313b;--accent:#f0a24f;--ok:#4cc38a;--bad:#ff7a5c;--warn:#f0c34f;--learn:#4fd1c5;--sab:#d06bff;--qa:#5aa8ff;--auto:#f0a24f}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 "IBM Plex Sans",system-ui,sans-serif;padding:0 16px;display:grid;grid-template-rows:auto auto 1fr}
header{display:flex;align-items:center;gap:12px;padding:12px 0;flex-wrap:wrap}
h1{font:700 26px/1 "Barlow Condensed",sans-serif;margin:0}
.tabs{display:flex;gap:4px;margin-left:12px}.tab{background:none;border:1px solid var(--line);color:var(--muted);padding:7px 14px;border-radius:8px;cursor:pointer;font:600 13px "IBM Plex Sans"}.tab.on{color:var(--ink);background:var(--panel2);border-color:var(--accent)}
select,button{font:600 13px "IBM Plex Sans",sans-serif;border-radius:8px;border:1px solid var(--line);padding:8px 11px;background:var(--panel2);color:var(--ink);cursor:pointer}
button.go{background:var(--accent);color:#1a1206;border:0}button:disabled,select:disabled{opacity:.45;cursor:default}
button:focus-visible,select:focus-visible,.tab:focus-visible{outline:2px solid #fff;outline-offset:2px}
.stages{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding-bottom:12px}
.st{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:12.5px;color:var(--muted)}
.st b{display:block;color:var(--ink);font-size:14px}.st .s{font:500 11px "IBM Plex Mono",monospace;text-transform:uppercase;letter-spacing:.08em}
.st.running{border-color:var(--accent);background:#231c12}.st.running .s{color:var(--accent)}.st.done .s{color:var(--ok)}.st.fail .s{color:var(--bad)}
#live{display:grid;grid-template-columns:1fr 420px;grid-template-rows:minmax(0,1fr) 220px;gap:12px;padding-bottom:12px;min-height:0}
section{background:var(--panel);border:1px solid var(--line);border-radius:12px;min-height:0;display:flex;flex-direction:column}
section>h2{font:600 12px "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0;padding:10px 14px;border-bottom:1px solid var(--line);display:flex;gap:8px;align-items:center}
#browser .view{flex:1;display:grid;place-items:center;background:#090d11;border-radius:0 0 12px 12px;overflow:hidden;min-height:0}
#browser img{max-width:100%;max-height:100%}
.empty{color:var(--muted);padding:20px;text-align:center}
#side{grid-row:1/3;overflow:auto}
.blk{padding:10px 14px;border-bottom:1px solid var(--line)}
.blk h3{margin:0 0 6px;font:600 11px "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.bar{height:6px;background:var(--panel2);border-radius:99px;overflow:hidden}.bar i{display:block;height:100%;background:var(--learn);width:0}
table{width:100%;border-collapse:collapse;font-size:12.5px}td{padding:4px 4px;border-bottom:1px dashed var(--line);vertical-align:top}
td.m{font-family:"IBM Plex Mono",monospace;color:var(--learn);word-break:break-all}
.chk{display:grid;grid-template-columns:36px 1fr;gap:6px;padding:5px 0;border-bottom:1px dashed var(--line);font-size:12.5px}
.chk .id{font:600 11.5px "IBM Plex Mono",monospace;color:var(--muted)}.chk.running{color:var(--qa)}.chk.pass .id{color:var(--ok)}.chk.fail{color:var(--bad)}.chk.finding{color:var(--warn)}.chk.finding .m{color:var(--warn)}.chk .m{color:var(--muted);font-size:12px}.chk.fail .m{color:var(--bad)}
.pipe{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:6px;align-items:center}
.node{background:var(--panel2);border-radius:8px;padding:6px;text-align:center;font-size:11.5px}.node b{display:block;font:700 17px "Barlow Condensed";font-variant-numeric:tabular-nums}
.arrow{color:var(--muted);font:600 12px "IBM Plex Mono";text-align:center}.arrow.bad{color:var(--bad)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:8px}.col{background:var(--panel2);border-radius:8px;padding:7px}
.kv{display:flex;justify-content:space-between;gap:6px;font-size:12px;border-bottom:1px dashed var(--line);padding:2px 0}.kv span:last-child{font-family:"IBM Plex Mono",monospace;text-align:right;word-break:break-word}
.note{margin-top:6px;font-size:12px;padding:5px 8px;border-radius:6px;background:var(--panel2)}.note.ok{color:var(--ok);background:#12301f}.note.bad{color:var(--bad);background:#3a1d17}
.sc{display:grid;grid-template-columns:40px 1fr auto;gap:6px;font-size:12px;padding:4px 0;border-bottom:1px dashed var(--line)}.sc .id{font-family:"IBM Plex Mono";color:var(--muted)}.sc.pass .r{color:var(--ok)}.sc.fail .r{color:var(--bad)}.sc.running{color:var(--auto)}
.warnrow{color:var(--warn);font-size:12px;margin:3px 0}
#term{grid-column:1}
#log{flex:1;overflow:auto;padding:8px 14px;font:12px/1.55 "IBM Plex Mono",monospace;background:#090d11;border-radius:0 0 12px 12px}
#log div{white-space:pre-wrap}.src-learn,.src-relearn{color:var(--learn)}.src-saboteur{color:var(--sab)}.src-qa{color:var(--qa)}.src-auto{color:var(--auto)}.src-hub{color:#cfd6dc}.src-map{color:#7ee787}
.l-ok{color:var(--ok)}.l-bad{color:var(--bad)}.l-warn{color:var(--warn)}.l-dim{color:#66737f}.l-cmd{color:#8ab4ff}
#reveal{position:fixed;inset:0;background:rgba(5,8,11,.82);display:none;place-items:center;padding:16px;z-index:9}
#reveal .in{background:var(--panel);border:1px solid var(--line);border-radius:16px;max-width:820px;width:100%;padding:22px;display:grid;gap:12px;max-height:90vh;overflow:auto}
#reveal h2{font:700 28px/1.1 "Barlow Condensed";margin:0}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card{background:var(--panel2);border-radius:10px;padding:10px 12px}.card .k{font:500 11px "IBM Plex Mono";letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
#how{display:none;overflow:auto;padding-bottom:24px}
#how .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
#how .box{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
#how h2{font:700 24px "Barlow Condensed";margin:4px 0 8px}#how h3{font:600 16px "IBM Plex Sans";margin:0 0 6px}
#how p,#how li{color:#c9d2da;font-size:14px}#how code{font-family:"IBM Plex Mono";font-size:12.5px;background:var(--panel2);padding:1px 5px;border-radius:4px}
#how pre{background:#090d11;border:1px solid var(--line);border-radius:10px;padding:12px;overflow-x:auto;font:12px/1.55 "IBM Plex Mono";color:#dfe6ec}
@media (max-width:1100px){#live{grid-template-columns:1fr;grid-template-rows:auto}#side,#term{grid-row:auto;grid-column:auto}#browser .view{min-height:300px}#term{height:240px}.stages{grid-template-columns:1fr 1fr}.two{grid-template-columns:1fr}}
</style></head><body>
<header>
  <h1>Tireless Hand</h1>
  <div class="tabs"><button class="tab on" data-t="live">Live</button><button class="tab" data-t="how">How it works</button></div>
  <span style="flex:1"></span>
  <label class="sub" for="choice" style="color:var(--muted)">Blind trial bug</label>
  <select id="choice"><option value="random">Secret random</option><option value="none">None (control)</option></select>
  <label for="limit" style="color:var(--muted)">Scenarios</label>
  <select id="limit"><option>6</option><option selected>8</option><option>12</option><option>30</option></select>
  <button data-run="learn">1 · Learn</button><button data-run="blind">2 · Blind trial</button><button data-run="generate">3+4 · Generate</button><button data-run="map">5 · Map trial</button><button data-run="maplearn">6 · Map learner</button><button class="go" data-run="all">Run everything</button>
</header>
<div class="stages" id="stages">
  <div class="st" data-n="1"><span class="s">waiting</span><b>1 · Learn</b><span class="sum">Build the product model on the clean build</span></div>
  <div class="st" data-n="2"><span class="s">waiting</span><b>2 · Blind trial</b><span class="sum">Secret bug vs blind QA + wire ledger</span></div>
  <div class="st" data-n="3"><span class="s">waiting</span><b>3 · Generate</b><span class="sum">Engine writes and runs its own scenarios</span></div>
  <div class="st" data-n="4"><span class="s">waiting</span><b>4 · Relearn</b><span class="sum">Learner pointed at the broken build</span></div>
  <div class="st" data-n="5"><span class="s">waiting</span><b>5 · Map trial</b><span class="sum">Secret map bug vs blind map inspector</span></div>
  <div class="st" data-n="6"><span class="s">waiting</span><b>6 · Map learner</b><span class="sum">Learner must refuse a secretly broken map</span></div>
</div>
<div id="live">
  <section id="browser"><h2>Live browser <span id="who" style="color:var(--muted)"></span></h2><div class="view" id="view"><div class="empty">Run a stage to see the browser here.</div></div></section>
  <section id="side"><h2>Details</h2>
    <div class="blk" id="bLearn" hidden><h3>Learning: screen ↔ wire correlation</h3><div class="bar"><i id="lbar"></i></div><div id="lsample" style="font-size:12px;color:var(--muted);margin-top:4px"></div><table id="ltab"></table><div id="lunx"></div></div>
    <div class="blk" id="bQa" hidden><h3 id="qaTitle">Blind QA checks</h3><div id="checks"></div></div>
    <div class="blk" id="bPipe" hidden><h3>Wire-to-pixel ledger</h3><div class="pipe"><div class="node">Backend<b>truth</b></div><div class="arrow" id="a1">→</div><div class="node">Wire<b id="lgF">0</b></div><div class="arrow" id="a2">→</div><div class="node">Screen<b id="lgE">0/0</b></div></div></div>
    <div class="blk" id="bCmp" hidden><h3 id="cmpT">Screen vs truth</h3><div class="cols"><div class="col"><div style="font:600 10.5px 'IBM Plex Mono';color:var(--muted)">OPERATOR SEES</div><div id="cmpS"></div></div><div class="col"><div style="font:600 10.5px 'IBM Plex Mono';color:var(--muted)">ACTUALLY TRUE</div><div id="cmpR"></div></div></div><div class="note" id="cmpN">—</div></div>
    <div class="blk" id="bGen" hidden><h3>Generated scenarios</h3><div id="gstat" style="font-size:12px;color:var(--muted)"></div><div id="scen"></div><div id="clus"></div></div>
    <div class="blk" id="bCal" hidden><h3>Map calibration: clean-build noise → tolerance</h3><table id="caltab"></table><div id="calrej"></div></div>
    <div class="blk" id="bSab" hidden><h3>Saboteur</h3><div id="sab" style="font-size:12.5px"></div></div>
  </section>
  <section id="term"><h2>Log · <span class="src-learn">learn</span> · <span class="src-saboteur">saboteur</span> · <span class="src-qa">qa</span> · <span class="src-auto">engine</span> · <span class="src-map">map</span></h2><div id="log"></div></section>
</div>
<div id="how">
  <div class="box" style="margin-bottom:12px"><h2>The whole logic in one picture</h2>
<pre>
                ┌──────────────────────── PRODUCT UNDER TEST ─────────────────────────┐
                │  Simulator ──► Backend :4000 ──(socket.io messages)──► Cockpit :4010 │
                └──────▲──────────────────────▲───────────────────────────▲──────────┘
         plants bug    │        reads truth   │        taps every message  │ reads screen (DOM)
                       │                      │                           │
  ┌────────────┐   ┌───┴────────────────────────────────────────────────────┴─────────────┐
  │ SABOTEUR   │   │                             QA SIDE (never told the bug)             │
  │ secret pick│   │  LEARN ─► model.json (bindings, usable elements, echoes)             │
  │ or NONE    │   │    │                                                                  │
  │ sha256 ────┼──►│    ├─► BLIND INSPECTOR: 11 curated checks                            │
  │ commitment │   │    │       └─ C10 ledger: screen == format(last message) EXACT         │
  └─────┬──────┘   │    └─► ENGINE: 360 combos → 30 pairwise scenarios → 7 invariants     │
        │ sealed   │             └─ cluster by rule+element+layer → simplest reproducer   │
        ▼ answer   └───────────────────────────────────┬──────────────────────────────────┘
  ┌──────────────────────────────────────────────────── ▼ ───────────────────────────────┐
  │ HUB: opens the sealed answer only after QA reports · verifies sha256 · scores result  │
  └───────────────────────────────────────────────────────────────────────────────────────┘
</pre></div>
  <div class="grid">
    <div class="box"><h3>1 · Learn: how the model is built</h3><p>The learner never reads source code. It flies a probe drone and, 24 times, records what the screen shows next to the last messages the browser received. For every on-screen value it tries every received field: does <code>field.toFixed(d)</code> reproduce the text exactly? A field that matches in at least 80 % of samples becomes a binding, e.g. <code>telemetry-battery = battery.percent as "{0 dp} %"</code>. It also records which elements are usable at desktop, tablet and phone size, and which elements must name the selected drone.</p><p>Any measured value that matches nothing is reported as <b>unexplained</b>, so a broken build is flagged instead of learned.</p></div>
    <div class="box"><h3>2 · Three sources of truth</h3><ul>
      <li><b>Learned</b> (needs a trusted build): bindings, usable elements, echoes. Catches regressions.</li>
      <li><b>External</b> (no baseline): device list = <code>/api/devices</code>, telemetry = simulator, badge = our own independent connection, names never execute. Catches day-one bugs (F2, F3).</li>
      <li><b>Consistency</b> (no baseline): list status = panel status, A→B→A shows only the selected drone, recovery after faults, no stale data shown as live (F1).</li></ul></div>
    <div class="box"><h3>3 · The wire-to-pixel ledger</h3><p>Every socket message the cockpit receives is tapped from its own websocket. A screen value passes only if it equals, character for character, the learned format applied to one of the last three messages received. No tolerance is needed, because the oracle knows exactly what the UI knew.</p><p>When a value is wrong, wire vs backend says <b>where</b>: <code>backend→wire</code> (the UI was sent wrong or old data) or <code>wire→screen</code> (the UI showed good data wrongly).</p></div>
    <div class="box"><h3>4 · Blind trial: why it can't cheat</h3><ul>
      <li>Saboteur and QA are separate OS processes; QA never reads the bug list or the answer.</li>
      <li>Hidden markers are stripped from the planted code.</li>
      <li>The saboteur publishes <code>sha256(choice:salt)</code> before QA starts; the hub verifies it at the reveal.</li>
      <li>"None" is a possible pick, which tests for false alarms.</li></ul></div>
    <div class="box"><h3>5 · Scenario generation</h3><p>Space = viewport (desktop, tablet, phone) × drone state (grounded, climbing, cruising, landing) × condition (normal, delay, drop, refused, simulator offline, video frozen) × action (observe, A→B→A, reload, fleet change, sweep all) = 360. A greedy all-pairs planner picks 30 scenarios so every pair of values meets at least once.</p><p>Each scenario: own drone → fault → action → judge → clear fault → recovery.</p></div>
    <div class="box"><h3>6 · Generic invariants and clustering</h3><p><b>BIND</b> exact wire match · <b>FLEET</b> list = backend · <b>USE</b> still usable · <b>FIT</b> no sideways scroll · <b>ECHO</b> names the selected drone · <b>HONEST</b> badge during outages · <b>RECOVER</b> after faults.</p><p>Violations are grouped by rule + element + layer, so twelve symptoms of one bug become one problem, reported with its simplest failing scenario. Conditions true of the product itself (stale data during an outage) are listed as findings, not regressions.</p></div>
    <div class="box"><h3>7 · What each stage proves</h3><ul>
      <li><b>Learn:</b> the model can be built with zero hand-written expectations.</li>
      <li><b>Blind trial:</b> curated checks find an unknown bug; a control run raises no alarm.</li>
      <li><b>Generate:</b> self-written scenarios find an unknown bug and collapse it to one root cause.</li>
      <li><b>Relearn:</b> the model learned on the broken build is diffed against the clean model: lost usable elements, lost display rules and new unexplained values reveal the change, even with no scenario at all.</li></ul></div>
    <div class="box" style="grid-column:1/-1"><h3>9 · Map lab (Level 2 niche: maps and geospatial)</h3>
<pre>
 Cesium map (WebGL: nothing to read in the DOM)
      │  React fiber on the map container → viewer ref → live scene graph
      ▼
 ANATOMY  per device: drone model (position, heading, selected/unselected look, label "name status")
          dock billboard (online/offline icon, label) · track polyline · dotted height line · height label
          camera (position, pitch) · screen projection of every object · drillPick: what is drawn at a pixel
      │
      ├── compared with the WIRE (messages the browser received): position, height, yaw, status, home distance
      ├── compared with the LEARNED MAP MODEL (known-good build): selected/unselected looks, dock icons, 2D/3D pitch
      └── exercised like an operator: select in list, pan, click on the map, 2D/3D, add/delete, simulator offline
</pre>
      <p><b>13 map checks:</b> G1 every device on the map · G2 drawn where it really is (≤1 m) · G3 height label and 3D height · G4 model heading = yaw (≤2°) · G5 label shows current status · G6 map distance = panel "Dist. from home" · G7 track follows and grows · G8 visible at its pixel and clickable · G9 camera flies to the drone · G10 only the selected drone highlighted · G11 2D top-down / 3D oblique · G12 deleted drones vanish (no ghosts) · G13 stale docks look offline.</p>
      <p><b>Calibration on the clean build:</b> position error 0 m, height 30 = 30, heading 46° = 46°, track ends 0 m from the drone, map distance 100 m = panel 100 m.</p>
      <p><b>Real finding on the unmodified app (G13):</b> the map only redraws when a message arrives, so when data stops, docks keep their online icon indefinitely even though the app defines a 5-second stale rule and has offline icons.</p></div>
    <div class="box"><h3>8 · Limits</h3><ul>
      <li>Learned rules are only as good as the build they came from; external and consistency truth cover the rest.</li>
      <li>Generated scenarios cover the cockpit; control-panel buttons, video label semantics and script injection are covered by the curated checks.</li>
      <li>Values derived from another entity (wind from the dock) stay unexplained until reviewed.</li></ul></div>
  </div>
</div>
<div id="reveal"><div class="in"><div class="k" style="font:600 12px 'IBM Plex Mono';letter-spacing:.12em;color:var(--muted)" id="rvK">REVEAL</div><h2 id="rvH"></h2>
  <div class="two"><div class="card"><div class="k">Planted (sealed answer)</div><div id="rvA" style="font:700 19px 'Barlow Condensed'"></div><div id="rvV" style="font-size:12.5px;color:var(--muted)"></div></div><div class="card"><div class="k">QA reported</div><div id="rvQ"></div></div></div>
  <div class="card" id="rvX" hidden><div class="k">Stage 4 · model drift (relearned on the broken build vs clean model)</div><div id="rvL"></div></div>
  <button id="rvC">Close</button></div></div>
<script>
const $=s=>document.querySelector(s);const logEl=$('#log');let img=null;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const kv=o=>Object.entries(o||{}).map(([k,v])=>'<div class="kv"><span>'+esc(k)+'</span><span>'+esc(v)+'</span></div>').join('')||'<div class="kv"><span>—</span></div>';
function line(src,t,c){const d=document.createElement('div');d.innerHTML='<span class="src-'+src+'">['+src+']</span> <span class="'+c+'">'+esc(t)+'</span>';logEl.appendChild(d);if(logEl.children.length>1500)logEl.firstChild.remove();logEl.scrollTop=logEl.scrollHeight}
function busy(b){document.querySelectorAll('header button[data-run],header select').forEach(x=>x.disabled=b)}
const show=(id,on=true)=>{$(id).hidden=!on};
function reset(){logEl.innerHTML='';['#ltab','#lunx','#checks','#scen','#clus','#sab','#cmpS','#cmpR','#gstat','#lsample'].forEach(x=>$(x).innerHTML='');$('#lbar').style.width='0';['#bLearn','#bQa','#bPipe','#bCmp','#bGen','#bSab'].forEach(x=>show(x,false));document.querySelectorAll('.st').forEach(s=>{s.className='st';s.querySelector('.s').textContent='waiting'});$('#view').innerHTML='<div class="empty">Starting…</div>';img=null;$('#reveal').style.display='none';$('#lgF').textContent='0';$('#lgE').textContent='0/0'}
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===t));$('#live').style.display=t.dataset.t==='live'?'grid':'none';$('#how').style.display=t.dataset.t==='how'?'block':'none';$('#stages').style.display=t.dataset.t==='live'?'grid':'none'});
const es=new EventSource('/events');
es.onmessage=m=>{const e=JSON.parse(m.data);const src=e.from||'hub';
 switch(e.event){
  case 'reset':reset();busy(true);break;case 'busy':busy(true);break;case 'idle':busy(false);break;
  case 'stage':{const s=document.querySelector('.st[data-n="'+e.n+'"]');s.className='st '+e.status;s.querySelector('.s').textContent=e.status;if(e.summary)s.querySelector('.sum').textContent=e.summary;
    if(e.status==='running'){if(e.n===1||e.n===4){show('#bLearn');$('#ltab').innerHTML='';$('#lunx').innerHTML='';$('#lbar').style.width='0'}if(e.n===2){show('#bQa');show('#bPipe');show('#bCmp');show('#bSab')}if(e.n===6){show('#bCal');$('#caltab').innerHTML='';$('#calrej').innerHTML='';show('#bSab');show('#bQa',false);show('#bCmp',false);show('#bLearn',false);show('#bGen',false);show('#bPipe',false)}if(e.n===5){show('#bQa');show('#bCmp');show('#bSab');show('#bCal',false);show('#bPipe',false);show('#bGen',false);show('#bLearn',false)}if(e.n===3){show('#bGen');show('#bPipe');show('#bSab');show('#bQa',false);show('#bCmp',false)}$('#who').textContent='· stage '+e.n}break}
  case 'frame':if(!img){$('#view').innerHTML='';img=new Image();img.alt='Live browser';$('#view').appendChild(img)}img.src='data:image/jpeg;base64,'+e.data;break;
  case 'log':line(src,e.text,'l-'+(e.level||'info'));break;case 'cmd':line(src,'$ '+e.text,'l-cmd');break;case 'error':line(src,'ERROR '+e.text,'l-bad');break;
  case 'sample':$('#lbar').style.width=(e.i/e.of*100)+'%';$('#lsample').textContent='sample '+e.i+'/'+e.of+' · e.g. battery "'+(e.texts['[data-testid="telemetry-battery"]']||'')+'", altitude "'+(e.texts['[data-testid="telemetry-alt-agl"]']||'')+'"';break;
  case 'bindings':$('#ltab').innerHTML=e.bindings.map(b=>'<tr><td>'+esc(b.label)+'</td><td class="m">'+esc(b.attr+'.'+b.path)+'</td><td>'+esc(b.template.replace('{v}',b.digits===null?'‹text›':'‹'+b.digits+'dp›'))+'</td><td>'+Math.round(b.confidence*100)+'%</td></tr>').join('');
    $('#lunx').innerHTML=(e.unexplained||[]).map(u=>'<div class="warnrow">⚠ unexplained '+esc(u.selector)+': '+esc(u.texts.slice(0,3).join(', '))+'</div>').join('')||'<div style="color:var(--ok);font-size:12px">no unexplained measured values</div>';break;
  case 'status':case 'planted':case 'reverted':$('#sab').innerHTML=esc(e.text)+(e.commitment?'<div style="font:11.5px IBM Plex Mono;color:var(--muted);word-break:break-all;margin-top:4px">sha256 '+esc(e.commitment)+'</div>':'');line(src,e.text,e.event==='reverted'?'l-ok':'l-info');break;
  case 'plan':if(e.checks)$('#checks').innerHTML=e.checks.map(c=>'<div class="chk" data-id="'+c.id+'"><div class="id">'+c.id+'</div><div><div>'+esc(c.title)+'</div><div class="m"></div></div></div>').join('');
    if(e.scenarios){$('#scen').innerHTML=e.scenarios.map(s=>'<div class="sc" data-id="'+s.id+'"><div class="id">'+s.id+'</div><div>'+esc(s.title)+'</div><div class="r">·</div></div>').join('')}break;
  case 'check':{const el=document.querySelector('.chk[data-id="'+e.id+'"]');if(el){el.className='chk '+e.status;el.querySelector('.m').textContent=e.status==='running'?'running…':e.message}break}
  case 'compare':$('#cmpT').textContent=e.title;$('#cmpS').innerHTML=kv(e.screen);$('#cmpR').innerHTML=kv(e.truth);$('#cmpN').textContent=e.note;$('#cmpN').className='note'+(e.ok===true?' ok':e.ok===false?' bad':'');break;
  case 'ledger':{if(e.frames!==undefined)$('#lgF').textContent=e.frames.toLocaleString();$('#lgE').textContent=e.exact+'/'+e.assertions;const L=e.byLayer||{};const fe=L['wire→screen (frontend rendering)']||0,tr=L['backend→wire (transport/backend)']||0;$('#a1').className='arrow'+(tr?' bad':'');$('#a1').textContent=tr?'✖'+tr:'→';$('#a2').className='arrow'+(fe||(e.exact<e.assertions&&!e.byLayer)?' bad':'');$('#a2').textContent=fe?'✖'+fe:(e.exact<e.assertions&&!e.byLayer?'✖'+(e.assertions-e.exact):'→');break}
  case 'scenario':{const el=document.querySelector('.sc[data-id="'+e.id+'"]');if(el){el.className='sc '+e.status;el.querySelector('.r').textContent=e.status==='running'?'…':e.status==='pass'?'✔':'✖ '+(e.violations||[]).map(v=>v.inv).join(',');if(e.status==='running')el.scrollIntoView({block:'nearest'})}break}
  case 'report':$('#gstat').textContent=e.passed+'/'+e.total+' passed · '+e.exact+'/'+e.assertions+' exact';$('#clus').innerHTML=(e.clusters.length?e.clusters.map((c,i)=>'<div class="warnrow" style="color:var(--bad)">P'+(i+1)+' '+esc(c.inv+' · '+c.field)+' ×'+c.count+'<br><span style="color:var(--muted)">'+esc(c.layer)+' · '+esc(c.example)+'</span></div>').join(''):'<div style="color:var(--ok);font-size:12px">no problems</div>')+(e.findings||[]).map(f=>'<div class="warnrow">finding '+esc(f.kind)+' ×'+f.count+': '+esc(f.detail)+'</div>').join('');break;
  case 'stat':{show('#bCal');$('#caltab').insertAdjacentHTML('beforeend','<tr><td>'+esc(e.key)+'</td><td class="m">p50 '+e.p50+e.unit+'</td><td class="m">p99 '+e.p99+e.unit+'</td><td>'+(e.key==='cadence'||e.key==='speed'?'context':'tol '+e.tol+e.unit)+'</td></tr>')}break;
  case 'rejected':$('#calrej').innerHTML=e.reasons.map(r=>'<div class="warnrow" style="color:var(--bad)">✖ '+esc(r)+'</div>').join('')+'<div class="note bad">Learner refused to save this build as "normal".</div>';break;
  case 'learned':$('#calrej').innerHTML='<div class="note ok">Calibration within physical sanity: model saved.</div>';break;
  case 'verdict':line(src,e.failures.length?('verdict: '+e.failures.length+' problem(s)'):'verdict: no problems','l-warn');break;
  case 'reveal':{$('#rvK').textContent='REVEAL · stage '+e.stage;$('#rvH').textContent=e.outcome;$('#rvH').style.color=/CAUGHT|CORRECT|DETECTED by/.test(e.outcome)?'var(--ok)':'var(--bad)';
    $('#rvA').textContent=e.answer.id==='none'?'No bug (control)':e.answer.id+': '+e.answer.description;$('#rvV').textContent=e.verified?'sha256 fingerprint verified ✔':'fingerprint mismatch ✖';
    const items=e.failures?e.failures.map(f=>'<div style="margin:5px 0"><b>'+esc(f.id+' · '+f.title)+'</b><div style="color:var(--bad);font-size:12.5px">'+esc(f.message)+'</div>'+(f.layer?'<div style="font-size:12px;color:var(--muted)">located at '+esc(f.layer)+'</div>':'')+'</div>'):(e.clusters||[]).map(c=>'<div style="margin:5px 0"><b>'+esc(c.inv+' · '+c.field)+'</b> ×'+c.count+'<div style="color:var(--bad);font-size:12.5px">'+esc(c.example)+'</div><div style="font-size:12px;color:var(--muted)">located at '+esc(c.layer)+'</div></div>');
    $('#rvQ').innerHTML=(items.length?items.join(''):'<div style="color:var(--ok);font-weight:600">No problems found</div>')+((e.findings||[]).map(f=>'<div style="margin-top:6px;color:var(--warn);font-size:12.5px">Known product finding '+esc(f.id)+': '+esc(f.message)+'</div>').join(''));
    if(e.stage===3){$('#rvX').hidden=false;$('#rvL').innerHTML=((e.drift||[]).length?(e.drift.map(d=>'<div class="warnrow" style="color:var(--bad)">✖ '+esc(d)+'</div>').join('')):'<div style="color:var(--muted);font-size:12px">no drift from the clean model</div>')+'<div style="font-size:12px;color:var(--muted);margin-top:4px">'+e.bindings+' bindings learned on the broken build (clean: 10). Drift = what the clean model had that this build lost.</div>'}else $('#rvX').hidden=true;
    $('#reveal').style.display='grid';break}
 }};
document.querySelectorAll('[data-run]').forEach(b=>b.onclick=async()=>{busy(true);const r=await fetch('/run?what='+b.dataset.run+'&choice='+$('#choice').value+'&limit='+$('#limit').value,{method:'POST'});if(r.status===409)line('hub','already running','l-warn')});
$('#rvC').onclick=()=>$('#reveal').style.display='none';
</script></body></html>`;
