/**
 * CHECK DISCOVERY: the agent figures out WHAT to check on the map by itself.
 *
 *   npm run map:discover        (clean build; GPU model via OLLAMA_URL, default the SSH tunnel 127.0.0.1:11435)
 *
 *  1. PROPOSE  A local coding LLM (Qwen2.5-Coder 7B on the RTX 5090) reads the map component source and one real
 *              websocket message per topic, and writes checks in the strict contract language (map/contract.ts):
 *              "this thing the map draws must equal this telemetry field".
 *  2. VERIFY   Every proposed check is run against the live CLEAN build, across the whole fleet, while a probe
 *              drone flies. A check that does not hold on the clean build is discarded: that is how LLM
 *              hallucinations are filtered out. The LLM never decides pass/fail.
 *  3. KEEP     Surviving checks go to map/out/discovered.json; the blind inspector (npm run qa) runs them as D1…Dn.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { snapshot } from './anatomy.js';
import { Tap, api, sleep, ROOT } from '../auto/lib.js';
import { evaluate, type Check } from './contract.js';

const OLLAMA = (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11435').replace(/\/$/, '');
const MODEL = process.env.CODING_MODEL ?? 'qwen2.5-coder:7b-instruct';
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
const SRC = readFileSync(`${ROOT}product/frontend/src/components/CesiumMap.tsx`, 'utf8');
const C = { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', off: '\x1b[0m' };

const SCHEMA = { type: 'object', required: ['checks'], properties: { checks: { type: 'array', items: { type: 'object', required: ['title', 'why', 'entity', 'target', 'type', 'observable', 'lon', 'lat', 'wire', 'angle', 'template', 'tolerance'], properties: {
  title: { type: 'string' }, why: { type: 'string' },
  entity: { type: 'string', enum: ['drone', 'dock'] }, target: { type: 'string', enum: ['self', 'hlabel', 'hline', 'track'] },
  type: { type: 'string', enum: ['position', 'number', 'text'] },
  observable: { type: 'string', enum: ['position', 'height', 'heading', 'label', 'image', 'model', 'top_height', 'bottom_height', 'count'] },
  lon: { type: 'string' }, lat: { type: 'string' }, wire: { type: 'string' }, angle: { type: 'boolean' }, template: { type: 'string' }, tolerance: { type: 'number' },
} } } } };

function prompt(samples: Record<string, unknown>) {
  return `You are a QA engineer. Below is the React component that draws a Cesium 3D map of drones and docks, and one real websocket message per telemetry topic.
Propose checks that compare what the map DRAWS with the telemetry it was given. Cover every entity property the code sets from telemetry: positions, heights, headings, label texts, height labels, height lines, tracks, for drones AND docks.

Each check uses exactly this language:
- entity: "drone" or "dock" (the check runs on every device of that type)
- target: "self" (the device's model/icon entity, id = device id), "hlabel" (its height label, id "hlabel:<id>"), "hline" (its vertical height line, id "hline:<id>"), "track" (drone flight track, id "track:<id>")
- type "position": the target's drawn lon/lat (track: last point, hline: the line) must be within tolerance metres of wire fields lon + lat.
- type "number": observable ("height" = drawn height above the ground at its dock, "heading" = model heading in degrees, "top_height"/"bottom_height" = hline ends above ground, "count" = track points) must equal the wire field within tolerance; set angle=true for angles.
- type "text": observable ("label", "image", "model") must equal template. Template placeholders: {name} = device name, {topic.path} = wire value, {topic.path|round} = rounded number, {topic.path|fixed1} = one decimal.
Wire fields are written "topic.path", where topic is the last part of the socket topic (e.g. "global_position.position.latitude", "attitude.yaw", "flight_status.flight_status", "dock.dock_location.altitude").
Fill EVERY field. Fields a type does not use are "" (strings), false or 0. Placeholders must name a REAL field from the samples, never the words "topic.path".
Examples of the syntax only (these fields are invented; do not copy them):
{"title":"Rotor count label","why":"label shows rotors","entity":"drone","target":"hlabel","type":"text","observable":"label","lon":"","lat":"","wire":"","angle":false,"template":"{airframe.rotors|round} rotors","tolerance":0}
{"title":"Beacon position","why":"beacon drawn at its fix","entity":"dock","target":"self","type":"position","observable":"position","lon":"beacon.fix.lng","lat":"beacon.fix.lat","wire":"","angle":false,"template":"","tolerance":1}
{"title":"Mast tilt","why":"model tilt equals reported tilt","entity":"drone","target":"self","type":"number","observable":"heading","lon":"","lat":"","wire":"mast.tilt_deg","angle":true,"template":"","tolerance":2}
Read the code to get formats exactly right (e.g. how heights are formatted). Only propose checks the code actually implements. Return 8 to 16 checks as JSON.

<websocket_samples>
${JSON.stringify(samples, null, 1).slice(0, 6000)}
</websocket_samples>

<source file="CesiumMap.tsx">
${SRC}
</source>`;
}

async function propose(samples: Record<string, unknown>, temperature = 0): Promise<Check[]> {
  const t0 = Date.now();
  const r = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(180_000), body: JSON.stringify({
    model: MODEL, stream: false, format: SCHEMA, options: { temperature, seed: Math.round(temperature * 100), num_ctx: 16384, num_predict: 3000 }, messages: [{ role: 'user', content: prompt(samples) }],
  }) });
  if (!r.ok) throw new Error(`LLM HTTP ${r.status}`);
  const body = await r.json() as { message: { content: string } };
  const checks = (JSON.parse(body.message.content).checks as Check[]).map((c, i) => Object.fromEntries(Object.entries({ ...c, id: `D${i + 1}` }).filter(([, v]) => v !== '')) as Check);
  console.log(`${C.cyan}PROPOSE${C.off}  (temperature ${temperature}) ${MODEL} read ${SRC.split('\n').length} lines of map code and proposed ${checks.length} checks in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  return checks;
}

async function main() {
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const tap = new Tap(); tap.attach(page);
  let probe: string | undefined;
  try {
    await page.goto('http://localhost:4010'); await page.locator('[data-testid^="device-row-"]').first().waitFor({ timeout: 30_000 }); await sleep(3000);
    const r = await api('POST', '/control/drones', { name: `DISCO-${Date.now() % 10000}` }); probe = r.drone.id;
    await page.getByTestId(`device-row-${probe}`).waitFor(); await page.getByTestId(`device-row-${probe}`).click();
    await api('POST', '/control/command', { deviceId: probe, type: 'takeoff' });
    for (let i = 0; i < 40; i++) { const f = tap.frames.get(`flytbase/${probe}/telemetry/global_position`)?.at(-1)?.payload; if (f?.position?.height > 20) break; await sleep(500); }
    const devices = (await api('GET', '/devices')).devices as any[];
    const dockId = devices.find((d) => d.droneId === probe)?.id;
    const samples: Record<string, unknown> = { devices: devices.slice(0, 2) };
    for (const id of [probe, dockId]) for (const t of tap.topicsOf(id)) samples[`${id === probe ? 'drone' : 'dock'} · ${t.split('/telemetry/')[1]}`] = tap.frames.get(t)!.at(-1)!.payload;

    // Several rounds at different temperatures; duplicates (same target, fields and template) are merged.
    const seen = new Set<string>(); const proposed: Check[] = [];
    for (const temp of [0, 0.4, 0.8]) for (const c of await propose(samples, temp).catch(() => [] as Check[])) {
      const key = JSON.stringify([c.entity, c.target, c.type, c.observable, c.lon, c.lat, c.wire, c.template]);
      if (!seen.has(key)) { seen.add(key); proposed.push({ ...c, id: `D${proposed.length + 1}` }); }
    }
    // Cumulative: checks kept by earlier runs are re-verified alongside the new proposals.
    try { for (const c of JSON.parse(readFileSync(OUT + 'discovered.json', 'utf8')).kept as Check[]) { const key = JSON.stringify([c.entity, c.target, c.type, c.observable, c.lon, c.lat, c.wire, c.template]); if (!seen.has(key)) { seen.add(key); proposed.push({ ...c, id: `D${proposed.length + 1}`, title: `${c.title} (from earlier run)` }); } } } catch { /* first run */ }
    console.log(`${proposed.length} distinct checks to verify\n`);
    const verify = async (list: Check[], label: string) => {
      // VERIFY on the clean build: 8 snapshots while the probe flies, every device of the check's type.
      const tally = new Map<string, { pass: number; fail: number; na: number; example?: string }>(list.map((c) => [c.id, { pass: 0, fail: 0, na: 0 }]));
      for (let k = 0; k < 8; k++) {
        const s = await snapshot(page);
        for (const c of list) for (const o of evaluate(c, s, tap, devices)) { const t = tally.get(c.id)!; if (o.ok === true) t.pass++; else if (o.ok === false) { t.fail++; t.example ??= `${o.device}: map shows ${o.screen}, check expected ${o.truth}`; } else t.na++; }
        await sleep(1500);
      }
      console.log(`${C.bold}${label}${C.off}`);
      const keep: Check[] = []; const rej: { check: Check; why: string; evidence?: string }[] = [];
      for (const c of list) {
        const t = tally.get(c.id)!; const n = t.pass + t.fail;
        // A check must be able to fail: loose tolerances (the LLM can "repair" a check by loosening it) are rejected.
        const loose = (c.type === 'position' || c.type === 'number') && !((c.tolerance ?? 1) <= 5);
        const ok = !loose && n >= 4 && t.pass / n >= 0.9;
        const spec = c.type === 'position' ? `${c.target} ≈ (${c.lat}, ${c.lon}) ±${c.tolerance ?? 1} m` : c.type === 'number' ? `${c.target}.${c.observable} = ${c.wire} ±${c.tolerance ?? 1}` : `${c.target}.${c.observable ?? 'label'} = "${c.template}"`;
        if (ok) keep.push(c); else rej.push({ check: c, why: loose ? `tolerance ${c.tolerance} is too loose to ever fail (max 5)` : n < 4 ? `could not be evaluated (${t.na} not applicable)` : `false on the clean build ${t.fail}/${n} times, e.g. ${t.example}`, evidence: n >= 4 ? t.example : undefined });
        console.log(`${ok ? `${C.green}KEEP  ${C.off}` : `${C.red}REJECT${C.off}`} ${c.id.padEnd(4)} [${c.entity}] ${c.title}\n        ${C.dim}${spec} · held ${t.pass}/${n}${ok ? '' : ` · ${rej.at(-1)!.why}`}${C.off}`);
      }
      return { keep, rej };
    };
    const first = await verify(proposed, 'VERIFY on the clean build');
    // REPAIR: checks that were well-formed but false go back to the LLM with what the clean map really showed.
    const wrong = first.rej.filter((r) => r.evidence);
    let repairedKeep: Check[] = []; let rejected = first.rej;
    if (wrong.length) {
      const fix = `These map checks were FALSE on the known-good build. The evidence shows what the map really draws. Return corrected checks in the same language (same entity/target/type), fixing only what the evidence shows is wrong. If a check cannot be fixed, omit it.\n${wrong.map((r) => `${JSON.stringify(r.check)}\nEVIDENCE: ${r.evidence}`).join('\n\n')}`;
      const r = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(180_000), body: JSON.stringify({ model: MODEL, stream: false, format: SCHEMA, options: { temperature: 0, num_ctx: 16384, num_predict: 2000 }, messages: [{ role: 'user', content: prompt(samples) }, { role: 'assistant', content: JSON.stringify({ checks: wrong.map((w) => w.check) }) }, { role: 'user', content: fix }] }) }).then((x) => x.json()).catch(() => null) as any;
      const fixed: Check[] = r ? (JSON.parse(r.message.content).checks as Check[]).map((c, i) => Object.fromEntries(Object.entries({ ...c, id: `R${i + 1}` }).filter(([, v]) => v !== '')) as Check) : [];
      console.log(`\n${C.cyan}REPAIR${C.off}   sent ${wrong.length} false checks back with evidence; the LLM returned ${fixed.length} corrections\n`);
      if (fixed.length) { const second = await verify(fixed, 'VERIFY the corrections'); repairedKeep = second.keep; rejected = [...first.rej, ...second.rej]; }
    }
    const kept = [...first.keep, ...repairedKeep].map((c, i) => ({ ...c, id: `D${i + 1}` }));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(OUT + 'discovered.json', JSON.stringify({ model: MODEL, at: new Date().toISOString(), kept, rejected }, null, 1));
    console.log(`\n${C.bold}${kept.length} checks hold on the clean build (${first.keep.length} first time + ${repairedKeep.length} after repair, from ${proposed.length} proposed) → map/out/discovered.json${C.off} (npm run qa runs them as D-checks)`);
  } finally {
    if (probe) await api('DELETE', `/control/drones/${probe}`).catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
