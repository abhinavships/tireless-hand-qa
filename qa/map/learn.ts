/**
 * MAP LEARNER: learns, on a known-good build, what the map looks like AND how accurately it draws.
 *
 *  1. Visual states: selected / unselected drone model, dock icons, 2D/3D camera pitch, stale-dock behaviour.
 *  2. Calibration flight: flies a probe drone and samples the scene graph against the websocket wire
 *     (~8 samples/s for CAL_SECONDS). For every metric it records the clean build's error distribution
 *     (position, heading, height, map-vs-panel distance, track end gap, wire-to-map latency, telemetry
 *     cadence, flight speed) and derives a tolerance from it: tol = max(floor, p99 × 1.5 + margin).
 *     The inspector uses these tolerances instead of hand-picked constants, so a bug only has to be
 *     bigger than the build's own noise to be caught.
 *  3. Self-distrust: if the build it is learning from fails physical sanity bounds (drone drawn metres
 *     away, heading tens of degrees off, map seconds behind), the learner REFUSES to save the model and
 *     writes map-model.rejected.json. A learner that learns a broken build as "normal" hides the bug forever.
 *
 *   npx tsx map/learn.ts          → map/out/map-model.json   (EVENTS=1 emits JSON events, CAL_SECONDS=25)
 */
import { chromium, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { snapshot, metres, groundAt, type MapSnapshot } from './anatomy.js';
import { Tap, api, sleep } from '../auto/lib.js';

const OUT = fileURLToPath(new URL('./out/', import.meta.url));
const EV = process.env.EVENTS === '1';
const CAL_SECONDS = Number(process.env.CAL_SECONDS ?? 25);
const MODEL_FILE = process.env.MAP_MODEL_FILE ?? 'map-model.json';
const say = (ev: Record<string, unknown>) => { if (EV) process.stdout.write(JSON.stringify({ from: 'maplearn', ...ev }) + '\n'); };
const log = (text: string, level = 'info') => EV ? say({ event: 'log', text, level }) : console.log(text);

/** One learned metric: its clean-build distribution and the tolerance derived from it. */
export type Stat = { n: number; p50: number; p95: number; p99: number; max: number; tol: number; unit: string };
export type MapModel = {
  selectedModel: string; unselectedModel: string; dockSelected: string; dockUnselected: string; dockOffline: string[];
  staleDocksGoOffline: boolean; pitch2d: number; pitch3d: number; learnedAt: string;
  /** Calibrated tolerances (absent on models learned by the old learner: the inspector then falls back to constants). */
  cal?: { posErr: Stat; headingErr: Stat; heightErr: Stat; distErr: Stat; trackGap: Stat; latency: Stat; cadence: Stat; speed: Stat; flightSeconds: number };
};

// Floors keep a perfectly quiet build from producing zero-width tolerances; sanity bounds are physics, not taste.
const RULES: Record<string, { floor: number; margin: number; sanity: number; unit: string; what: string }> = {
  posErr: { floor: 0.5, margin: 0.2, sanity: 5, unit: 'm', what: 'drone drawn away from its reported position' },
  headingErr: { floor: 1, margin: 0.5, sanity: 10, unit: '°', what: 'drone model heading differs from yaw' },
  heightErr: { floor: 0.5, margin: 0.2, sanity: 5, unit: 'm', what: '3D height differs from reported height' },
  distErr: { floor: 2, margin: 0.5, sanity: 15, unit: 'm', what: 'map dock→drone distance differs from the panel' },
  trackGap: { floor: 2, margin: 0.5, sanity: 25, unit: 'm', what: 'flight track ends away from the drone' },
  latency: { floor: 300, margin: 150, sanity: 3000, unit: 'ms', what: 'map lags behind the websocket' },
  cadence: { floor: 0, margin: 0, sanity: Infinity, unit: 'ms', what: 'telemetry interval' },
  speed: { floor: 0, margin: 0, sanity: Infinity, unit: 'm/s', what: 'probe flight speed' },
};

const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };
function stat(key: string, xs: number[]): Stat {
  const r = RULES[key]; const p99 = q(xs, 0.99);
  const round = (v: number) => Math.round(v * 100) / 100;
  return { n: xs.length, p50: round(q(xs, 0.5)), p95: round(q(xs, 0.95)), p99: round(p99), max: round(Math.max(...xs)), tol: round(Math.max(r.floor, p99 * 1.5 + r.margin)), unit: r.unit };
}
const angle = (a: number, b: number) => Math.abs(((a - b) % 360 + 540) % 360 - 180);

