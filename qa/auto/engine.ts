/**
 * AUTONOMOUS SCENARIO ENGINE
 *   npx tsx auto/engine.ts learn                 # discover the product model on a known-good build
 *   npx tsx auto/engine.ts plan [--full]         # print the synthesized scenarios
 *   npx tsx auto/engine.ts run [--limit N] [--full] [--events]
 *
 * Scenario space = viewport × drone state × condition × operator action (360 combinations).
 * The planner picks a pairwise-covering subset (every pair of values meets at least once).
 * Every scenario is judged by the same generic invariants, derived from the learned model:
 *   BIND  every learned on-screen value = learned format(one of the last messages the UI received), exact
 *   FLEET the device list = the backend's fleet
 *   USE   every element that was usable on the known-good build is still usable at this viewport
 *   FIT   no sideways scrolling
 *   ECHO  panels name the selected drone
 *   HONEST the connection indicator never claims "connected" while connections are refused
 *   RECOVER after a fault clears, the indicator and live values recover without a reload
 * Failures are clustered by root cause; each cluster gets the simplest failing scenario as its reproducer.
 */
import { chromium, type Page } from '@playwright/test';
import { io } from 'socket.io-client';
import { existsSync, readFileSync } from 'node:fs';
import { APP, OUT, Tap, api, out, sleep, usable, withLock } from './lib.js';
import { discover, type Model, type Binding } from './discover.js';

const EVENTS = process.argv.includes('--events');
const emit = (ev: Record<string, unknown>) => { if (EVENTS) process.stdout.write(JSON.stringify({ from: 'auto', ...ev }) + '\n'); };
const say = (text: string, level = 'info') => { if (EVENTS) emit({ event: 'log', text, level }); else console.log(text); };

// ───────── scenario space ─────────
const DIMS = {
  viewport: ['desktop', 'tablet', 'phone'],
  state: ['grounded', 'climbing', 'cruising', 'landing'],
  condition: ['normal', 'socket-delay', 'socket-drop', 'socket-refuse', 'sim-offline', 'video-freeze'],
  action: ['observe', 'switch-A-B-A', 'reload', 'fleet-change', 'sweep-all'],
} as const;
type Dim = keyof typeof DIMS;
export type Scenario = { id: string; viewport: string; state: string; condition: string; action: string; title: string };
const VIEW: Record<string, { width: number; height: number }> = { desktop: { width: 1440, height: 900 }, tablet: { width: 768, height: 1024 }, phone: { width: 390, height: 844 } };
const TXT: Record<string, string> = {
  grounded: 'a grounded drone', climbing: 'a drone climbing after take-off', cruising: 'a drone cruising at 30 m', landing: 'a drone that has just started landing',
  normal: 'normal network', 'socket-delay': 'telemetry delayed by 1.5 s', 'socket-drop': '40 % of telemetry dropped', 'socket-refuse': 'all connections refused', 'sim-offline': 'the simulator offline', 'video-freeze': 'its video stream frozen',
  observe: 'watches the screen', 'switch-A-B-A': 'switches to another drone and back', reload: 'reloads the page', 'fleet-change': 'sees a drone added and removed', 'sweep-all': 'selects every drone in turn',
};

