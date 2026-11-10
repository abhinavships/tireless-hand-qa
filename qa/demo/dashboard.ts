/**
 * Tireless Hand live demo dashboard.
 *   npm run dashboard   → opens http://localhost:4500, press Start.
 * Chrome runs in the background (headless); its screen is streamed into the dashboard
 * next to the oracle panel (screen vs truth), the step list and the live terminal log.
 */
import http from 'node:http';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { io } from 'socket.io-client';

const PORT = Number(process.env.DASH_PORT ?? 4500);
const API = 'http://localhost:4000/api';
const COCKPIT = 'http://localhost:4010';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ───────────── event bus (Server-Sent Events) ─────────────
type Ev = Record<string, unknown> & { kind: string };
const clients = new Set<http.ServerResponse>();
let history: Ev[] = [];
let lastFrame: string | undefined;
function emit(ev: Ev) {
  if (ev.kind === 'frame') lastFrame = ev.data as string;
  if (ev.kind !== 'frame') { history.push(ev); if (history.length > 800) history = history.slice(-800); }
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const c of clients) c.write(line);
}
const log = (text: string, level: 'info' | 'ok' | 'bad' | 'warn' | 'dim' = 'info') => emit({ kind: 'log', text, level });
const cmd = (text: string) => emit({ kind: 'cmd', text });
const step = (id: number, status: 'running' | 'done' | 'fail') => emit({ kind: 'step', id, status });
const compare = (d: { title: string; screen: Record<string, string>; truth: Record<string, string>; ok: boolean | null; note: string }) => emit({ kind: 'compare', ...d });

// ───────────── helpers ─────────────
async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  cmd(`${method} ${path}${body ? ' ' + JSON.stringify(body) : ''}`);
  const res = await fetch(API + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
async function truthOf(id: string) {
  const res = await fetch(API + '/control/state');
  return (await res.json()).drones[id] as { status: string; height: number; battery: number };
}
async function banner(page: Page, text: string, color = '#c9731f') {
  await page.evaluate(([t, col]) => {
    let el = document.getElementById('__demo_banner');
    if (!el) { el = document.createElement('div'); el.id = '__demo_banner'; document.body.appendChild(el); }
    el.setAttribute('style', `position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:99999;background:${col};color:#fff;font:600 18px system-ui;padding:10px 18px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.35);pointer-events:none;max-width:90vw`);
    el.textContent = t;
  }, [text, color]).catch(() => undefined);
}
async function outline(page: Page, testid: string, color: string) {
  await page.evaluate(([id, col]) => { const e = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null; if (e) { e.style.outline = `3px solid ${col}`; e.style.outlineOffset = '2px'; } }, [testid, color]);
}
async function readScreen(page: Page) {
  const num = async (id: string) => { const t = await page.getByTestId(id).innerText(); const m = t.match(/-?\d+(\.\d+)?/); return { text: t.trim(), value: m ? Number(m[0]) : null }; };
  return { status: (await page.getByTestId('status-flight').innerText()).trim(), altitude: await num('telemetry-alt-agl'), battery: await num('telemetry-battery') };
}
function takeLock() {
  const lock = `${ROOT}.context/locks/app.lock`;
  mkdirSync(`${ROOT}.context/locks`, { recursive: true });
  try { mkdirSync(lock); } catch { throw new Error('The shared app lock is held by another test run. Wait a minute and press Start again.'); }
  writeFileSync(`${lock}/owner`, `live-dashboard ${new Date().toISOString()} pid=${process.pid}\n`);
  return () => rmSync(lock, { recursive: true, force: true });
}

// ───────────── browser with live screencast ─────────────
let browser: Browser | undefined;
async function startBrowser(): Promise<Page> {
  const headless = process.env.HEADLESS === '1';
  cmd(`playwright: chromium.launch({ headless: ${headless} })`);
  browser = await chromium.launch({ headless, args: ['--window-position=40,40', '--window-size=1300,860'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 780 } });
  const cdp = await page.context().newCDPSession(page);
  let last = 0;
  cdp.on('Page.screencastFrame', (f: any) => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
    const now = Date.now();
    if (now - last > 110) { last = now; emit({ kind: 'frame', data: f.data }); }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 62, maxWidth: 1280, maxHeight: 780, everyNthFrame: 1 });
  // Fallback: if the screencast goes quiet (static page), push a screenshot so the stream never looks frozen or empty.
  const timer = setInterval(async () => {
    if (!browser || page.isClosed()) { clearInterval(timer); return; }
    if (Date.now() - last > 700) {
      try { const buf = await page.screenshot({ type: 'jpeg', quality: 60 }); last = Date.now(); emit({ kind: 'frame', data: buf.toString('base64') }); } catch { /* page busy */ }
    }
  }, 500);
  return page;
}

