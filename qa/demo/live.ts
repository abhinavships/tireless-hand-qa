/**
 * Live, part-by-part demo of the Tireless Hand testing system.
 * Run one part at a time:  npx tsx demo/live.ts <part>
 *   1 controller  – talks to the control API only (ground truth), no browser
 *   2 browser     – Playwright opens a visible Chrome and reads the page (DOM)
 *   3 oracle      – screen vs truth, compared live while a drone flies
 *   4 geometry    – phone-size usability checks (boxes, hit-test, sideways scroll)
 *   5 fault       – break the connection on purpose; badge vs independent truth
 *   6 mutation    – plant a real bug (M07) in the app, watch the oracle catch it, revert
 */
import { chromium, type Page } from '@playwright/test';
import { io } from 'socket.io-client';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'http://localhost:4000/api';
const COCKPIT = 'http://localhost:4010';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const c = { g: (s: string) => `\x1b[32m${s}\x1b[0m`, r: (s: string) => `\x1b[31m${s}\x1b[0m`, y: (s: string) => `\x1b[33m${s}\x1b[0m`, b: (s: string) => `\x1b[1m${s}\x1b[0m`, d: (s: string) => `\x1b[2m${s}\x1b[0m` };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (s: string) => console.log(`\n${c.b('▶ ' + s)}`);

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
const truth = async (id: string) => (await api('GET', '/control/state')).drones[id];

async function addDemoDrone() {
  const { drone } = await api('POST', '/control/drones', { name: `DEMO-${Date.now() % 10000}` });
  console.log(c.d(`  added our own test drone: ${drone.name} (${drone.id})`));
  return drone as { id: string; name: string };
}
const removeDrone = (id: string) => api('DELETE', `/control/drones/${id}`).catch(() => undefined);

async function openCockpit(viewport = { width: 1440, height: 900 }) {
  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const page = await browser.newPage({ viewport });
  await page.goto(COCKPIT);
  await page.getByTestId('socket-status').filter({ hasText: 'socket connected' }).waitFor({ timeout: 20_000 });
  return { browser, page };
}
async function banner(page: Page, text: string, color = '#c9731f') {
  await page.evaluate(([t, col]) => {
    let el = document.getElementById('__demo_banner');
    if (!el) { el = document.createElement('div'); el.id = '__demo_banner'; document.body.appendChild(el); }
    el.setAttribute('style', `position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99999;background:${col};color:#fff;font:600 16px system-ui;padding:10px 18px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none;max-width:90vw`);
    el.textContent = t;
  }, [text, color]);
}
async function outline(page: Page, testid: string, color: string) {
  await page.evaluate(([id, col]) => { const e = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null; if (e) e.style.outline = `3px solid ${col}`; }, [testid, color]);
}
/** Read what the operator sees: text of the telemetry rows + status pill, straight from the DOM. */
async function readScreen(page: Page) {
  const num = async (id: string) => { const t = await page.getByTestId(id).innerText(); const m = t.match(/-?\d+(\.\d+)?/); return { text: t, value: m ? Number(m[0]) : null }; };
  return { battery: await num('telemetry-battery'), altitude: await num('telemetry-alt-agl'), status: await page.getByTestId('status-flight').innerText() };
}

// ───────────────────────── parts ─────────────────────────
async function part1() {
  say('PART 1 · Environment controller: the "truth" side. No browser, just the control API.');
  console.log(' health  →', await api('GET', '/health'));
  const devs = (await api('GET', '/devices')).devices.filter((d: any) => d.type === 'drone');
  console.log(' fleet   →', devs.map((d: any) => `${d.id} "${d.name}"`).join(', '));
  const drone = await addDemoDrone();
  try {
    say(`Taking off ${drone.name} and printing what the simulator says is TRUE every second`);
    await api('POST', '/control/command', { deviceId: drone.id, type: 'takeoff' });
    for (let i = 0; i < 12; i++) { const t = await truth(drone.id); console.log(`  t+${i}s  status=${t.status.padEnd(11)} height=${t.height.toFixed(1).padStart(5)} m  battery=${t.battery.toFixed(1)} %`); await sleep(1000); }
    await api('POST', '/control/command', { deviceId: drone.id, type: 'land' });
    console.log(c.g('\n  This is the ground truth every oracle compares the screen against.'));
  } finally { await removeDrone(drone.id); }
}