function allCombos(): Scenario[] {
  const res: Scenario[] = [];
  for (const viewport of DIMS.viewport) for (const state of DIMS.state) for (const condition of DIMS.condition) for (const action of DIMS.action)
    res.push({ id: '', viewport, state, condition, action, title: '' });
  return res;
}
/** Greedy all-pairs: repeatedly take the combination covering the most still-uncovered value pairs. */
export function plan(full = false): Scenario[] {
  const combos = allCombos();
  let chosen: Scenario[];
  if (full) chosen = combos;
  else {
    const dims = Object.keys(DIMS) as Dim[];
    const pairKey = (s: Scenario, a: Dim, b: Dim) => `${a}=${s[a]}|${b}=${s[b]}`;
    const uncovered = new Set<string>();
    for (const s of combos) for (let i = 0; i < dims.length; i++) for (let j = i + 1; j < dims.length; j++) uncovered.add(pairKey(s, dims[i], dims[j]));
    chosen = [];
    while (uncovered.size) {
      let best = combos[0]; let bestN = -1;
      for (const s of combos) { let n = 0; for (let i = 0; i < dims.length; i++) for (let j = i + 1; j < dims.length; j++) if (uncovered.has(pairKey(s, dims[i], dims[j]))) n++; if (n > bestN) { bestN = n; best = s; } }
      chosen.push(best);
      for (let i = 0; i < dims.length; i++) for (let j = i + 1; j < dims.length; j++) uncovered.delete(pairKey(best, dims[i], dims[j]));
    }
  }
  const order = (s: Scenario) => DIMS.state.indexOf(s.state as never) * 10 + (s.condition === 'normal' ? 0 : 1);
  return chosen.sort((a, b) => order(a) - order(b)).map((s, i) => ({ ...s, id: `G${String(i + 1).padStart(2, '0')}`, title: `On ${s.viewport}, with ${TXT[s.state]} and ${TXT[s.condition]}, the operator ${TXT[s.action]}` }));
}

// ───────── invariants ─────────
type Violation = { inv: string; field: string; detail: string; layer: string };
type Observation = { kind: string; detail: string };
const render = (b: Binding, payload: any, alt?: { attr: string; path: string }) => {
  const v = (alt ? alt.path : b.path).split('.').reduce((x: any, k) => (x == null ? undefined : x[k]), payload);
  if (v === undefined || v === null) return undefined;
  return b.template.replace('{v}', b.digits === null ? String(v) : Number(v).toFixed(b.digits));
};
let assertions = 0; let exact = 0;
async function checkBindings(page: Page, tap: Tap, model: Model, selected: string, rows: string[]): Promise<Violation[]> {
  const targets = [
    ...model.bindings.filter((b) => b.kind === 'panel').map((b) => ({ b, entity: selected, sel: b.selector })),
    ...model.bindings.filter((b) => b.kind === 'row').flatMap((b) => rows.map((id) => ({ b, entity: id, sel: b.selector.replace('{id}', id) }))),
  ];
  const readAt = Date.now();
  const texts = await page.evaluate((sels) => sels.map((s) => (document.querySelector(s) as HTMLElement | null)?.innerText?.trim() ?? null), targets.map((t) => t.sel));
  await sleep(350);
  const v: Violation[] = [];
  targets.forEach((t, i) => {
    const frames = tap.recent(`flytbase/${t.entity}/telemetry/${t.b.attr}`, readAt + 350, 3);
    if (!frames.length) return;
    const cands = new Set<string>();
    for (const f of frames) { const r = render(t.b, f.payload); if (r) cands.add(r); for (const a of t.b.alternatives) { if (a.attr === t.b.attr) { const r2 = render(t.b, f.payload, a); if (r2) cands.add(r2); } } }
    if (!cands.size) return;
    assertions++;
    const screen = texts[i];
    if (screen !== null && cands.has(screen)) { exact++; return; }
    v.push({ inv: 'BIND', field: `${t.b.label}${t.b.kind === 'row' ? ` (${t.entity})` : ''}`, detail: `screen shows "${screen ?? '(missing)'}" but the UI was sent "${[...cands].pop()}" (${t.b.attr}.${t.b.path})`, layer: screen === null ? 'screen (element missing)' : 'wire→screen (frontend rendering)' });
  });
  emit({ event: 'ledger', assertions, exact });
  return v;
}
async function checkFleet(page: Page): Promise<Violation[]> {
  const want = ((await api('GET', '/devices')).devices as { id: string; type: string; name: string }[]).filter((d) => d.type === 'drone');
  const rows = await page.$$eval('[data-testid^="device-row-"]', (els) => els.map((e) => e.getAttribute('data-testid')!.replace('device-row-', '')));
  const missing = want.filter((d) => !rows.includes(d.id)); const extra = rows.filter((r) => !want.some((d) => d.id === r));
  assertions++; if (!missing.length && !extra.length) { exact++; return []; }
  return [{ inv: 'FLEET', field: 'device list', detail: `${missing.length ? 'missing ' + missing.map((d) => d.name).join(', ') : ''}${extra.length ? ' extra ' + extra.join(', ') : ''}`.trim(), layer: 'wire→screen (frontend rendering)' }];
}
async function checkLayout(page: Page, model: Model & { presenceBy?: Record<string, Model['presence']> }, viewport: string): Promise<Violation[]> {
  const v: Violation[] = [];
  const pres = model.presenceBy?.[viewport] ?? model.presence;
  for (const p of pres) { const r = await usable(page, p.sel, p.hitTest); assertions++; if (r === 'ok') exact++; else v.push({ inv: 'USE', field: p.label, detail: `was usable on the known-good build, now ${r}`, layer: 'screen (layout)' }); }
  const sw = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, v: innerWidth }));
  assertions++; if (sw.w <= sw.v + 1) exact++; else v.push({ inv: 'FIT', field: 'page width', detail: `content is ${sw.w}px wide on a ${sw.v}px screen (sideways scrolling)`, layer: 'screen (layout)' });
  return v;
}
async function checkEcho(page: Page, model: Model, name: string): Promise<Violation[]> {
  const v: Violation[] = [];
  for (const sel of model.echoes) {
    const t = (await page.locator(sel).first().textContent({ timeout: 1000 }).catch(() => null)) ?? '';
    assertions++; if (t.includes(name)) exact++; else v.push({ inv: 'ECHO', field: sel, detail: `after selecting "${name}" it shows "${t.trim()}"`, layer: 'wire→screen (frontend rendering)' });
  }
  return v;
}
const connText = async (page: Page, model: Model) => model.connectionSel ? ((await page.locator(model.connectionSel).first().innerText({ timeout: 1000 }).catch(() => '')) ?? '').trim() : '';