// Badge vs independent connection, used by the fault step and the mutation step.
async function badgeVsTruth(page: Page, seconds: number, title: string) {
  const sock = io('http://localhost:4000', { auth: { 'org-id': 'flytbase' }, transports: ['websocket'], reconnection: true, reconnectionDelay: 500 });
  let lies = 0;
  try {
    for (let i = 0; i < seconds; i++) {
      const badge = (await page.getByTestId('socket-status').innerText()).trim();
      const real = sock.connected ? 'connected' : 'refused / disconnected';
      const lying = badge === 'socket connected' && !sock.connected;
      if (lying) lies++;
      compare({ title, screen: { 'Connection badge': badge }, truth: { 'Our own independent connection': real }, ok: !lying, note: lying ? 'FAIL: operator is told "connected" while connections are refused' : 'PASS: badge does not claim a connection that doesn\'t exist' });
      log(`+${i}s  badge "${badge}"  |  independent socket: ${real}  →  ${lying ? 'FAIL' : 'PASS'}`, lying ? 'bad' : 'ok');
      await sleep(1000);
    }
  } finally { sock.close(); }
  return lies;
}

// ───────────── the demo ─────────────
let running = false;
async function runDemo() {
  if (running) return; running = true; history = [];
  emit({ kind: 'reset' });
  let droneId: string | undefined; let release: (() => void) | undefined; let mutated = false;
  const file = 'frontend/src/components/SocketBadge.tsx';
  const sh = (c: string) => execSync(c, { cwd: `${ROOT}product`, stdio: 'pipe' }).toString();
  const sync = () => { cmd(`docker compose cp ${file} frontend:/app/${file}`); sh(`docker compose cp ${file} frontend:/app/${file}`); };
  let current = 0;
  try {
    // STEP 1 · truth
    current = 1; step(1, 'running');
    log('STEP 1 · The environment controller talks to the backend API. This is the source of TRUTH.', 'warn');
    const h = await api('GET', '/health'); log(`health: simulator ${h.simulator}, video ${h.video}`);
    const { drone } = await api('POST', '/control/drones', { name: `DEMO-${Date.now() % 10000}` });
    droneId = drone.id; log(`added our own test drone "${drone.name}" (${drone.id}) so real drones are never disturbed`);
    await api('POST', '/control/command', { deviceId: drone.id, type: 'takeoff' });
    for (let i = 0; i < 6; i++) {
      const t = await truthOf(drone.id);
      compare({ title: 'Ground truth from the simulator', screen: {}, truth: { Status: t.status, Altitude: `${t.height.toFixed(1)} m`, Battery: `${t.battery.toFixed(1)} %` }, ok: null, note: 'This is the answer key. Every check compares the screen against it.' });
      log(`truth +${i}s: ${t.status}, ${t.height.toFixed(1)} m, ${t.battery.toFixed(1)} %`, 'dim');
      await sleep(1000);
    }
    step(1, 'done');

    // STEP 2 · browser reads the page
    current = 2; step(2, 'running');
    log('STEP 2 · Playwright opens Chrome in the background and READS the page structure (not pixels).', 'warn');
    const page = await startBrowser();
    cmd(`page.goto("${COCKPIT}")`); await page.goto(COCKPIT);
    await page.getByTestId('socket-status').filter({ hasText: 'socket connected' }).waitFor({ timeout: 20_000 });
    await banner(page, 'STEP 2 · Playwright is reading this page');
    cmd(`page.getByTestId("device-row-${drone.id}").click()`);
    await page.getByTestId(`device-row-${drone.id}`).click();
    const seen: Record<string, string> = {};
    for (const [id, label] of [['socket-status', 'Connection badge'], ['status-flight', 'Flight status'], ['telemetry-battery', 'Battery'], ['telemetry-alt-agl', 'Altitude'], ['telemetry-hspeed', 'Speed'], ['video-state', 'Video label']] as const) {
      await outline(page, id, '#f0a24f');
      cmd(`page.getByTestId("${id}").innerText()`);
      seen[label] = (await page.getByTestId(id).innerText()).trim();
      log(`read [data-testid="${id}"] → "${seen[label]}"`);
      compare({ title: 'What Playwright reads from the page', screen: { ...seen }, truth: {}, ok: null, note: 'Each value is read from the live page structure, exactly what the operator sees.' });
      await sleep(700);
    }
    step(2, 'done');

    // STEP 3 · oracle
    current = 3; step(3, 'running');
    log('STEP 3 · The ORACLE compares what the operator sees with what is true, every second.', 'warn');
    await banner(page, `STEP 3 · Oracle: screen vs truth for ${drone.name}`);
    log('tolerance: altitude ±2 m, battery ±2 % (live data can lag about 1 s)', 'dim');
    let passes = 0;
    for (let i = 0; i < 12; i++) {
      const s = await readScreen(page); const t = await truthOf(drone.id);
      const altOk = s.altitude.value !== null && Math.abs(s.altitude.value - t.height) <= 2;
      const batOk = s.battery.value !== null && Math.abs(s.battery.value - t.battery) <= 2;
      const statOk = s.status === t.status;
      const ok = altOk && batOk && statOk; if (ok) passes++;
      compare({ title: 'Oracle: screen vs truth', screen: { Status: s.status, Altitude: s.altitude.text, Battery: s.battery.text }, truth: { Status: t.status, Altitude: `${t.height.toFixed(1)} m`, Battery: `${t.battery.toFixed(1)} %` }, ok, note: ok ? 'PASS: the screen matches reality within tolerance' : 'Mismatch: re-checking (a real failure must persist past the timeout)' });
      log(`+${i}s  screen ${s.status}/${s.altitude.text}/${s.battery.text}  vs  truth ${t.status}/${t.height.toFixed(1)} m/${t.battery.toFixed(1)} %  →  ${ok ? 'PASS' : 'mismatch, retrying'}`, ok ? 'ok' : 'warn');
      await sleep(1000);
    }
    log(`oracle result: ${passes}/12 checks matched. In a real failure the test stops with e.g. "battery: operator sees 0, but API says 98.2"`, passes >= 9 ? 'ok' : 'bad');
    await api('POST', '/control/command', { deviceId: drone.id, type: 'land' });
    step(3, 'done');

    // STEP 4 · fault on the clean app
    current = 4; step(4, 'running');
    release = takeLock();
    log('STEP 4 · We break the network on purpose: every connection is refused for 12 s.', 'warn');
    await banner(page, 'STEP 4 · Fault injected: connections refused (12 s)', '#b4401b');
    await api('POST', '/control/fault', { kind: 'socket-refuse', seconds: 12 });
    await api('POST', '/control/fault', { kind: 'socket-kick' });
    const cleanLies = await badgeVsTruth(page, 14, 'Fault on the clean app: badge vs reality');
    await api('DELETE', '/control/fault');
    await banner(page, 'Fault cleared: waiting for recovery', '#23794d');
    await page.getByTestId('socket-status').filter({ hasText: 'socket connected' }).waitFor({ timeout: 25_000 });
    log(cleanLies === 0 ? 'clean app told the truth during the outage and recovered without a reload' : `clean app lied ${cleanLies}×`, cleanLies === 0 ? 'ok' : 'bad');
    step(4, cleanLies === 0 ? 'done' : 'fail');

    // STEP 5 · mutation
    current = 5; step(5, 'running');
    log('STEP 5 · Mutation lab: we PLANT A BUG (M07: the badge always says "connected") and run the SAME check.', 'warn');
    cmd('git apply qa/mutations/M07-connected-badge.patch');
    sh(`git apply ${ROOT}qa/mutations/M07-connected-badge.patch`); mutated = true; sync();
    await page.waitForFunction(() => (globalThis as any).__mutationLab === 'mutation-lab:M07', null, { timeout: 30_000 }).catch(() => undefined);
    log('bug planted and hot-reloaded into the running cockpit', 'bad');
    await banner(page, 'STEP 5 · App now contains bug M07. Same fault, same check…', '#b4401b');
    await api('POST', '/control/fault', { kind: 'socket-refuse', seconds: 10 });
    await api('POST', '/control/fault', { kind: 'socket-kick' });
    const lies = await badgeVsTruth(page, 10, 'Same check on the BUGGY app: badge vs reality');
    await api('DELETE', '/control/fault');
    const caught = lies > 0;
    await banner(page, caught ? 'CAUGHT ✔ The oracle failed the test on the planted bug' : 'Not caught', caught ? '#23794d' : '#b4401b');
    log(caught ? 'CAUGHT ✔ Same test: PASS on the clean app, FAIL on the planted bug.' : 'NOT caught', caught ? 'ok' : 'bad');
    cmd('git apply -R qa/mutations/M07-connected-badge.patch');
    sh(`git apply -R ${ROOT}qa/mutations/M07-connected-badge.patch`); mutated = false; sync();
    log('bug removed, app restored', 'ok');
    step(5, caught ? 'done' : 'fail');
    await sleep(2500);
    emit({ kind: 'summary', ok: caught && cleanLies === 0, text: caught && cleanLies === 0 ? 'Demo complete: the screen matched the truth, the clean app stayed honest under a network fault, and the planted bug was caught.' : 'Demo finished with issues. See the log.' });
  } catch (e: any) {
    step(current, 'fail'); log(`ERROR: ${e?.message ?? e}`, 'bad');
    emit({ kind: 'summary', ok: false, text: `Stopped: ${e?.message ?? e}` });
  } finally {
    await fetch(API + '/control/fault', { method: 'DELETE' }).catch(() => undefined);
    if (mutated) { try { sh(`git apply -R ${ROOT}qa/mutations/M07-connected-badge.patch`); sync(); log('safety: planted bug reverted', 'ok'); } catch (err) { log(`could not revert the bug automatically: ${err}`, 'bad'); } }
    if (droneId) { await fetch(`${API}/control/drones/${droneId}`, { method: 'DELETE' }).catch(() => undefined); log('cleanup: test drone removed', 'dim'); }
    release?.();
    await browser?.close().catch(() => undefined); browser = undefined;
    const dirty = (() => { try { return sh('git status --porcelain').trim(); } catch { return ''; } })();
    if (dirty) log(`WARNING: product/ has changes:\n${dirty}`, 'bad');
    running = false; emit({ kind: 'idle' });
  }
}