/** Fly a probe drone and measure how faithfully the map draws it. */
async function calibrate(page: Page, tap: Tap) {
  const r = await api('POST', '/control/drones', { name: `MAPCAL-${Date.now() % 10000}` });
  const P = { id: r.drone.id as string, name: r.drone.name as string, dockId: r.dock.id as string };
  const topic = `flytbase/${P.id}/telemetry/global_position`;
  const S: Record<string, number[]> = { posErr: [], headingErr: [], heightErr: [], distErr: [], trackGap: [], latency: [], cadence: [], speed: [] };
  try {
    log(`calibration flight: probe drone ${P.name}, sampling the scene for ${CAL_SECONDS} s`);
    await page.getByTestId(`device-row-${P.id}`).waitFor({ timeout: 10_000 });
    await page.getByTestId(`device-row-${P.id}`).click(); await sleep(2500);
    await api('POST', '/control/command', { deviceId: P.id, type: 'takeoff' });
    for (let i = 0; i < 40; i++) { const f = tap.frames.get(topic)?.at(-1)?.payload; if (f && f.position.height > 5) break; await sleep(500); }
    const ent = (s: MapSnapshot, id: string) => s.entities.find((e) => e.id === id);
    const rendered = new Map<number, number>(); // frame arrival time → first time the map showed it (or something newer)
    const end = Date.now() + CAL_SECONDS * 1000; let groundHome: number | null | undefined;
    while (Date.now() < end) {
      const s = await snapshot(page); const now = Date.now(); const e = ent(s, P.id); const frames = tap.frames.get(topic) ?? [];
      if (!e || e.lon == null || !frames.length) { await sleep(120); continue; }
      // Which recent frame is the map showing? Everything up to that frame counts as rendered.
      const recent = frames.slice(-6); let shown = -1;
      recent.forEach((f, i) => { if (metres({ lon: e.lon!, lat: e.lat! }, { lon: f.payload.position.longitude, lat: f.payload.position.latitude }) < 0.5) shown = i; });
      if (shown >= 0) for (const f of recent.slice(0, shown + 1)) if (!rendered.has(f.t)) rendered.set(f.t, now - f.t);
      // Accuracy is measured against the frame the map is showing, so latency and accuracy stay separate metrics.
      const f = (shown >= 0 ? recent[shown] : recent[recent.length - 1]).payload;
      S.posErr.push(metres({ lon: e.lon!, lat: e.lat! }, { lon: f.position.longitude, lat: f.position.latitude }));
      const yaw = (tap.frames.get(`flytbase/${P.id}/telemetry/attitude`) ?? []).slice(-3).map((a) => a.payload.yaw);
      if (yaw.length && e.heading != null) S.headingErr.push(Math.min(...yaw.map((y) => angle(e.heading!, y))));
      if (groundHome === undefined) groundHome = await groundAt(page, f.home_position.longitude, f.home_position.latitude);
      if (groundHome != null && e.h != null) S.heightErr.push(Math.abs((e.h - groundHome) - f.position.height));
      const d = ent(s, P.dockId); if (d?.lon != null) S.distErr.push(Math.abs(metres({ lon: d.lon, lat: d.lat! }, { lon: e.lon!, lat: e.lat! }) - f.home_position.distance));
      const tr = ent(s, `track:${P.id}`)?.points; if (tr?.length) { const t = tr[tr.length - 1]; S.trackGap.push(metres({ lon: t[0], lat: t[1] }, { lon: e.lon!, lat: e.lat! })); }
      await sleep(120);
    }
    const frames = (tap.frames.get(topic) ?? []).filter((f) => f.t >= end - CAL_SECONDS * 1000);
    for (let i = 1; i < frames.length; i++) {
      S.cadence.push(frames[i].t - frames[i - 1].t);
      const a = frames[i - 1].payload.position, b = frames[i].payload.position;
      S.speed.push(metres({ lon: a.longitude, lat: a.latitude }, { lon: b.longitude, lat: b.latitude }) / ((frames[i].t - frames[i - 1].t) / 1000));
    }
    S.latency = [...rendered.entries()].filter(([t]) => t >= end - CAL_SECONDS * 1000).map(([, ms]) => ms);
  } finally { await api('DELETE', `/control/drones/${P.id}`).catch(() => undefined); }
  const cal = Object.fromEntries(Object.entries(S).map(([k, xs]) => [k, stat(k, xs.length ? xs : [NaN])])) as unknown as NonNullable<MapModel['cal']>;
  cal.flightSeconds = CAL_SECONDS;
  // Physics cap: a map must draw each message before the next one arrives, or it is showing the previous message.
  if (Number.isFinite(cal.cadence.p50)) cal.latency.tol = Math.min(cal.latency.tol, Math.round(0.8 * cal.cadence.p50));
  return cal;
}