// ───────── execution ─────────
async function arrange(state: string): Promise<{ id: string; name: string }> {
  const { drone } = await api('POST', '/control/drones', { name: `GEN-${Date.now() % 100000}` });
  if (state === 'grounded') return drone;
  await api('POST', '/control/command', { deviceId: drone.id, type: 'takeoff' });
  const truth = async () => (await api('GET', '/control/state')).drones[drone.id];
  const until = async (pred: (t: any) => boolean, ms: number) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred(await truth())) return; await sleep(400); } };
  if (state === 'climbing') await until((t) => t.height > 4, 15_000);
  else { await until((t) => t.status === 'in_flight', 40_000); if (state === 'landing') { await api('POST', '/control/command', { deviceId: drone.id, type: 'land' }); await sleep(1200); } }
  return drone;
}
async function applyCondition(c: string, droneId: string) {
  if (c === 'socket-delay') await api('POST', '/control/fault', { kind: 'socket-delay', value: 1500 });
  if (c === 'socket-drop') await api('POST', '/control/fault', { kind: 'socket-drop', value: 40 });
  if (c === 'socket-refuse') { await api('POST', '/control/fault', { kind: 'socket-refuse', seconds: 10 }); await api('POST', '/control/fault', { kind: 'socket-kick' }); }
  if (c === 'sim-offline') await api('POST', '/control/fault', { kind: 'sim-offline', seconds: 10 });
  if (c === 'video-freeze') await api('POST', '/control/fault', { kind: 'video-freeze', deviceId: droneId, seconds: 8 });
}