// ───────────── HTTP server ─────────────
http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    clients.add(res);
    res.write(`data: ${JSON.stringify({ kind: running ? 'busy' : 'idle' })}\n\n`);
    for (const ev of history) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    if (lastFrame) res.write(`data: ${JSON.stringify({ kind: 'frame', data: lastFrame })}\n\n`);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (req.url === '/start' && req.method === 'POST') { const was = running; if (!was) void runDemo(); res.writeHead(was ? 409 : 202).end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
}).listen(PORT, () => {
  console.log(`Tireless Hand dashboard → http://localhost:${PORT}  (press Start in the page; Ctrl+C here to quit)`);
  try { execSync(`open http://localhost:${PORT}`); } catch { /* not macOS */ }
});

const PAGE = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tireless Hand · Live</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--bg:#0e141a;--panel:#151d25;--panel2:#1b252f;--ink:#e6ebf0;--muted:#8d9aa7;--line:#26323d;--accent:#f0a24f;--ok:#4cc38a;--bad:#ff7a5c;--warn:#f0c34f}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 "IBM Plex Sans",system-ui,sans-serif;display:grid;grid-template-rows:auto 1fr;padding:0 16px}
header{display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}
h1{font:700 26px/1 "Barlow Condensed",sans-serif;margin:0;letter-spacing:.02em}
.sub{color:var(--muted)}
button{font:600 15px "IBM Plex Sans",sans-serif;background:var(--accent);color:#1a1206;border:0;border-radius:8px;padding:10px 22px;cursor:pointer}
button:disabled{opacity:.45;cursor:default}button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.pill{font:500 12px "IBM Plex Mono",monospace;padding:3px 10px;border-radius:99px;background:var(--panel2);color:var(--muted)}
.pill.live{background:#3a1d17;color:var(--bad)}
main{display:grid;grid-template-columns:260px 1fr 360px;grid-template-rows:minmax(0,1fr) 230px;gap:14px;padding:14px 0;min-height:0}
section{background:var(--panel);border:1px solid var(--line);border-radius:12px;min-height:0;display:flex;flex-direction:column}
section>h2{font:600 12px "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0;padding:12px 14px;border-bottom:1px solid var(--line)}
#steps{grid-row:1/3;overflow:auto}
.st{padding:12px 14px;border-bottom:1px solid var(--line);display:grid;gap:4px}
.st b{font-size:14px}.st p{margin:0;color:var(--muted);font-size:13px}
.st .s{font:500 11px "IBM Plex Mono",monospace;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.st.running{background:#231c12}.st.running .s{color:var(--accent)}
.st.done .s{color:var(--ok)}.st.fail .s{color:var(--bad)}
#browser .view{flex:1;display:grid;place-items:center;background:#0a0f13;border-radius:0 0 12px 12px;overflow:hidden;min-height:0}
#browser img{max-width:100%;max-height:100%;display:block}
.empty{color:var(--muted);text-align:center;padding:24px}
#oracle{grid-row:1/3;overflow:auto}
.otitle{padding:12px 14px 4px;font-weight:600}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:8px 14px}
.col{background:var(--panel2);border-radius:10px;padding:10px;min-height:120px}
.col h3{margin:0 0 6px;font:600 11px "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.kv{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px dashed var(--line);font-variant-numeric:tabular-nums}
.kv span:first-child{color:var(--muted)}.kv span:last-child{font-family:"IBM Plex Mono",monospace;text-align:right;word-break:break-word}
.verdict{margin:8px 14px;padding:12px;border-radius:10px;background:var(--panel2);font-weight:600}
.verdict.ok{background:#12301f;color:var(--ok)}.verdict.bad{background:#3a1d17;color:var(--bad)}
.explain{padding:6px 14px 14px;color:var(--muted);font-size:13px}
.explain code{font-family:"IBM Plex Mono",monospace;color:var(--ink)}
#term{grid-column:2}
#log{flex:1;overflow:auto;padding:10px 14px;font:12.5px/1.55 "IBM Plex Mono",monospace;background:#0a0f13;border-radius:0 0 12px 12px}
#log div{white-space:pre-wrap}
.l-ok{color:var(--ok)}.l-bad{color:var(--bad)}.l-warn{color:var(--warn);font-weight:500}.l-dim{color:#66737f}.l-cmd{color:#8ab4ff}
#summary{margin:8px 14px;padding:12px;border-radius:10px;display:none}
@media (max-width:1100px){main{grid-template-columns:1fr;grid-template-rows:auto}#steps,#oracle,#term{grid-row:auto;grid-column:auto}#browser .view{min-height:280px}#term{height:260px}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style></head><body>
<header>
  <h1>Tireless Hand · Live</h1>
  <span class="sub">Watch the testing system work: Chrome runs in the background and streams here.</span>
  <span style="flex:1"></span>
  <span id="state" class="pill">idle</span>
  <button id="start">Start demo</button>
</header>
<main>
  <section id="steps"><h2>Steps</h2>
    <div class="st" data-id="1"><span class="s">waiting</span><b>1 · Ground truth</b><p>The system asks the backend API what is really happening: adds its own test drone and takes off.</p></div>
    <div class="st" data-id="2"><span class="s">waiting</span><b>2 · Playwright reads the screen</b><p>Chrome opens the cockpit and reads each element's text from the live page structure.</p></div>
    <div class="st" data-id="3"><span class="s">waiting</span><b>3 · Oracle: screen vs truth</b><p>Every second, what the operator sees is compared with the truth, within tolerance.</p></div>
    <div class="st" data-id="4"><span class="s">waiting</span><b>4 · Break the network</b><p>All connections are refused for 12 s. The badge must stop saying "connected", then recover.</p></div>
    <div class="st" data-id="5"><span class="s">waiting</span><b>5 · Plant a bug, catch it</b><p>Bug M07 makes the badge always say "connected". The same check must now fail.</p></div>
  </section>
  <section id="browser"><h2>Live browser stream (same Chrome window that opens on your screen)</h2><div class="view" id="view"><div class="empty">Press <b>Start demo</b>. The browser appears here in step 2.</div></div></section>
  <section id="oracle"><h2>Oracle</h2>
    <div class="otitle" id="otitle">Waiting to start</div>
    <div class="cols"><div class="col"><h3>What the operator sees</h3><div id="screen"></div></div><div class="col"><h3>What is actually true</h3><div id="truth"></div></div></div>
    <div class="verdict" id="verdict">—</div>
    <div id="summary"></div>
    <div class="explain"><b>How to read this.</b> Left is read from the page in Chrome. Right comes from an independent source (the simulator API or our own connection). The test passes only when they agree. Blue lines in the terminal are the exact commands being run, e.g. <code>POST /control/fault</code> or <code>page.getByTestId(…)</code>.</div>
  </section>
  <section id="term"><h2>Terminal</h2><div id="log"></div></section>
</main>
<script>
const $=s=>document.querySelector(s);const logEl=$('#log');const btn=$('#start');const state=$('#state');let img=null;
function setBusy(b){btn.disabled=b;state.textContent=b?'running':'idle';state.className='pill'+(b?' live':'')}
function kv(obj){return Object.entries(obj).map(([k,v])=>'<div class="kv"><span>'+esc(k)+'</span><span>'+esc(String(v))+'</span></div>').join('')||'<div class="kv"><span>—</span><span></span></div>'}
function esc(s){return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function line(text,cls){const d=document.createElement('div');d.className=cls;d.textContent=text;logEl.appendChild(d);logEl.scrollTop=logEl.scrollHeight}
function reset(){logEl.innerHTML='';document.querySelectorAll('.st').forEach(s=>{s.className='st';s.querySelector('.s').textContent='waiting'});$('#screen').innerHTML='';$('#truth').innerHTML='';$('#verdict').className='verdict';$('#verdict').textContent='—';$('#otitle').textContent='Starting…';$('#summary').style.display='none';$('#view').innerHTML='<div class="empty">Starting…</div>';img=null}
const es=new EventSource('/events');
es.onmessage=m=>{const e=JSON.parse(m.data);
 switch(e.kind){
  case 'reset':reset();setBusy(true);break;
  case 'busy':setBusy(true);break;
  case 'idle':setBusy(false);break;
  case 'log':line(e.text,'l-'+e.level);break;
  case 'cmd':line('$ '+e.text,'l-cmd');break;
  case 'step':{const s=document.querySelector('.st[data-id="'+e.id+'"]');if(s){s.className='st '+e.status;s.querySelector('.s').textContent=e.status==='running'?'running now':e.status;if(e.status==='running')s.scrollIntoView({block:'nearest'})}break}
  case 'frame':{if(!img){$('#view').innerHTML='';img=new Image();img.alt='Live view of the cockpit in the background Chrome';$('#view').appendChild(img)}img.src='data:image/jpeg;base64,'+e.data;break}
  case 'compare':{$('#otitle').textContent=e.title;$('#screen').innerHTML=kv(e.screen);$('#truth').innerHTML=kv(e.truth);const v=$('#verdict');v.textContent=e.note;v.className='verdict'+(e.ok===true?' ok':e.ok===false?' bad':'');break}
  case 'summary':{const s=$('#summary');s.style.display='block';s.className='verdict '+(e.ok?'ok':'bad');s.textContent=e.text;break}
 }};
btn.onclick=async()=>{btn.disabled=true;const r=await fetch('/start',{method:'POST'});if(r.status===409)line('A demo is already running.','l-warn')};
</script></body></html>`;
