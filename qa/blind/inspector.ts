/**
 * BLIND QA INSPECTOR: an isolated process that knows only what the product SHOULD do.
 * It has no access to the saboteur, the bug list or the sealed answer. It runs every check
 * against the live app, compares what the operator sees with independent truth, and reports
 * any problem it finds.
 *
 *   npx tsx blind/inspector.ts            (PACE=1.5 slower, HEADLESS=1 hides the window)
 *
 * Output: one JSON event per line on stdout (the referee relays these).
 */
import { chromium, type Page } from '@playwright/test';
import { io } from 'socket.io-client';
import { WireLedger, CONTRACT } from './ledger.js';

const API = 'http://localhost:4000/api';
const COCKPIT = 'http://localhost:4010';
const PACE = Number(process.env.PACE ?? 1.4);
const say = (ev: Record<string, unknown>) => process.stdout.write(JSON.stringify({ from: 'qa', ...ev }) + '\n');
const log = (text: string, level = 'info') => say({ event: 'log', text, level });
const cmd = (text: string) => say({ event: 'cmd', text });
const pause = (ms = 1200) => new Promise((r) => setTimeout(r, ms * PACE));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  cmd(`${method} /api${path}${body ? ' ' + JSON.stringify(body) : ''}`);
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}
const quiet = async (path: string) => (await fetch(API + path)).json();
const truthOf = async (id: string) => (await quiet('/control/state')).drones[id] as { status: string; height: number; battery: number };

// ───────── the checks: what a correct cockpit must do ─────────
const CHECKS = [
  { id: 'C1', title: 'Every cockpit region is present and usable', why: 'The operator needs the badge, device list, telemetry, map, video and control-panel link, visible and not covered.' },
  { id: 'C2', title: 'Device list matches the real fleet', why: 'Every drone the backend knows must be listed, with its name and dock.' },
  { id: 'C3', title: 'Control panel offers Take off and Land for every drone', why: 'The operator must be able to command each drone.' },
  { id: 'C4', title: 'Status is consistent everywhere through take off and landing', why: 'Device list, telemetry panel and simulator must agree in every flight phase.' },
  { id: 'C5', title: 'Telemetry shows the selected drone\'s real values', why: 'Battery and altitude on screen must match the simulator (±2).' },
  { id: 'C6', title: 'Video label tells the truth', why: 'A stopped stream must say "off", never "live".' },
  { id: 'C7', title: 'Drone names are shown as text, never run as code', why: 'User-supplied names must not execute in the operator\'s browser.' },
  { id: 'C8', title: 'Simulator offline: no invented flying/online status', why: 'When the backend loses the simulator, the UI must keep the last true status.' },
  { id: 'C9', title: 'Connection badge tells the truth during an outage', why: 'If connections are refused, the badge must not say "connected".' },
  { id: 'C10', title: 'Wire-to-pixel ledger: every drone, every field, exact match', why: 'Each on-screen value must equal, character for character, what the UI was actually sent over its own connection.' },
  { id: 'C11', title: 'Metamorphic: switching drones A → B → A never leaks data', why: 'Selecting a drone is a pure view change: each panel must show only the selected drone\'s own data.' },
] as const;
type Cid = typeof CHECKS[number]['id'];
const failures: { id: Cid; title: string; message: string; layer?: string }[] = [];
const pass = (id: Cid, message: string) => { say({ event: 'check', id, status: 'pass', message }); log(`${id} PASS: ${message}`, 'ok'); };
const fail = (id: Cid, message: string, layer?: string) => { const c = CHECKS.find((x) => x.id === id)!; failures.push({ id, title: c.title, message, layer }); say({ event: 'check', id, status: 'fail', message }); log(`${id} PROBLEM: ${message}`, 'bad'); };
const compare = (title: string, screen: Record<string, string>, truth: Record<string, string>, ok: boolean | null, note: string) => say({ event: 'compare', title, screen, truth, ok, note });