async function runScenario(page: Page, tap: Tap, model: Model, s: Scenario, connectedText: string) {
  const v: Violation[] = []; const obs: Observation[] = [];
  await page.setViewportSize(VIEW[s.viewport]);
  const drone = await arrange(s.state);
  const other = ((await api('GET', '/devices')).devices as any[]).find((d) => d.type === 'drone' && d.id !== drone.id);
  const rowsVisible = async () => page.$$eval('[data-testid^="device-row-"]', (els) => els.map((e) => e.getAttribute('data-testid')!.replace('device-row-', '')));
  const select = async (d: { id: string; name: string }) => { const r = page.getByTestId(`device-row-${d.id}`); if (await r.count()) { await r.scrollIntoViewIfNeeded(); await r.click(); await sleep(900); return true; } return false; };
  const sock = s.condition === 'socket-refuse' ? io(APP.replace('4010', '4000'), { auth: { 'org-id': 'flytbase' }, transports: ['websocket'], reconnection: true, reconnectionDelay: 400 }) : undefined;
  try {
    await page.getByTestId(`device-row-${drone.id}`).waitFor({ timeout: 8000 }).catch(() => undefined);
    if (!(await select(drone))) v.push({ inv: 'FLEET', field: 'device list', detail: `the new drone ${drone.name} never appeared`, layer: 'wire→screen (frontend rendering)' });
    await applyCondition(s.condition, drone.id); const appliedAt = Date.now();
    if (s.condition !== 'normal') await sleep(2500);
    // HONEST is judged only inside the 10 s outage window (afterwards reconnecting is correct behaviour)
    if (s.condition === 'socket-refuse' && sock) {
      while (Date.now() - appliedAt < 8000) {
        const c = await connText(page, model); assertions++;
        if (!sock.connected && c === connectedText) { v.push({ inv: 'HONEST', field: model.connectionSel ?? 'connection', detail: `connections are refused but it says "${c}"`, layer: 'wire→screen (frontend rendering)' }); break; }
        exact++; await sleep(900);
      }
    }
    // action
    if (s.action === 'switch-A-B-A' && other) { for (const d of [drone, other, drone]) { if (await select(d)) { v.push(...await checkEcho(page, model, d.name)); v.push(...await checkBindings(page, tap, model, d.id, [d.id])); } } }
    if (s.action === 'reload') { await page.reload(); await page.locator('[data-testid^="device-row-"]').first().waitFor({ timeout: 15_000 }).catch(() => undefined); await sleep(2500); await select(drone); }
    if (s.action === 'fleet-change') {
      const { drone: tmp } = await api('POST', '/control/drones', { name: `TMP-${Date.now() % 10000}` });
      const appeared = await page.getByTestId(`device-row-${tmp.id}`).waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
      await api('DELETE', `/control/drones/${tmp.id}`);
      const gone = await page.getByTestId(`device-row-${tmp.id}`).waitFor({ state: 'detached', timeout: 6000 }).then(() => true).catch(() => false);
      assertions += 2; exact += (appeared ? 1 : 0) + (gone ? 1 : 0);
      const onWire = (tap.frames.get('devices') ?? []).some((f) => Array.isArray(f.payload) && f.payload.some((d: any) => d.id === tmp.id));
      if (!appeared && s.condition !== 'socket-refuse' && s.condition !== 'socket-drop') v.push({ inv: 'FLEET', field: 'device list', detail: onWire ? 'an added drone was delivered to the UI but not shown within 6 s' : 'the backend accepted a new drone (HTTP 200, listed by /api/devices) but the live fleet update never reached the UI within 6 s', layer: onWire ? 'wire→screen (frontend rendering)' : 'backend→wire (transport/backend)' });
      if (!gone && s.condition !== 'socket-refuse' && s.condition !== 'socket-drop') v.push({ inv: 'FLEET', field: 'device list', detail: 'a removed drone was still listed after 6 s', layer: 'wire→screen (frontend rendering)' });
    }
    if (s.action === 'sweep-all') { for (const id of await rowsVisible()) { const d = { id, name: '' }; if (await select(d)) v.push(...await checkBindings(page, tap, model, id, [id])); } await select(drone); }
    // judge the steady state
    for (let i = 0; i < 2; i++) {
      v.push(...await checkBindings(page, tap, model, drone.id, await rowsVisible()));
      const age = (Date.now() - Math.max(...tap.topicsOf(drone.id).map((t) => tap.lastAt(t)), 0)) / 1000;
      const moving = ['climbing', 'cruising', 'landing'].includes(s.state);
      if (age > 4 && moving) obs.push({ kind: 'STALE', detail: `the UI has received nothing for this drone for ${age.toFixed(0)} s (under ${s.condition}) yet shows its last values with no stale warning` });
      await sleep(700);
    }
    if (s.condition === 'normal' && s.action !== 'switch-A-B-A') v.push(...await checkEcho(page, model, drone.name));
    v.push(...await checkFleet(page).catch(() => []));
    v.push(...await checkLayout(page, model, s.viewport));
    // recovery
    if (s.condition !== 'normal') {
      await api('DELETE', '/control/fault'); const cleared = Date.now();
      const end = Date.now() + 22_000; let ok = false;
      while (Date.now() < end) { const c = await connText(page, model); const fresh = tap.topicsOf(drone.id).some((t) => tap.lastAt(t) > cleared); if (c === connectedText && fresh) { ok = true; break; } await sleep(600); }
      assertions++;
      if (!ok) v.push({ inv: 'RECOVER', field: 'connection + live data', detail: `22 s after clearing ${s.condition}, the indicator shows "${await connText(page, model)}" and live data ${tap.topicsOf(drone.id).some((t) => tap.lastAt(t) > cleared) ? 'resumed' : 'has not resumed'}`, layer: 'transport / recovery' });
      else { exact++; await sleep(800); v.push(...await checkBindings(page, tap, model, drone.id, [drone.id])); }
    }
  } finally {
    sock?.close();
    await api('DELETE', '/control/fault').catch(() => undefined);
    await api('DELETE', `/control/drones/${drone.id}`).catch(() => undefined);
  }
  return { v, obs };
}