export async function learnMap(): Promise<MapModel> {
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const tap = new Tap(); tap.attach(page);
  try {
    await page.goto('http://localhost:4010');
    await page.locator('[data-testid^="device-row-"]').first().waitFor({ timeout: 20_000 }); await sleep(4000);
    const fleet = ((await api('GET', '/devices')).devices as any[]);
    const [a, b] = fleet.filter((d) => d.type === 'drone');
    await page.getByTestId(`device-row-${a.id}`).click(); await sleep(2500);
    let s = await snapshot(page);
    const ent = (id: string) => s.entities.find((e) => e.id === id)!;
    const m: Partial<MapModel> = {
      selectedModel: ent(a.id).model, unselectedModel: ent(b.id).model,
      dockSelected: ent(a.dockId).image, dockUnselected: ent(b.dockId).image,
    };
    log(`drone model: selected "${m.selectedModel}", unselected "${m.unselectedModel}"`);
    log(`dock icon: selected "${m.dockSelected}", unselected "${m.dockUnselected}"`);
    await page.getByTestId('map-view-2d').click(); await sleep(2000); m.pitch2d = Math.round((await snapshot(page)).camera.pitch);
    await page.getByTestId('map-view-3d').click(); await sleep(2000); m.pitch3d = Math.round((await snapshot(page)).camera.pitch);
    log(`camera pitch: 2D ${m.pitch2d}°, 3D ${m.pitch3d}°`);
    await page.getByTestId('map-view-2d').click(); await sleep(1500);

    m.cal = await calibrate(page, tap);
    for (const [k, st] of Object.entries(m.cal)) {
      if (typeof st !== 'object') continue;
      log(`${k.padEnd(10)} n=${String(st.n).padStart(3)}  p50 ${st.p50}${st.unit}  p99 ${st.p99}${st.unit}  → tolerance ${RULES[k].sanity === Infinity ? '(context only)' : `${st.tol}${st.unit}`}`);
      say({ event: 'stat', key: k, ...st });
    }

    // Staleness: take the simulator offline and see what the docks look like once their data stops.
    await api('POST', '/control/fault', { kind: 'sim-offline', seconds: 12 }); await sleep(9000);
    s = await snapshot(page);
    const icons = fleet.filter((d) => d.type === 'dock').map((d) => ent(d.id)?.image).filter(Boolean) as string[];
    const online = new Set([m.dockSelected, m.dockUnselected]);
    m.dockOffline = [...new Set(icons.filter((i) => !online.has(i)))];
    m.staleDocksGoOffline = m.dockOffline.length > 0;
    await api('DELETE', '/control/fault'); await sleep(4000);
    log(m.staleDocksGoOffline ? `stale docks switch to: ${m.dockOffline.join(', ')}` : `after 9 s without data every dock still shows its online icon (${[...new Set(icons)].join(', ')})`, m.staleDocksGoOffline ? 'info' : 'warn');

    const model = { ...m, learnedAt: new Date().toISOString() } as MapModel;
    mkdirSync(OUT, { recursive: true });
    // Self-distrust: a clean build must draw the map to within physical sanity bounds. If not, refuse.
    const broken = Object.entries(RULES).filter(([k, r]) => { const st = (model.cal as any)[k] as Stat; return r.sanity !== Infinity && !(st.p50 <= r.sanity); })
      .map(([k, r]) => `${r.what}: typical ${(model.cal as any)[k].p50}${r.unit} (sanity bound ${r.sanity}${r.unit})`);
    // Relative physics: if the map is typically most of a telemetry interval late, it is drawing the PREVIOUS message.
    const c = model.cal!; if (c.latency.p50 > 0.75 * c.cadence.p50) broken.push(`map lags behind the websocket: typical latency ${c.latency.p50} ms vs one telemetry interval ${c.cadence.p50} ms (the map is a whole message behind)`);
    if (broken.length) {
      writeFileSync(OUT + 'map-model.rejected.json', JSON.stringify({ ...model, rejected: broken }, null, 1));
      say({ event: 'rejected', reasons: broken });
      log(`REFUSING TO LEARN: this build does not look healthy — ${broken.join('; ')}. Kept the previous model.`, 'bad');
      throw Object.assign(new Error('build rejected by the learner'), { rejected: broken });
    }
    writeFileSync(OUT + MODEL_FILE, JSON.stringify(model, null, 1));
    say({ event: 'learned', model });
    log(`map model saved: map/out/${MODEL_FILE}`, 'ok');
    return model;
  } finally { await api('DELETE', '/control/fault').catch(() => undefined); await browser.close().catch(() => undefined); }
}

if (process.argv[1]?.endsWith('learn.ts')) learnMap().then(() => process.exit(0)).catch((e) => { if (!e?.rejected) console.error(e); process.exit(e?.rejected ? 3 : 1); });
