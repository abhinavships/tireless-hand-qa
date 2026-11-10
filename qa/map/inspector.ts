/**
 * BLIND MAP INSPECTOR: tests the Cesium map as a map. It is told nothing about any planted bug.
 * It reads the live scene graph (anatomy.ts), the websocket messages the browser received (wire),
 * and the learned map model (map-model.json), and checks 15 map invariants with tolerances calibrated on the clean build.
 *   npx tsx map/inspector.ts        (PACE=1.5 slower, HEADLESS=0 shows the window)
 */
import { chromium, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { snapshot, pickAt, groundAt, metres, type MapSnapshot, type MapEntity } from './anatomy.js';
import { Tap, api, sleep } from '../auto/lib.js';
import type { MapModel } from './learn.js';
import { evaluate, type Check } from './contract.js';

const PACE = Number(process.env.PACE ?? 1);
const model = JSON.parse(readFileSync(fileURLToPath(new URL('./out/map-model.json', import.meta.url)), 'utf8')) as MapModel;
const say = (ev: Record<string, unknown>) => process.stdout.write(JSON.stringify({ from: 'map', ...ev }) + '\n');
const log = (text: string, level = 'info') => say({ event: 'log', text, level });
const cmd = (text: string) => { say({ event: 'cmd', text }); ui(`▶ ${text}`, 'cmd'); };
const pause = (ms = 1000) => sleep(ms * PACE);
/** Headed runs: show every step and result on screen, like a narrated Playwright run (pointer-events: none, so it never blocks clicks). */
const HEADED = process.env.HEADLESS === '0'; let UI: Page | undefined;
const ui = (text: string, tone: 'step' | 'cmd' | 'pass' | 'fail' | 'warn' = 'step') => { if (!HEADED || !UI) return; UI.evaluate(([t, k]) => {
  let b = document.getElementById('qa-step') as HTMLDivElement | null;
  if (!b) { b = document.createElement('div'); b.id = 'qa-step'; Object.assign(b.style, { position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)', maxWidth: 'min(70vw, 760px)', padding: '8px 14px', borderRadius: '8px', font: '600 14px/1.35 system-ui, sans-serif', color: '#fff', pointerEvents: 'none', zIndex: '2147483647', boxShadow: '0 4px 18px rgba(0,0,0,.45)', textAlign: 'center' }); document.body.appendChild(b); }
  b.style.background = ({ step: 'rgba(15,23,42,.92)', cmd: 'rgba(30,64,120,.92)', pass: 'rgba(22,120,70,.94)', fail: 'rgba(190,40,30,.95)', warn: 'rgba(160,110,0,.94)' } as Record<string, string>)[k];
  b.textContent = t;
}, [text, tone] as const).catch(() => undefined); };
/** Learned tolerance for a metric (calibrated on the clean build), or the old hand-picked constant for old models. */
const tol = (k: keyof NonNullable<MapModel['cal']>, fallback: number) => { const st = model.cal?.[k]; return typeof st === 'object' && Number.isFinite(st.tol) ? st.tol : fallback; };
const TOL = { pos: tol('posErr', 1), heading: tol('headingErr', 2), height: tol('heightErr', 1), dist: tol('distErr', 3), gap: tol('trackGap', 3), latency: tol('latency', 600) };
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };
const fmt = (ms: number) => Number.isFinite(ms) ? `${Math.round(ms)} ms` : 'never';

const CHECKS = [
  { id: 'G1', title: 'Every drone and dock is on the map', why: 'Each device the backend knows must have a visible map object.' },
  { id: 'G2', title: 'Drone is drawn where it really is', why: 'Map position must equal the last reported latitude/longitude (within 1 m).' },
  { id: 'G3', title: 'Height is drawn and labelled correctly', why: 'Height label and 3D height above take-off must equal the reported height.' },
  { id: 'G4', title: 'Drone model points the right way', why: 'Model heading must equal the reported yaw (within 2°).' },
  { id: 'G5', title: 'Map label shows the current status', why: 'The label must read "<name> <current flight status>".' },
  { id: 'G6', title: 'Map distance agrees with the telemetry panel', why: 'Dock-to-drone distance on the map must equal "Dist. from home" (within 3 m).' },
  { id: 'G7', title: 'Flight track follows the drone and keeps growing', why: 'The track must end at the drone and gain points while it flies.' },
  { id: 'G8', title: 'Drone icon is visible and clickable', why: 'At the drone\'s pixel the map must draw the drone, and clicking it must select it.' },
  { id: 'G9', title: 'Camera flies to the selected drone', why: 'Selecting a drone must centre the map on the drone itself.' },
  { id: 'G10', title: 'Selected drone is highlighted, others are not', why: 'Selection styling must match the learned selected/unselected look.' },
  { id: 'G11', title: '2D is top-down, 3D is oblique', why: 'The view buttons must set the learned camera pitch.' },
  { id: 'G12', title: 'Removed drones disappear from the map', why: 'Deleting a drone must remove it, its track, height line and label.' },
  { id: 'G13', title: 'Stale docks look offline', why: 'When a dock stops reporting, its icon must switch to offline within a few seconds.' },
  { id: 'G15', title: 'Icon census: one known icon per device, nothing extra', why: 'Every drone has exactly one visible drone model and every dock one dock icon, all from the learned icon set; no icons for devices that do not exist.' },
  { id: 'G14', title: 'Map shows the newest telemetry, not an old frame', why: 'Each position message must reach the map within the learned wire-to-map latency.' },
] as const;
type Gid = typeof CHECKS[number]['id'];
const failures: { id: string; title: string; message: string; layer?: string }[] = []; const findings: { id: Gid; message: string }[] = [];
const pass = (id: Gid, m: string) => { say({ event: 'check', id, status: 'pass', message: m }); log(`${id} PASS: ${m}`, 'ok'); ui(`✔ ${id} PASS · ${m}`, 'pass'); };
const fail = (id: Gid, m: string) => { const c = CHECKS.find((x) => x.id === id)!; failures.push({ id, title: c.title, message: m, layer: 'map rendering' }); say({ event: 'check', id, status: 'fail', message: m }); log(`${id} PROBLEM: ${m}`, 'bad'); ui(`✖ ${id} BUG · ${m}`, 'fail'); };
const finding = (id: Gid, m: string) => { findings.push({ id, message: m }); say({ event: 'check', id, status: 'finding', message: m }); log(`${id} FINDING (true on the known-good build too): ${m}`, 'warn'); ui(`! ${id} known product finding · ${m}`, 'warn'); };
const compare = (title: string, screen: Record<string, string>, truth: Record<string, string>, ok: boolean | null, note: string) => say({ event: 'compare', title, screen, truth, ok, note });
const angle = (a: number, b: number) => { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; };

async function main() {
  // Checks the agent discovered itself (npm run map:discover): proposed by the local LLM, kept only if they held on the clean build.
  const DISC_FILE = fileURLToPath(new URL('./out/discovered.json', import.meta.url));
  const DISC: Check[] = existsSync(DISC_FILE) ? (JSON.parse(readFileSync(DISC_FILE, 'utf8')).kept as Check[]).filter((c) => c.type === 'text' || (c.tolerance ?? 1) <= 5) : [];
  say({ event: 'plan', checks: [...CHECKS, ...DISC.map((c) => ({ id: c.id, title: c.title, why: c.why }))] });
  log('Blind map inspection: I have not been told whether anything is broken.', 'warn');
  log(model.cal ? `tolerances learned on the clean build: position ${TOL.pos} m · heading ${TOL.heading}° · height ${TOL.height} m · distance ${TOL.dist} m · track ${TOL.gap} m · latency ${TOL.latency} ms` : 'no calibration in the map model: using default tolerances', 'dim');
  const tap = new Tap();
  // Headed runs expose the same browser over CDP (:9222) so a human or DevTools can inspect the map while QA runs.
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: process.env.HEADLESS === '0' ? ['--remote-debugging-port=9222'] : [] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); tap.attach(page); UI = page;
  const cdp = await page.context().newCDPSession(page); let last = 0;
  cdp.on('Page.screencastFrame', (f: any) => { cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined); if (Date.now() - last > 140) { last = Date.now(); say({ event: 'frame', data: f.data }); } });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 58, maxWidth: 1280, maxHeight: 900 });
  const gp = (id: string, n = 3) => (tap.frames.get(`flytbase/${id}/telemetry/global_position`) ?? []).slice(-n).map((f) => f.payload);
  const lastOf = (id: string, attr: string, n = 3) => (tap.frames.get(`flytbase/${id}/telemetry/${attr}`) ?? []).slice(-n).map((f) => f.payload);
  const ent = (s: MapSnapshot, id: string) => s.entities.find((e) => e.id === id);
  const run = async (id: Gid, fn: () => Promise<void>) => {
    const c = CHECKS.find((x) => x.id === id)!; say({ event: 'check', id, status: 'running', message: c.why }); log(`── ${id} · ${c.title}`, 'warn');
    ui(`${id} · ${c.title} — checking…`); await pause(HEADED ? 1600 : 900);
    try { await fn(); } catch (e: any) { fail(id, `could not complete: ${String(e?.message ?? e).split('\n')[0]}`); }
    await pause(700);
  };
  let P: { id: string; name: string; dockId: string } | undefined; let T: { id: string; dockId: string } | undefined;
  try {
    cmd('page.goto("http://localhost:4010")'); await page.goto('http://localhost:4010');
    await page.locator('[data-testid^="device-row-"]').first().waitFor({ timeout: 20_000 }); await sleep(4000);
    const r = await api('POST', '/control/drones', { name: `MAPQA-${Date.now() % 10000}` }); P = { ...r.drone, dockId: r.dock.id };
    cmd(`POST /api/control/drones → ${P!.id}`); await page.getByTestId(`device-row-${P!.id}`).waitFor({ timeout: 10_000 });
    await page.getByTestId(`device-row-${P!.id}`).click(); await sleep(2500);

    await run('G1', async () => {
      const devs = ((await api('GET', '/devices')).devices as any[]); const s = await snapshot(page);
      const missing = devs.filter((d) => { const e = ent(s, d.id); return !e || !e.show || (d.type === 'drone' ? e.modelShow === false : e.bbShow === false); });
      compare('G1 · devices on the map', { 'Map objects shown': String(devs.length - missing.length) }, { 'Devices in backend': String(devs.length) }, !missing.length, missing.length ? `Missing: ${missing.map((d) => d.name).join(', ')}` : 'Every device has a map object');
      missing.length ? fail('G1', `no visible map object for ${missing.map((d) => d.name).join(', ')}`) : pass('G1', `all ${devs.length} drones and docks are on the map`);
    });

    await run('G15', async () => {
      const devs = ((await api('GET', '/devices')).devices as any[]); const ids = new Set(devs.map((d) => d.id)); const s = await snapshot(page);
      const droneIcons = new Set([model.selectedModel, model.unselectedModel]); const dockIcons = new Set([model.dockSelected, model.dockUnselected, ...model.dockOffline]);
      const icons = s.entities.filter((e) => (e.kind === 'drone' && e.model && e.modelShow !== false) || (e.kind === 'dock' && e.image && e.bbShow !== false));
      const extra = icons.filter((e) => !ids.has(e.owner)).map((e) => e.id);
      const unknown = icons.filter((e) => ids.has(e.owner) && !(e.kind === 'drone' ? droneIcons.has(e.model!) : dockIcons.has(e.image!))).map((e) => `${e.id} uses "${String(e.kind === 'drone' ? e.model : e.image).split('/').pop()}"`);
      const tiny = icons.filter((e) => e.kind === 'drone' && ((e.minPx ?? 64) < 8 && (e.scale ?? 1) < 0.1)).map((e) => e.id);
      const shown = devs.filter((d) => d.type === 'dock' || tap.frames.has(`flytbase/${d.id}/telemetry/global_position`));
      const noIcon = shown.filter((d) => !icons.some((e) => e.id === d.id)).map((d) => d.name);
      const ok = !extra.length && !unknown.length && !tiny.length && !noIcon.length;
      compare('G15 · icon census', { 'Drone icons': String(icons.filter((e) => e.kind === 'drone').length), 'Dock icons': String(icons.filter((e) => e.kind === 'dock').length) }, { Drones: String(devs.filter((d) => d.type === 'drone').length), Docks: String(devs.filter((d) => d.type === 'dock').length) }, ok, ok ? 'One known icon per device' : [extra.length && `extra: ${extra.join(', ')}`, noIcon.length && `no icon: ${noIcon.join(', ')}`, unknown.length && `unknown icon: ${unknown.join(', ')}`, tiny.length && `invisibly small: ${tiny.join(', ')}`].filter(Boolean).join(' · '));
      ok ? pass('G15', `${icons.length} icons for ${devs.length} devices, all from the learned icon set`) : fail('G15', [extra.length && `icons drawn for devices that do not exist (${extra.join(', ')})`, noIcon.length && `no icon on the map for ${noIcon.join(', ')}`, unknown.length && `unexpected icon: ${unknown.join(', ')}`, tiny.length && `drone icon too small to see: ${tiny.join(', ')}`].filter(Boolean).join('; '));
    });

    await run('G11', async () => {
      cmd('click [data-testid="map-view-2d"]'); await page.getByTestId('map-view-2d').click(); await sleep(2000); const p2 = (await snapshot(page)).camera.pitch;
      cmd('click [data-testid="map-view-3d"]'); await page.getByTestId('map-view-3d').click(); await sleep(2000); const p3 = (await snapshot(page)).camera.pitch;
      const ok = Math.abs(p2 - model.pitch2d) <= 3 && Math.abs(p3 - model.pitch3d) <= 3;
      compare('G11 · camera pitch', { '2D view': `${p2.toFixed(0)}°`, '3D view': `${p3.toFixed(0)}°` }, { '2D expected': `${model.pitch2d}° (top-down)`, '3D expected': `${model.pitch3d}°` }, ok, ok ? 'Both views correct' : 'View does not match');
      ok ? pass('G11', `2D ${p2.toFixed(0)}°, 3D ${p3.toFixed(0)}°`) : fail('G11', `2D view pitch is ${p2.toFixed(0)}° (expected ${model.pitch2d}°), 3D is ${p3.toFixed(0)}° (expected ${model.pitch3d}°)`);
      await page.getByTestId('map-view-2d').click(); await sleep(1500);
    });

    cmd(`POST /api/control/command {deviceId:"${P!.id}",type:"takeoff"}`); await api('POST', '/control/command', { deviceId: P!.id, type: 'takeoff' });
    log('waiting until the drone has flown far enough from its dock (about 20 s)…', 'dim');
    for (let i = 0; i < 60; i++) { const g = gp(P!.id, 1)[0]; if (g && g.home_position.distance > 70) break; await sleep(500); }

    await run('G2', async () => {
      let worst = 0;
      for (let i = 0; i < 4; i++) {
        const s = await snapshot(page); const e = ent(s, P!.id)!; const d = Math.min(...gp(P!.id).map((g) => metres({ lon: e.lon!, lat: e.lat! }, { lon: g.position.longitude, lat: g.position.latitude })));
        worst = Math.max(worst, d); const g = gp(P!.id, 1)[0];
        compare('G2 · map position vs reported position', { 'Map lat, lon': `${e.lat!.toFixed(6)}, ${e.lon!.toFixed(6)}` }, { 'Reported lat, lon': `${g.position.latitude.toFixed(6)}, ${g.position.longitude.toFixed(6)}` }, d <= TOL.pos, `Error ${d.toFixed(1)} m (tolerance ${TOL.pos} m)`);
        await pause(700);
      }
      worst <= TOL.pos ? pass('G2', `map position within ${worst.toFixed(2)} m of the reported position (tolerance ${TOL.pos} m)`) : fail('G2', `the drone is drawn ${worst.toFixed(0)} m away from where it really is`);
    });

    await run('G3', async () => {
      const s = await snapshot(page); const e = ent(s, P!.id)!; const hl = ent(s, `hlabel:${P!.id}`); const frames = gp(P!.id);
      const home = frames[frames.length - 1].home_position; const g = await groundAt(page, home.longitude, home.latitude);
      const rel = e.h! - (g ?? 0); const labelOk = frames.some((f) => hl?.label === `${Math.round(f.position.height)} m`); const hOk = frames.some((f) => Math.abs(rel - f.position.height) <= TOL.height);
      compare('G3 · height', { 'Height label': hl?.label ?? '(none)', '3D height above take-off': `${rel.toFixed(1)} m` }, { 'Reported height': `${frames[frames.length - 1].position.height.toFixed(1)} m` }, labelOk && hOk, labelOk && hOk ? 'Label and 3D height match' : 'Height is wrong');
      labelOk && hOk ? pass('G3', `label "${hl?.label}" and 3D height ${rel.toFixed(1)} m match the reported height`) : fail('G3', `${labelOk ? '' : `height label says "${hl?.label}" but the drone is at ${frames[frames.length - 1].position.height.toFixed(0)} m; `}${hOk ? '' : `3D height above take-off is ${rel.toFixed(1)} m`}`.replace(/; $/, ''));
    });

    await run('G4', async () => {
      const s = await snapshot(page); const e = ent(s, P!.id)!; const yaws = lastOf(P!.id, 'attitude').map((a) => a.yaw);
      const d = Math.min(...yaws.map((y) => angle(e.heading ?? 999, y)));
      compare('G4 · model heading', { 'Model heading': `${(e.heading ?? NaN).toFixed(0)}°` }, { 'Reported yaw': `${yaws[yaws.length - 1]}°` }, d <= TOL.heading, `Off by ${d.toFixed(0)}° (tolerance ${TOL.heading}°)`);
      d <= TOL.heading ? pass('G4', `model heading ${(e.heading ?? 0).toFixed(0)}° matches yaw`) : fail('G4', `the model points ${(e.heading ?? 0).toFixed(0)}° but the drone's yaw is ${yaws[yaws.length - 1]}° (${d.toFixed(0)}° off)`);
    });

    await run('G5', async () => {
      const s = await snapshot(page); const e = ent(s, P!.id)!; const sts = lastOf(P!.id, 'flight_status').map((f) => f.flight_status);
      const ok = sts.some((st) => e.label === `${P!.name} ${st}`);
      compare('G5 · map label', { 'Map label': e.label ?? '(none)' }, { 'Current status': `${P!.name} ${sts[sts.length - 1]}` }, ok, ok ? 'Label is current' : 'Label shows a different status');
      ok ? pass('G5', `label reads "${e.label}"`) : fail('G5', `map label says "${e.label}" but the drone is ${sts[sts.length - 1]}`);
    });

    await run('G6', async () => {
      const s = await snapshot(page); const e = ent(s, P!.id)!; const d = ent(s, P!.dockId)!; const m = metres({ lon: d.lon!, lat: d.lat! }, { lon: e.lon!, lat: e.lat! });
      const dists = gp(P!.id).map((g) => g.home_position.distance); const ok = dists.some((x) => Math.abs(x - m) <= TOL.dist);
      const panel = await page.getByTestId('telemetry-home-distance').innerText().catch(() => '?');
      compare('G6 · distance', { 'Dock → drone on the map': `${m.toFixed(0)} m` }, { 'Dist. from home (panel)': panel }, ok, ok ? 'Map and panel agree' : 'Map and panel disagree');
      ok ? pass('G6', `map distance ${m.toFixed(0)} m matches "Dist. from home" ${panel}`) : fail('G6', `on the map the drone is ${m.toFixed(0)} m from its dock, but the panel says ${panel}`);
    });

    await run('G7', async () => {
      const s1 = await snapshot(page); const t1 = ent(s1, `track:${P!.id}`); await sleep(3000); const s2 = await snapshot(page); const t2 = ent(s2, `track:${P!.id}`); const e = ent(s2, P!.id)!;
      const n1 = t1?.points?.length ?? 0, n2 = t2?.points?.length ?? 0; const end = t2?.points?.length ? metres({ lon: t2.points[t2.points.length - 1][0], lat: t2.points[t2.points.length - 1][1] }, { lon: e.lon!, lat: e.lat! }) : Infinity;
      const ok = n2 > n1 && end <= TOL.gap;
      compare('G7 · flight track', { 'Track points': `${n1} → ${n2}`, 'Track end → drone': `${Number.isFinite(end) ? end.toFixed(1) : '∞'} m` }, { Expected: 'grows, ends at the drone' }, ok, ok ? 'Track follows the drone' : 'Track is not following');
      ok ? pass('G7', `track grew ${n1} → ${n2} points and ends ${end.toFixed(1)} m from the drone`) : fail('G7', n2 <= n1 ? `the track stopped growing (${n1} → ${n2} points) and ends ${end.toFixed(0)} m behind the drone` : `the track ends ${end.toFixed(0)} m from the drone`);
    });

    await run('G14', async () => {
      // Watch every position message for a few seconds and time how long until the map draws it (or something newer).
      const topic = `flytbase/${P!.id}/telemetry/global_position`; const seen = new Map<number, number>(); const t0 = Date.now(); const match = Math.max(0.5, TOL.pos);
      while (Date.now() - t0 < 7000) {
        const s = await snapshot(page); const now = Date.now(); const e = ent(s, P!.id); const recent = (tap.frames.get(topic) ?? []).slice(-6); let shown = -1;
        if (e?.lon != null) recent.forEach((f, i) => { if (metres({ lon: e.lon!, lat: e.lat! }, { lon: f.payload.position.longitude, lat: f.payload.position.latitude }) < match) shown = i; });
        for (const f of recent.slice(0, shown + 1)) if (!seen.has(f.t)) seen.set(f.t, now - f.t);
        await sleep(90);
      }
      const due = (tap.frames.get(topic) ?? []).filter((f) => f.t >= t0 && f.t <= Date.now() - TOL.latency - 200);
      const lat = due.map((f) => seen.get(f.t) ?? Infinity); const late = lat.filter((x) => x > TOL.latency).length; const p50 = q(lat, 0.5);
      const ok = due.length >= 3 && late / due.length <= 0.2;
      compare('G14 · wire → map latency', { 'Messages drawn in time': `${due.length - late}/${due.length}`, 'Typical latency': fmt(p50) }, { 'Learned tolerance': `${TOL.latency} ms`, 'Clean build typical': model.cal ? `${model.cal.latency.p50} ms` : '?' }, ok, ok ? 'Map keeps up with the telemetry' : 'Map shows an older position than the operator has been sent');
      if (due.length < 3) fail('G14', `only ${due.length} position messages arrived in 7 s; cannot judge freshness`);
      else ok ? pass('G14', `${due.length - late}/${due.length} messages drawn within ${TOL.latency} ms (typical ${fmt(p50)})`) : fail('G14', `${late}/${due.length} position messages were not drawn within ${TOL.latency} ms (typical ${fmt(p50)}); the map shows the drone where it was, not where it is`);
    });

    if (DISC.length) log(`running ${DISC.length} discovered checks on the whole fleet`, 'warn');
    for (const c of DISC) {
      say({ event: 'check', id: c.id, status: 'running', message: c.why }); log(`── ${c.id} · ${c.title} (discovered)`, 'warn'); ui(`${c.id} · ${c.title} — checking every ${c.entity}…`); await pause(HEADED ? 1200 : 400);
      const devs = ((await api('GET', '/devices')).devices as any[]); const bad = new Map<string, { n: number; ex: string }>(); let evaluated = 0;
      for (let k = 0; k < 3; k++) { for (const o of evaluate(c, await snapshot(page), tap, devs)) { if (o.ok === null) continue; evaluated++; if (!o.ok) { const b = bad.get(o.device) ?? { n: 0, ex: '' }; b.n++; b.ex = `map ${o.screen} vs wire ${o.truth}`; bad.set(o.device, b); } } await sleep(700); }
      const broken = [...bad.entries()].filter(([, b]) => b.n >= 2);
      if (!evaluated) { say({ event: 'check', id: c.id, status: 'pass', message: 'not applicable right now' }); continue; }
      if (broken.length) { const m = `${broken.length} ${c.entity}(s) wrong: ${broken.slice(0, 3).map(([d, b]) => `${d} (${b.ex})`).join('; ')}`; failures.push({ id: c.id, title: c.title, message: m, layer: 'map rendering (discovered check)' }); say({ event: 'check', id: c.id, status: 'fail', message: m }); log(`${c.id} PROBLEM: ${m}`, 'bad'); ui(`✖ ${c.id} BUG · ${m}`, 'fail'); }
      else { const m = `holds for every ${c.entity} (${evaluated} comparisons)`; say({ event: 'check', id: c.id, status: 'pass', message: m }); log(`${c.id} PASS: ${m}`, 'ok'); ui(`✔ ${c.id} PASS · ${c.title}`, 'pass'); }
    }

    await run('G9', async () => {
      const others = ((await api('GET', '/devices')).devices as any[]).filter((d) => d.type === 'drone' && d.id !== P!.id);
      await page.getByTestId(`device-row-${others[0].id}`).click(); await sleep(2200);
      cmd(`select ${P!.name} in the device list`); await page.getByTestId(`device-row-${P!.id}`).click(); await sleep(2500);
      // The camera flies to where the drone was when it was selected; the drone keeps moving, so compare with its recent track.
      const s = await snapshot(page); const e = ent(s, P!.id)!; const tr = ent(s, `track:${P!.id}`)?.points ?? [];
      const recent = [...tr.slice(-12).map((p) => ({ lon: p[0], lat: p[1] })), { lon: e.lon!, lat: e.lat! }];
      const d = s.centre ? Math.min(...recent.map((q) => metres(s.centre!, q))) : Infinity;
      compare('G9 · camera after selection', { 'Map centre → drone path': `${d.toFixed(0)} m` }, { Expected: 'centred on the drone (≤ 15 m of its recent path)' }, d <= 15, d <= 15 ? 'Camera is on the drone' : 'Camera went somewhere else');
      d <= 15 ? pass('G9', `camera centred ${d.toFixed(0)} m from the selected drone's path`) : fail('G9', `after selecting ${P!.name}, the map centre is ${d.toFixed(0)} m away from the drone`);
    });

    await run('G10', async () => {
      const s = await snapshot(page); const e = ent(s, P!.id)!; const others = s.entities.filter((x) => x.kind === 'drone' && x.id !== P!.id);
      const badOthers = others.filter((o) => o.model !== model.unselectedModel); const selOk = e.model === model.selectedModel;
      compare('G10 · selection styling', { 'Selected drone model': String(e.model).split('/').pop()!, 'Others unselected': `${others.length - badOthers.length}/${others.length}` }, { 'Learned selected': String(model.selectedModel).split('/').pop()!, 'Learned unselected': String(model.unselectedModel).split('/').pop()! }, selOk && !badOthers.length, selOk && !badOthers.length ? 'Styling correct' : 'Styling wrong');
      selOk && !badOthers.length ? pass('G10', 'only the selected drone is highlighted') : fail('G10', `${selOk ? '' : `the selected drone uses "${String(e.model).split('/').pop()}"; `}${badOthers.length ? `${badOthers.length} unselected drone(s) are drawn highlighted` : ''}`.replace(/; $/, ''));
    });

    await run('G8', async () => {
      const s = await snapshot(page); const e = ent(s, P!.id)!; const [cw, ch] = s.canvas; const [x, y] = e.screen ?? [-1, -1];
      const inside = x >= 0 && y >= 0 && x <= cw && y <= ch; const picks = inside ? await pickAt(page, x, y) : [];
      const drawn = picks.includes(P!.id);
      const others = ((await api('GET', '/devices')).devices as any[]).filter((d) => d.type === 'drone' && d.id !== P!.id);
      await page.getByTestId(`device-row-${others[0].id}`).click(); await sleep(2200);
      // Pan the camera over the (now unselected) drone like an operator would, then click it on the map.
      const here = ent(await snapshot(page), P!.id)!;
      cmd(`pan the camera over ${P!.name}`);
      await page.evaluate(([lo, la]) => { const v = (window as any).__qaViewer; const c = v.scene.globe.ellipsoid.cartographicToCartesian({ longitude: lo * Math.PI / 180, latitude: la * Math.PI / 180, height: 1200 }); v.camera.setView({ destination: c, orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } }); v.scene.requestRender(); }, [here.lon!, here.lat!]);
      await sleep(1200);
      const s2 = await snapshot(page); const e2 = ent(s2, P!.id)!; let clicked = false; let covered = '';
      if (e2.screen && e2.screen[0] > 0 && e2.screen[1] > 0 && e2.screen[0] < s2.canvas[0] && e2.screen[1] < s2.canvas[1]) {
        const box = (await page.getByTestId('map-canvas').boundingBox())!; const px = box.x + e2.screen[0], py = box.y + e2.screen[1];
        covered = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el && el.tagName !== 'CANVAS' ? `${el.tagName.toLowerCase()}.${(el as HTMLElement).className}` : ''; }, [px, py]);
        cmd(`mouse.click on the map at the drone's pixel (${e2.screen[0].toFixed(0)}, ${e2.screen[1].toFixed(0)})`);
        await page.mouse.click(px, py); await sleep(1200);
        clicked = await page.getByTestId(`device-row-${P!.id}`).evaluate((el) => el.classList.contains('selected'));
      }
      if (covered) log(`note: a page element (${covered}) covers the drone at that pixel`, 'warn');
      compare('G8 · visible and clickable', { 'Drawn at its pixel': drawn ? 'yes' : `no (${picks.join(', ') || 'nothing'})`, 'Click selects it': clicked ? 'yes' : 'no' }, { Expected: 'drawn on top, clicking selects it' }, drawn && clicked, drawn && clicked ? 'Visible and clickable' : 'Operator cannot see or click the drone');
      drawn && clicked ? pass('G8', 'the drone is drawn at its position and clicking it selects it') : fail('G8', `${drawn ? '' : `nothing drawn for the drone at its position (map shows ${picks.join(', ') || 'nothing'} there); `}${clicked ? '' : 'clicking the drone on the map did not select it'}`.replace(/; $/, ''));
      await page.getByTestId(`device-row-${P!.id}`).click(); await sleep(1500);
    });

    await run('G12', async () => {
      const r2 = await api('POST', '/control/drones', { name: `GHOST-${Date.now() % 10000}` }); T = { id: r2.drone.id, dockId: r2.dock.id };
      let appeared = false; for (let i = 0; i < 12 && !appeared; i++) { appeared = !!ent(await snapshot(page), T.id); if (!appeared) await sleep(500); }
      cmd(`DELETE /api/control/drones/${T.id}`); await api('DELETE', `/control/drones/${T.id}`);
      let left: string[] = []; for (let i = 0; i < 12; i++) { const s = await snapshot(page); left = s.entities.filter((e) => e.owner === T!.id || e.owner === T!.dockId).map((e) => e.id); if (!left.length) break; await sleep(500); }
      T = undefined;
      compare('G12 · removed drone', { 'Map objects left after delete': String(left.length) }, { Expected: '0' }, appeared && !left.length, left.length ? `Ghosts: ${left.join(', ')}` : 'Cleanly removed');
      !appeared ? fail('G12', 'a newly added drone never appeared on the map') : left.length ? fail('G12', `the deleted drone is still drawn on the map (${left.join(', ')})`) : pass('G12', 'the deleted drone and all its map objects disappeared');
    });

    await run('G13', async () => {
      cmd('POST /api/control/fault {kind:"sim-offline",seconds:12}'); await api('POST', '/control/fault', { kind: 'sim-offline', seconds: 12 });
      await sleep(8000);
      const s = await snapshot(page); const docks = s.entities.filter((e) => e.kind === 'dock'); const stillOnline = docks.filter((d) => d.image === model.dockSelected || d.image === model.dockUnselected);
      compare('G13 · docks with no data for 8 s', { 'Docks showing online': `${stillOnline.length}/${docks.length}` }, { Expected: '0 (stale after 5 s)' }, !stillOnline.length, stillOnline.length ? 'Stale docks still look online' : 'Stale docks look offline');
      await api('DELETE', '/control/fault');
      if (!stillOnline.length) pass('G13', 'all stale docks switched to the offline icon');
      else if (!model.staleDocksGoOffline) finding('G13', `after 8 s without data, ${stillOnline.length}/${docks.length} docks still show the online icon (the map only redraws when a message arrives)`);
      else fail('G13', `after 8 s without data, ${stillOnline.length}/${docks.length} docks still show the online icon`);
      await sleep(5000);
    });
  } finally {
    await api('DELETE', '/control/fault').catch(() => undefined);
    if (T) await api('DELETE', `/control/drones/${T.id}`).catch(() => undefined);
    if (P) await api('DELETE', `/control/drones/${P.id}`).catch(() => undefined);
    if (HEADED) {
      // Final report card in the QA browser; stays up so the operator can read it.
      await page.evaluate(([f, fi]) => {
        document.getElementById('qa-step')?.remove();
        const d = document.createElement('div'); d.id = 'qa-report';
        Object.assign(d.style, { position: 'fixed', inset: '0', background: 'rgba(5,10,15,.78)', zIndex: '2147483647', display: 'grid', placeItems: 'center', font: '15px/1.45 system-ui, sans-serif', color: '#fff' });
        const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
        d.innerHTML = '<div style="background:#111b22;border:1px solid #2c3e48;border-radius:14px;padding:24px 28px;max-width:760px;width:90%">'
          + '<div style="font:600 12px ui-monospace,monospace;letter-spacing:.12em;color:#8fa2a6">BLIND MAP QA · RESULT</div>'
          + '<div style="font:700 30px system-ui;margin:6px 0 14px;color:' + (f.length ? '#ff8a72' : '#5bd394') + '">' + (f.length ? f.length + ' map bug' + (f.length > 1 ? 's' : '') + ' found' : 'No map bugs found') + '</div>'
          + f.map((x: any) => '<div style="margin:10px 0;padding:10px 12px;border-radius:8px;background:#3a1c16"><b>' + esc(x.id + ' · ' + x.title) + '</b><div style="color:#ffb4a6">' + esc(x.message) + '</div></div>').join('')
          + fi.map((x: any) => '<div style="margin:10px 0;padding:10px 12px;border-radius:8px;background:#352b10;color:#f0c44f">Known product finding ' + esc(x.id) + ': ' + esc(x.message) + '</div>').join('')
          + '<div style="color:#8fa2a6;font-size:13px;margin-top:12px">Close this window or wait to finish.</div></div>';
        document.body.appendChild(d);
      }, [failures, findings] as const).catch(() => undefined);
      await Promise.race([page.waitForEvent('close', { timeout: 0 }).catch(() => undefined), sleep(Number(process.env.KEEP_OPEN ?? 40) * 1000)]);
    }
    await browser.close().catch(() => undefined);
  }
  say({ event: 'verdict', failures, findings });
  log(failures.length ? `VERDICT: ${failures.length} map problem(s)` : `VERDICT: the map behaves correctly${findings.length ? ` (plus ${findings.length} known product finding)` : ''}`, failures.length ? 'bad' : 'ok');
}

main().then(() => process.exit(0)).catch((e) => { say({ event: 'error', text: String(e?.message ?? e) }); process.exit(1); });
void ({} as MapEntity);