async function run(limit: number, full: boolean) {
  const model = JSON.parse(readFileSync(OUT + 'model.json', 'utf8')) as Model;
  const scenarios = plan(full).slice(0, limit);
  say(`Engine: ${allCombos().length} possible scenarios → ${plan(full).length} planned (pairwise), running ${scenarios.length}.`, 'warn');
  emit({ event: 'plan', scenarios });
  const tap = new Tap();
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
  const page = await browser.newPage({ viewport: VIEW.desktop }); tap.attach(page);
  if (EVENTS) {
    const cdp = await page.context().newCDPSession(page); let last = 0;
    cdp.on('Page.screencastFrame', (f: any) => { cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined); if (Date.now() - last > 150) { last = Date.now(); emit({ event: 'frame', data: f.data }); } });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 55, maxWidth: 1280, maxHeight: 900 });
  }
  await page.goto(APP); await page.locator('[data-testid^="device-row-"]').first().waitFor({ timeout: 20_000 }); await sleep(2000);
  const connectedText = await connText(page, model);
  const results: { s: Scenario; v: Violation[]; obs: Observation[]; ms: number }[] = [];
  for (const s of scenarios) {
    const t0 = Date.now(); emit({ event: 'scenario', id: s.id, status: 'running', title: s.title }); say(`${s.id}  ${s.title}`);
    let r: { v: Violation[]; obs: Observation[] };
    try { r = await runScenario(page, tap, model, s, connectedText); } catch (e: any) { r = { v: [{ inv: 'RUN', field: 'scenario', detail: String(e?.message ?? e).split('\n')[0], layer: 'harness' }], obs: [] }; }
    results.push({ s, ...r, ms: Date.now() - t0 });
    const status = r.v.length ? 'fail' : 'pass';
    emit({ event: 'scenario', id: s.id, status, violations: r.v, observations: r.obs });
    say(`     ${status === 'pass' ? '✔ pass' : '✖ ' + r.v.length + ' violation(s): ' + r.v.slice(0, 2).map((x) => `${x.inv} ${x.field}: ${x.detail}`).join(' | ')}${r.obs.length ? `  · ${r.obs.length} observation(s)` : ''}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`, status === 'pass' ? 'ok' : 'bad');
  }
  await browser.close();
  report(results);
}