async function banner(page: Page, text: string, color = '#c9731f') {
  await page.evaluate(([t, col]) => {
    let el = document.getElementById('__qa_banner');
    if (!el) { el = document.createElement('div'); el.id = '__qa_banner'; document.body.appendChild(el); }
    el.setAttribute('style', `position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:99999;background:${col};color:#fff;font:600 17px system-ui;padding:10px 18px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.35);pointer-events:none;max-width:90vw;text-align:center`);
    el.textContent = t;
  }, [text, color]).catch(() => undefined);
}
async function mark(page: Page, sel: string, color: string) {
  await page.evaluate(([s, col]) => document.querySelectorAll(s).forEach((e) => { (e as HTMLElement).style.outline = `3px solid ${col}`; (e as HTMLElement).style.outlineOffset = '2px'; }), [sel, color]).catch(() => undefined);
}
async function usable(page: Page, sel: string, hitTest = true) {
  return page.evaluate(([s, ht]) => {
    const el = document.querySelector(s) as HTMLElement | null;
    if (!el) return 'missing from the page';
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return 'has no visible size';
    if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return 'is off screen';
    if (ht) { const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) return 'is covered by another element'; }
    return 'ok';
  }, [sel, hitTest] as const);
}
async function pills(page: Page, id: string) {
  const list = (await page.locator(`[data-testid="device-row-${id}"] .device-pills .pill`).last().innerText().catch(() => '?')).trim();
  const panel = (await page.getByTestId('status-flight').innerText().catch(() => '?')).trim();
  return { list, panel };
}
async function waitApi(id: string, want: string, timeout = 60_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if ((await truthOf(id))?.status === want) return true; await sleep(400); }
  return false;
}
/** Phase check: once the simulator is in `phase`, list pill and panel pill must both show it within 5 s. */
async function phaseAgrees(page: Page, id: string, phase: string) {
  const end = Date.now() + 5000; let p = await pills(page, id);
  while (Date.now() < end) {
    p = await pills(page, id);
    compare(`C4 · phase "${phase}"`, { 'Device list': p.list, 'Telemetry panel': p.panel }, { Simulator: phase }, p.list === phase && p.panel === phase ? true : null, 'All three must agree');
    if (p.list === phase && p.panel === phase) return { ok: true, p };
    await sleep(500);
  }
  return { ok: false, p };
}