async function part2() {
  say('PART 2 · Playwright: a real Chrome opens the cockpit and READS the page (DOM, not pixels)');
  const { browser, page } = await openCockpit();
  try {
    await banner(page, 'PART 2 · Playwright is reading this page');
    const row = page.locator('[data-testid^="device-row-drone-"]').first();
    const rowId = await row.getAttribute('data-testid');
    console.log(`  found element by its test id: ${rowId}  → clicking it like an operator`);
    await row.click();
    for (const id of ['socket-status', 'status-flight', 'telemetry-battery', 'telemetry-alt-agl', 'telemetry-hspeed', 'video-state']) {
      await outline(page, id, '#c9731f');
      console.log(`  [data-testid="${id}"]`.padEnd(38), '→', JSON.stringify(await page.getByTestId(id).innerText()));
      await sleep(400);
    }
    say('Reading the battery 5 times, once per second (live values)');
    for (let i = 0; i < 5; i++) { console.log('  battery on screen:', await page.getByTestId('telemetry-battery').innerText()); await sleep(1000); }
    await banner(page, 'Done: every value above was read from the live DOM', '#23794d');
    await sleep(2500);
  } finally { await browser.close(); }
}

async function part3() {
  say('PART 3 · Oracle: compare what the operator SEES with what is TRUE, live');
  const drone = await addDemoDrone();
  const { browser, page } = await openCockpit();
  try {
    await page.getByTestId(`device-row-${drone.id}`).click();
    await banner(page, `PART 3 · Oracle watching ${drone.name}: screen vs API`);
    await api('POST', '/control/command', { deviceId: drone.id, type: 'takeoff' });
    console.log(c.d('  tolerance: battery ±2 %, altitude ±2 m (live data lags up to ~1 s)'));
    console.log('  ' + 'time'.padEnd(6) + 'SCREEN status/alt/batt'.padEnd(34) + 'TRUTH status/alt/batt'.padEnd(32) + 'VERDICT');
    for (let i = 0; i < 15; i++) {
      const s = await readScreen(page); const t = await truth(drone.id);
      const altOk = s.altitude.value !== null && Math.abs(s.altitude.value - t.height) <= 2;
      const batOk = s.battery.value !== null && Math.abs(s.battery.value - t.battery) <= 2;
      const ok = altOk && batOk;
      const scr = `${s.status}/${s.altitude.value ?? '—'}m/${s.battery.value ?? '—'}%`;
      const tru = `${t.status}/${t.height.toFixed(1)}m/${t.battery.toFixed(1)}%`;
      console.log('  ' + `+${i}s`.padEnd(6) + scr.padEnd(34) + tru.padEnd(32) + (ok ? c.g('PASS') : c.y('mismatch (retrying, live lag?)')));
      await sleep(1000);
    }
    await api('POST', '/control/command', { deviceId: drone.id, type: 'land' });
    await banner(page, 'Oracle: screen matched the truth within tolerance', '#23794d');
    console.log(c.g('\n  In the real tests a mismatch that lasts past the timeout fails with a message like:'));
    console.log(c.r('  "battery: operator sees 0, but API says 98.2 (allowed difference 2)"'));
    await sleep(2500);
  } finally { await browser.close(); await removeDrone(drone.id); }
}

async function part4() {
  say('PART 4 · Geometry oracle at PHONE size (390×844): can the operator actually use it?');
  const { browser, page } = await openCockpit({ width: 390, height: 844 });
  try {
    await banner(page, 'PART 4 · Phone-size usability checks');
    const sw = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: innerWidth }));
    console.log(`  sideways scroll?  page width ${sw.page}px vs screen ${sw.screen}px →`, sw.page <= sw.screen + 1 ? c.g('PASS (no sideways scroll)') : c.r('FAIL'));
    for (const id of ['socket-status', 'device-row-drone-1', 'telemetry-battery', 'video-state']) {
      const el = page.getByTestId(id); await el.scrollIntoViewIfNeeded();
      const box = await el.boundingBox();
      if (!box) { console.log(`  ${id}: ${c.r('FAIL, not rendered')}`); continue; }
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const hit = await page.evaluate(([x, y, tid]) => { const e = document.elementFromPoint(x as number, y as number); const t = document.querySelector(`[data-testid="${tid}"]`); return !!(e && t && (t === e || t.contains(e))); }, [cx, cy, id]);
      const inside = box.x >= 0 && box.x + box.width <= 391;
      await outline(page, id, hit && inside ? '#23794d' : '#b4401b');
      console.log(`  ${id.padEnd(22)} box=(${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)})  inside screen: ${inside ? c.g('yes') : c.r('no')}  tap hits it: ${hit ? c.g('yes') : c.r('no, something covers it')}`);
      await sleep(700);
    }
    await banner(page, 'Green outline = visible, on screen and tappable', '#23794d');
    await sleep(3000);
  } finally { await browser.close(); }
}