// ───────── clustering + report ─────────
function report(results: { s: Scenario; v: Violation[]; obs: Observation[]; ms: number }[]) {
  const cplx = (s: Scenario) => DIMS.viewport.indexOf(s.viewport as never) + (s.condition === 'normal' ? 0 : 3) + (s.action === 'observe' ? 0 : 2) + DIMS.state.indexOf(s.state as never);
  const clusters = new Map<string, { inv: string; field: string; layer: string; hits: { s: Scenario; detail: string }[] }>();
  for (const r of results) for (const x of r.v) {
    const k = `${x.inv}|${x.field.replace(/\(drone-\d+\)|GEN-\d+|TMP-\d+/g, '')}|${x.layer}`;
    const c = clusters.get(k) ?? { inv: x.inv, field: x.field, layer: x.layer, hits: [] }; c.hits.push({ s: r.s, detail: x.detail }); clusters.set(k, c);
  }
  const findings = new Map<string, { detail: string; scenarios: string[] }>();
  for (const r of results) for (const o of r.obs) { const f = findings.get(o.kind) ?? { detail: o.detail, scenarios: [] }; f.scenarios.push(r.s.id); findings.set(o.kind, f); }
  const cl = [...clusters.values()].sort((a, b) => b.hits.length - a.hits.length);
  const passed = results.filter((r) => !r.v.length).length;
  let md = `# Autonomous QA report\n\n${results.length} generated scenarios · ${passed} passed · ${results.length - passed} failed · ${exact}/${assertions} assertions exact\n\n`;
  md += `## Problems (clustered by root cause)\n\n` + (cl.length ? cl.map((c, i) => {
    const rep = [...c.hits].sort((a, b) => cplx(a.s) - cplx(b.s))[0];
    return `### P${i + 1}. ${c.inv} · ${c.field}\n- **Located at:** ${c.layer}\n- **Seen in:** ${c.hits.length} scenario(s): ${[...new Set(c.hits.map((h) => h.s.id))].join(', ')}\n- **Simplest reproducer:** ${rep.s.id}: ${rep.s.title}\n- **Observed:** ${rep.detail}\n`;
  }).join('\n') : 'None.\n');
  md += `\n## Product findings (true on this build, not regressions)\n\n` + ([...findings.entries()].map(([k, f]) => `- **${k}** (${f.scenarios.length} scenario(s): ${f.scenarios.join(', ')}): ${f.detail}`).join('\n') || 'None.') + '\n';
  md += `\n## Scenarios\n\n| ID | Scenario | Result |\n|---|---|---|\n` + results.map((r) => `| ${r.s.id} | ${r.s.title} | ${r.v.length ? '✖ ' + r.v.map((x) => x.inv).join(', ') : '✔'} |`).join('\n') + '\n';
  out('report.md', md); out('results.json', results);
  emit({ event: 'report', clusters: cl.map((c) => ({ inv: c.inv, field: c.field, layer: c.layer, count: c.hits.length, example: c.hits[0].detail })), findings: [...findings.entries()].map(([k, f]) => ({ kind: k, count: f.scenarios.length, detail: f.detail })), passed, total: results.length, assertions, exact });
  say(`\nREPORT: ${passed}/${results.length} scenarios passed · ${exact}/${assertions} exact · ${cl.length} root-cause cluster(s) · ${findings.size} product finding(s)`, cl.length ? 'bad' : 'ok');
  for (const [i, c] of cl.entries()) say(`  P${i + 1} ${c.inv} · ${c.field} [${c.layer}] ×${c.hits.length}: ${c.hits[0].detail}`, 'bad');
  for (const [k, f] of findings) say(`  finding ${k} ×${f.scenarios.length}: ${f.detail}`, 'warn');
  say(`  full report: ${OUT}report.md`, 'dim');
}

// ───────── CLI ─────────
const [cmd] = process.argv.slice(2);
const argN = (name: string, d: number) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : d; };
const full = process.argv.includes('--full');
(async () => {
  if (cmd === 'learn') { await discover(); return; }
  if (cmd === 'plan') { const p = plan(full); console.log(`${allCombos().length} possible → ${p.length} planned`); for (const s of p) console.log(`${s.id}  ${s.title}`); return; }
  if (cmd === 'run') { if (!existsSync(OUT + 'model.json')) { say('No model yet: learning it first (on the current build).', 'warn'); await discover(); } await withLock('auto-engine', () => run(argN('--limit', 999), full)); return; }
  console.log('usage: engine.ts learn | plan [--full] | run [--limit N] [--full] [--events]');
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