async function main() {
  say({ event: 'plan', checks: CHECKS });
  log('I have NOT been told whether anything is broken. Running every check against the live app.', 'warn');
  const headless = process.env.HEADLESS === '1';
  cmd(`chromium.launch({ headless: ${headless}, slowMo: ${Math.round(220 * PACE)} })`);
  let lastStats = 0;
  const ledger = new WireLedger((st) => { if (Date.now() - lastStats > 250) { lastStats = Date.now(); say({ event: 'ledger', ...st }); } });
  const browser = await chromium.launch({ headless, slowMo: Math.round(220 * PACE), args: ['--window-position=40,40', '--window-size=1300,860'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 780 } });
  ledger.attach(page);
  log('wire tap attached: every message the cockpit receives is recorded in the ledger', 'dim');
  const cdp = await page.context().newCDPSession(page);
  let last = 0;
  cdp.on('Page.screencastFrame', (f: any) => { cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined); if (Date.now() - last > 120) { last = Date.now(); say({ event: 'frame', data: f.data }); } });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 1280, maxHeight: 780 });
  const tick = setInterval(async () => { if (Date.now() - last > 700 && !page.isClosed()) { try { const b = await page.screenshot({ type: 'jpeg', quality: 55 }); last = Date.now(); say({ event: 'frame', data: b.toString('base64') }); } catch { /* busy */ } } }, 500);

  let drone: { id: string; name: string } | undefined; let xss: string | undefined;
  const run = async (id: Cid, fn: () => Promise<void>) => {
    const c = CHECKS.find((x) => x.id === id)!;
    say({ event: 'check', id, status: 'running', message: c.why });
    log(`── ${id} · ${c.title}`, 'warn'); log(c.why, 'dim');
    await banner(page, `${id} · ${c.title}`);
    await pause(1500);
    try { await fn(); } catch (e: any) { fail(id, `could not complete: ${String(e?.message ?? e).split('\n')[0]}`); }
    await pause(1200);
  };
  try {
    cmd(`page.goto("${COCKPIT}")`); await page.goto(COCKPIT);
    await page.getByTestId('socket-status').waitFor({ timeout: 20_000 });
    await sleep(2500);
    ({ drone } = await api('POST', '/control/drones', { name: `QA-${Date.now() % 10000}` }));
    log(`added my own test drone "${drone!.name}" so the real fleet is never disturbed`, 'dim');
    await page.locator(`[data-testid="device-row-${drone!.id}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined);

    await run('C1', async () => {
      const parts: [string, string, boolean][] = [
        ['Connection badge', '[data-testid="socket-status"]', true], ['Device list', '.device-list', true], ['Telemetry panel', '[data-testid="telemetry-battery"]', true],
        ['Map', '[data-testid="map-canvas"], canvas', false], ['Video tile', '[data-testid="video-state"]', true], ['Control-panel link', 'a[href$="/dashboard"]', true],
      ];
      const seen: Record<string, string> = {}; const bad: string[] = [];
      for (const [name, sel, ht] of parts) {
        const r = await usable(page, sel, ht); seen[name] = r === 'ok' ? 'usable' : r;
        await mark(page, sel, r === 'ok' ? '#23794d' : '#b4401b');
        compare('C1 · required regions', { ...seen }, {}, null, 'Each region must be visible, on screen and not covered');
        log(`${name}: ${seen[name]}`, r === 'ok' ? 'info' : 'bad'); if (r !== 'ok') bad.push(`${name} ${r}`);
        await pause(500);
      }
      bad.length ? fail('C1', `operator cannot use: ${bad.join('; ')}`) : pass('C1', 'all six regions are visible and usable');
    });

    await run('C2', async () => {
      const devs = (await api('GET', '/devices')).devices as { id: string; type: string; name: string; dockId?: string }[];
      const docks = new Map(devs.filter((d) => d.type === 'dock').map((d) => [d.id, d.name]));
      const want = devs.filter((d) => d.type === 'drone');
      await pause(800);
      const rows = await page.locator('[data-testid^="device-row-"]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-testid')!.replace('device-row-', ''), name: e.querySelector('.device-name')?.textContent ?? '', dock: e.querySelector('.device-sub')?.textContent ?? '' })));
      await mark(page, '[data-testid^="device-row-"]', '#f0a24f');
      const missing = want.filter((d) => !rows.some((r) => r.id === d.id)).map((d) => d.name);
      const wrong = want.filter((d) => { const r = rows.find((x) => x.id === d.id); return r && (r.name !== d.name || (d.dockId && r.dock !== docks.get(d.dockId))); }).map((d) => d.name);
      compare('C2 · fleet', { 'Rows on screen': String(rows.length), Names: rows.map((r) => r.name).join(', ') }, { 'Drones in backend': String(want.length), Names: want.map((d) => d.name).join(', ') }, !missing.length && !wrong.length, missing.length ? `Missing: ${missing.join(', ')}` : 'Every drone listed with the right name and dock');
      missing.length ? fail('C2', `backend has ${want.length} drones but the list shows ${rows.length}; missing: ${missing.join(', ')}`) : wrong.length ? fail('C2', `wrong name or dock for: ${wrong.join(', ')}`) : pass('C2', `all ${want.length} drones listed with correct names and docks`);
    });

    await run('C3', async () => {
      cmd('page.goto("http://localhost:4000/dashboard")'); await page.goto('http://localhost:4000/dashboard');
      await banner(page, 'C3 · Control panel offers Take off and Land for every drone');
      await sleep(2500);
      const want = ((await api('GET', '/devices')).devices as { id: string; type: string; name: string }[]).filter((d) => d.type === 'drone');
      const lacking: string[] = [];
      for (const d of want) {
        const t = await page.locator(`[data-testid="dash-takeoff-${d.id}"], button[data-cmd="takeoff"][data-id="${d.id}"]`).count();
        const l = await page.locator(`[data-testid="dash-land-${d.id}"], button[data-cmd="land"][data-id="${d.id}"]`).count();
        if (!t || !l) lacking.push(`${d.name} (${!t ? 'no Take off' : ''}${!t && !l ? ', ' : ''}${!l ? 'no Land' : ''})`);
      }
      await mark(page, 'button[data-cmd]', '#f0a24f');
      compare('C3 · control panel', { 'Drones with both buttons': String(want.length - lacking.length) }, { 'Drones in backend': String(want.length) }, !lacking.length, lacking.length ? `Missing controls: ${lacking.join('; ')}` : 'Every drone can be commanded');
      await pause(1500);
      lacking.length ? fail('C3', `operator cannot command: ${lacking.join('; ')}`) : pass('C3', `Take off and Land present for all ${want.length} drones`);
      cmd(`page.goto("${COCKPIT}")`); await page.goto(COCKPIT); await page.getByTestId('socket-status').waitFor(); await sleep(2000);
    });

    cmd(`page.getByTestId("device-row-${drone!.id}").click()`);
    await page.getByTestId(`device-row-${drone!.id}`).click().catch(() => undefined);
    await sleep(1500);

    let flying = false;
    await run('C4', async () => {
      const problems: string[] = [];
      const g = await phaseAgrees(page, drone!.id, (await truthOf(drone!.id)).status);
      if (!g.ok) problems.push(`on the ground the simulator says "${(await truthOf(drone!.id)).status}" but list shows "${g.p.list}" and panel shows "${g.p.panel}"`);
      await api('POST', '/control/command', { deviceId: drone!.id, type: 'takeoff' });
      log('waiting for the drone to reach cruise altitude (about 12 s)…', 'dim');
      flying = await waitApi(drone!.id, 'in_flight', 40_000);
      const f = await phaseAgrees(page, drone!.id, 'in_flight');
      if (!f.ok) problems.push(`in flight the simulator says "in_flight" but list shows "${f.p.list}" and panel shows "${f.p.panel}"`);
      problems.length ? fail('C4', problems.join('; ')) : pass('C4', 'device list, panel and simulator agree on the ground and in flight');
    });

    await run('C5', async () => {
      if (!flying) await waitApi(drone!.id, 'in_flight', 30_000);
      let good = 0; let lastS: any; let lastT: any;
      for (let i = 0; i < 6; i++) {
        const bt = await page.getByTestId('telemetry-battery').innerText(); const at = await page.getByTestId('telemetry-alt-agl').innerText();
        const b = Number(bt.match(/-?\d+(\.\d+)?/)?.[0]); const a = Number(at.match(/-?\d+(\.\d+)?/)?.[0]); const t = await truthOf(drone!.id);
        const ok = Math.abs(b - t.battery) <= 2 && Math.abs(a - t.height) <= 2; if (ok) good++;
        lastS = { Battery: bt, Altitude: at }; lastT = { Battery: `${t.battery.toFixed(1)} %`, Altitude: `${t.height.toFixed(1)} m` };
        compare('C5 · telemetry vs simulator', lastS, lastT, ok, ok ? 'Match within ±2' : 'Mismatch');
        log(`screen ${bt} / ${at}  vs  truth ${lastT.Battery} / ${lastT.Altitude}  →  ${ok ? 'match' : 'MISMATCH'}`, ok ? 'info' : 'bad');
        await pause(900);
      }
      good >= 3 ? pass('C5', `${good}/6 readings matched the simulator`) : fail('C5', `operator sees battery ${lastS.Battery}, altitude ${lastS.Altitude} but the simulator says ${lastT.Battery}, ${lastT.Altitude}`);
      await api('POST', '/control/command', { deviceId: drone!.id, type: 'land' });
      log('landing the test drone…', 'dim');
    });

    const specsFor = (id: string) => [
      ...CONTRACT.map((c) => ({ field: c.field, sel: `[data-testid="${c.testid}"]`, topic: c.topic, render: c.render })),
      { field: 'Status (device list)', sel: `[data-testid="device-row-${id}"] .device-pills .pill:last-child`, topic: 'flight_status', render: (p: any) => p?.flight_status },
    ];
    const backendOf = (id: string) => async () => (await quiet('/control/state')).drones[id];
    const report = (title: string, rs: { ok: boolean; field: string; screen: string; expected: string[]; layer?: string }[]) => {
      for (const r of rs) compare(title + ' · ' + r.field, { Screen: r.screen }, { 'UI was sent → must render as': r.expected[r.expected.length - 1] }, r.ok, r.ok ? 'Exact match (character for character)' : `Mismatch, introduced at: ${r.layer}`);
      return rs.filter((r) => !r.ok);
    };

    await run('C10', async () => {
      const fleet = ((await api('GET', '/devices')).devices as { id: string; type: string; name: string }[]).filter((d) => d.type === 'drone');
      const bad: string[] = []; const layers: string[] = [];
      for (const d of fleet) {
        const row = page.getByTestId(`device-row-${d.id}`);
        if (!(await row.count())) { ledger.missing(d.name, 'Device row'); bad.push(`${d.name}: no row on screen`); layers.push('screen (element missing)'); continue; }
        cmd(`select ${d.name}  →  ledger.checkMany(${d.id}, ${specsFor(d.id).length} fields)`);
        await row.click(); await mark(page, `[data-testid="device-row-${d.id}"]`, '#5aa8ff'); await sleep(900 * PACE);
        for (let round = 0; round < 2; round++) {
          const miss = report(`C10 · ${d.name}`, await ledger.checkMany(page, d.id, specsFor(d.id), backendOf(d.id)));
          for (const m of miss) { bad.push(`${d.name} ${m.field}: screen "${m.screen}" but the UI was sent "${m.expected[m.expected.length - 1]}"`); layers.push(m.layer!); }
          await sleep(400 * PACE);
        }
        log(`${d.name}: ${bad.filter((b) => b.startsWith(d.name)).length ? 'MISMATCH' : 'all fields exact'}  (ledger: ${ledger.exact}/${ledger.assertions} exact, ${ledger.frameCount} messages tapped)`, bad.some((b) => b.startsWith(d.name)) ? 'bad' : 'info');
      }
      const st = ledger.stats(); say({ event: 'ledger', ...st });
      const layer = layers.sort((a, b) => layers.filter((x) => x === b).length - layers.filter((x) => x === a).length)[0];
      bad.length ? fail('C10', `${bad.length} exact mismatch(es): ${[...new Set(bad)].slice(0, 3).join('; ')}${bad.length > 3 ? '; …' : ''}. Root cause located at: ${layer}`, layer)
                 : pass('C10', `${st.exact}/${st.assertions} exact matches across ${fleet.length} drones (${st.frames} messages tapped)`);
    });

    await run('C11', async () => {
      const other = ((await api('GET', '/devices')).devices as { id: string; type: string; name: string }[]).find((d) => d.type === 'drone' && d.id !== drone!.id)!;
      const seq = [drone!, other, drone!] as { id: string; name: string }[]; const bad: string[] = []; let layer: string | undefined;
      for (const [i, d] of seq.entries()) {
        cmd(`step ${i + 1}/3: select ${d.name}`);
        await page.getByTestId(`device-row-${d.id}`).click().catch(() => undefined); await sleep(1100 * PACE);
        const heading = (await page.locator('.panel-title span').first().textContent().catch(() => '') ?? '').trim(); // textContent: ignores CSS uppercasing
        if (!heading.includes(d.name)) bad.push(`after selecting ${d.name} the panel is titled "${heading}"`);
        const miss = report(`C11 · step ${i + 1} (${d.name})`, await ledger.checkMany(page, d.id, specsFor(d.id).slice(0, 2), backendOf(d.id)));
        for (const m of miss) { bad.push(`step ${i + 1} (${d.name}) ${m.field}: screen "${m.screen}" but ${d.name} was sent "${m.expected[m.expected.length - 1]}"`); layer = m.layer; }
      }
      bad.length ? fail('C11', `data leaked between drones: ${bad.join('; ')}`, layer) : pass('C11', 'A → B → A: each step showed only the selected drone\'s own data');
    });

    await run('C6', async () => {
      await api('POST', '/control/video', { action: 'stop', deviceId: drone!.id });
      let label = ''; const end = Date.now() + 8000;
      while (Date.now() < end) { label = (await page.getByTestId('video-state').innerText().catch(() => 'missing')).trim(); compare('C6 · video stopped', { 'Video label': label }, { 'Stream (backend)': 'stopped' }, label === 'off' ? true : null, 'A stopped stream must be labelled "off"'); if (label === 'off') break; await sleep(500); }
      await mark(page, '[data-testid="video-state"]', label === 'off' ? '#23794d' : '#b4401b');
      if (label !== 'off') { compare('C6 · video stopped', { 'Video label': label }, { 'Stream (backend)': 'stopped' }, false, 'The label claims a stream that is not running'); fail('C6', `the stream is stopped but the label says "${label}"`); }
      else pass('C6', 'stopped stream is correctly labelled "off"');
      await api('POST', '/control/video', { action: 'start', deviceId: drone!.id });
    });

    await run('C7', async () => {
      const name = '<img src=x onerror="window.__qa_x=1">';
      ({ drone: { id: xss } } = await api('POST', '/control/drones', { name }) as any);
      const row = page.getByTestId(`device-row-${xss}`); await row.waitFor({ timeout: 10_000 }); await row.scrollIntoViewIfNeeded(); await mark(page, `[data-testid="device-row-${xss}"]`, '#f0a24f');
      await sleep(2000);
      const ran = await page.evaluate(() => (window as any).__qa_x === 1);
      const text = await row.innerText();
      compare('C7 · name with HTML in it', { 'Script executed?': ran ? 'YES' : 'no', 'Shown as text?': text.includes('<img') ? 'yes' : 'no' }, { Expected: 'shown as text, never executed' }, !ran && text.includes('<img'), ran ? 'The name ran as code in the operator\'s browser' : 'Rendered safely as text');
      ran || !text.includes('<img') ? fail('C7', 'a drone name was executed as HTML/script in the cockpit') : pass('C7', 'the name was shown as plain text and nothing executed');
      await api('DELETE', `/control/drones/${xss}`); xss = undefined;
    });

    await run('C8', async () => {
      await waitApi(drone!.id, 'standby', 45_000);
      await page.getByTestId(`device-row-${drone!.id}`).click().catch(() => undefined);
      await sleep(2000);
      const before = (await truthOf(drone!.id)).status;
      await api('POST', '/control/fault', { kind: 'sim-offline', seconds: 12 });
      await banner(page, 'C8 · Simulator taken offline on purpose (12 s)', '#b4401b');
      let bad = ''; for (let i = 0; i < 6; i++) {
        const p = await pills(page, drone!.id); const h = (await quiet('/health')).simulator;
        const invented = (s: string) => s !== before && (s === 'in_flight' || s === 'online' || s === 'taking_off');
        compare('C8 · simulator offline', { 'Device list': p.list, 'Telemetry panel': p.panel }, { 'Simulator health': h, 'Last true status': before }, !(invented(p.list) || invented(p.panel)), 'Must keep the last true status, never invent a flying/online one');
        if (invented(p.list) || invented(p.panel)) bad = `simulator is ${h} and the drone was "${before}", but the UI shows list "${p.list}", panel "${p.panel}"`;
        await pause(1000);
      }
      await api('DELETE', '/control/fault');
      bad ? fail('C8', bad) : pass('C8', `kept the last true status "${before}" while the simulator was offline`);
      await sleep(4000);
    });

    await run('C9', async () => {
      const sock = io('http://localhost:4000', { auth: { 'org-id': 'flytbase' }, transports: ['websocket'], reconnection: true, reconnectionDelay: 500 });
      await api('POST', '/control/fault', { kind: 'socket-refuse', seconds: 10 });
      await api('POST', '/control/fault', { kind: 'socket-kick' });
      await banner(page, 'C9 · All connections refused on purpose (10 s)', '#b4401b');
      let lies = 0;
      for (let i = 0; i < 8; i++) {
        await sleep(1000);
        const badge = (await page.getByTestId('socket-status').innerText()).trim(); const real = sock.connected ? 'connected' : 'refused';
        const lying = badge === 'socket connected' && !sock.connected; if (lying) lies++;
        compare('C9 · connection outage', { 'Connection badge': badge }, { 'Our own independent connection': real }, !lying, lying ? 'Operator is told "connected" during an outage' : 'Badge is honest');
        log(`badge "${badge}"  |  independent connection: ${real}`, lying ? 'bad' : 'info');
      }
      sock.close(); await api('DELETE', '/control/fault');
      lies >= 3 ? fail('C9', `connections were refused but the badge kept saying "socket connected" (${lies}/8 seconds)`) : pass('C9', 'the badge stopped claiming a connection during the outage');
      await page.getByTestId('socket-status').filter({ hasText: 'socket connected' }).waitFor({ timeout: 25_000 }).catch(() => undefined);
    });
  } finally {
    await fetch(API + '/control/fault', { method: 'DELETE' }).catch(() => undefined);
    if (xss) await fetch(`${API}/control/drones/${xss}`, { method: 'DELETE' }).catch(() => undefined);
    if (drone) await fetch(`${API}/control/drones/${drone.id}`, { method: 'DELETE' }).catch(() => undefined);
    await banner(page, failures.length ? `QA found ${failures.length} problem(s)` : 'QA found no problems', failures.length ? '#b4401b' : '#23794d');
    await sleep(2500);
    clearInterval(tick); await browser.close().catch(() => undefined);
  }
  say({ event: 'verdict', failures });
  log(failures.length ? `VERDICT: ${failures.length} problem(s) found` : 'VERDICT: the app behaves correctly in every check', failures.length ? 'bad' : 'ok');
}

main().then(() => process.exit(0)).catch((e) => { say({ event: 'error', text: String(e?.message ?? e) }); process.exit(1); });