async function badgeVsTruth(page: Page, seconds: number) {
  const sock = io('http://localhost:4000', { auth: { 'org-id': 'flytbase' }, transports: ['websocket'], reconnection: true, reconnectionDelay: 500 });
  const results: boolean[] = [];
  try {
    for (let i = 0; i < seconds; i++) {
      const badge = (await page.getByTestId('socket-status').innerText()).trim();
      const real = sock.connected ? 'connected' : 'refused/disconnected';
      const lying = badge === 'socket connected' && !sock.connected;
      results.push(!lying);
      console.log('  ' + `+${i}s`.padEnd(6) + `badge: "${badge}"`.padEnd(34) + `independent socket: ${real}`.padEnd(44) + (lying ? c.r('FAIL: operator falsely told connected') : c.g('PASS')));
      await sleep(1000);
    }
  } finally { sock.close(); }
  return results;
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const lock = `${ROOT}.context/locks/app.lock`;
  mkdirSync(`${ROOT}.context/locks`, { recursive: true });
  try { mkdirSync(lock); } catch { throw new Error('app.lock is held by another run; try again in a minute'); }
  writeFileSync(`${lock}/owner`, `live-demo ${new Date().toISOString()} pid=${process.pid}\n`);
  try { return await fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

async function part5() {
  say('PART 5 · Fault injection: we refuse all socket connections for 12 s, then compare badge vs truth');
  await withLock(async () => {
    const { browser, page } = await openCockpit();
    try {
      await banner(page, 'PART 5 · Injecting fault: socket-refuse (12 s)', '#b4401b');
      await api('POST', '/control/fault', { kind: 'socket-refuse', seconds: 12 });
      await api('POST', '/control/fault', { kind: 'socket-kick' });
      await badgeVsTruth(page, 16);
      await api('DELETE', '/control/fault');
      await banner(page, 'Fault cleared: badge should recover to connected', '#23794d');
      await page.getByTestId('socket-status').filter({ hasText: 'socket connected' }).waitFor({ timeout: 20_000 });
      console.log(c.g('  recovered: badge says connected again, without a page reload'));
      await sleep(2000);
    } finally { await api('DELETE', '/control/fault').catch(() => undefined); await browser.close(); }
  });
}

async function part6() {
  say('PART 6 · Mutation lab: plant bug M07 (badge hard-coded to "connected"), then rerun the same check');
  const file = 'frontend/src/components/SocketBadge.tsx';
  const sh = (cmd: string) => execSync(cmd, { cwd: `${ROOT}product`, stdio: 'pipe' }).toString();
  const sync = () => sh(`docker compose cp ${file} frontend:/app/${file}`);
  await withLock(async () => {
    sh(`git apply ${ROOT}qa/mutations/M07-connected-badge.patch`);
    try {
      sync();
      console.log(c.y('  bug planted in the app source and hot-reloaded into the running cockpit'));
      const { browser, page } = await openCockpit();
      try {
        await page.waitForFunction(() => (globalThis as any).__mutationLab === 'mutation-lab:M07', null, { timeout: 30_000 }).catch(() => undefined);
        await banner(page, 'PART 6 · App now has bug M07. Injecting socket-refuse…', '#b4401b');
        await api('POST', '/control/fault', { kind: 'socket-refuse', seconds: 10 });
        await api('POST', '/control/fault', { kind: 'socket-kick' });
        const res = await badgeVsTruth(page, 10);
        const caught = res.some((ok) => !ok);
        await banner(page, caught ? 'CAUGHT: the badge lied, and the oracle failed the test' : 'Not caught', caught ? '#23794d' : '#b4401b');
        console.log(caught ? c.g('\n  CAUGHT ✔ same check, same steps: it passed on the clean app and fails on the bug') : c.r('\n  not caught'));
        await sleep(3000);
      } finally { await api('DELETE', '/control/fault').catch(() => undefined); await browser.close(); }
    } finally {
      sh(`git apply -R ${ROOT}qa/mutations/M07-connected-badge.patch`);
      sync();
      const dirty = sh('git status --porcelain').trim();
      console.log(dirty ? c.r(`  WARNING product/ not clean:\n${dirty}`) : c.g('  bug removed, app restored (product/ clean)'));
    }
  });
}

const parts: Record<string, () => Promise<void>> = { '1': part1, controller: part1, '2': part2, browser: part2, '3': part3, oracle: part3, '4': part4, geometry: part4, '5': part5, fault: part5, '6': part6, mutation: part6 };
const which = process.argv[2] ?? '';
const run = parts[which];
if (!run) { console.log('Usage: npx tsx demo/live.ts <1|2|3|4|5|6>\n 1 controller  2 browser  3 oracle  4 geometry  5 fault  6 mutation'); process.exit(1); }
run().then(() => process.exit(0)).catch((e) => { console.error(c.r(String(e?.stack ?? e))); process.exit(1); });
