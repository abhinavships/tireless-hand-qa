/**
 * DISCOVERY: learn the product model from a known-good build, with no hand-written expectations.
 *  - entities       : from repeated per-entity elements (data-testid="device-row-<id>")
 *  - presence set   : every element an operator can see and use at desktop size
 *  - bindings       : for each on-screen value, WHICH wire field it displays and HOW it is formatted,
 *                     inferred by correlating DOM text with the messages the browser received while
 *                     a drone flies (so values vary and the correlation is unambiguous)
 *  - selection echoes: elements that must name the selected entity
 */
import { chromium, type Page } from '@playwright/test';
import { API, APP, Tap, api, flatten, out, sleep, usable } from './lib.js';

export type Binding = { kind: 'panel' | 'row'; selector: string; label: string; attr: string; path: string; digits: number | null; template: string; alternatives: { attr: string; path: string }[]; samples: number; confidence: number };
export type Model = { unexplained?: { selector: string; texts: string[] }[]; presenceBy?: Record<string, { sel: string; label: string; hitTest: boolean }[]>; learnedAt: string; app: string; entityPattern: string; entities: string[]; presence: { sel: string; label: string; hitTest: boolean }[]; bindings: Binding[]; echoes: string[]; connectionSel?: string };

const EV = process.env.EVENTS === '1';
const emit = (ev: Record<string, unknown>) => process.stdout.write(JSON.stringify({ from: 'learn', ...ev }) + '\n');
const log = (s: string, level = 'info') => { if (EV) emit({ event: 'log', text: s.trim(), level }); else console.log(s); };

async function leafTexts(page: Page) {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    document.querySelectorAll('[data-testid]').forEach((e) => {
      const id = e.getAttribute('data-testid')!; if (id.startsWith('device-row-')) return;
      if (e.querySelector('[data-testid]')) return; // only leaf-level test ids
      const t = (e as HTMLElement).innerText?.trim() ?? ''; if (t && t.length < 48) out[`[data-testid="${id}"]`] = t;
    });
    return out;
  });
}
async function rowLeaves(page: Page, id: string) {
  return page.evaluate((rid) => {
    const row = document.querySelector(`[data-testid="device-row-${rid}"]`); if (!row) return {} as Record<string, string>;
    const res: Record<string, string> = {};
    row.querySelectorAll('*').forEach((el) => {
      if (el.children.length) return; const t = (el as HTMLElement).innerText?.trim(); if (!t) return;
      const parts: string[] = []; let n: Element | null = el;
      while (n && n !== row) { const p: Element = n.parentElement!; parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${Array.from(p.children).indexOf(n) + 1})`); n = p; }
      res[parts.join(' > ')] = t;
    });
    return res;
  }, id);
}

type Sample = { t: number; texts: Record<string, string> };
function bind(samples: Sample[], tap: Tap, entity: string, kind: 'panel' | 'row', selFor: (k: string) => string): Binding[] {
  const keys = new Set(samples.flatMap((s) => Object.keys(s.texts)));
  const topics = tap.topicsOf(entity);
  const res: Binding[] = [];
  for (const key of keys) {
    const score = new Map<string, { match: number; nonzero: number; n: number; digits: number | null; template: string }>();
    let usableSamples = 0;
    for (const s of samples) {
      const text = s.texts[key]; if (!text) continue;
      const m = text.match(/-?\d+(?:\.\d+)?/);
      usableSamples++;
      for (const topic of topics) {
        const frames = tap.recent(topic, s.t + 350, 3); if (!frames.length) continue;
        const fields = new Map<string, (string | number | boolean)[]>();
        for (const f of frames) for (const { path, value } of flatten(f.payload)) { const a = fields.get(path) ?? []; a.push(value); fields.set(path, a); }
        for (const [path, vals] of fields) {
          const k = `${topic.split('/telemetry/')[1]}|${path}`;
          const sc = score.get(k) ?? { match: 0, nonzero: 0, n: 0, digits: null, template: text };
          sc.n++;
          if (m) {
            const numStr = m[0]; const digits = (numStr.split('.')[1] ?? '').length;
            if (vals.some((v) => typeof v === 'number' && v.toFixed(digits) === numStr)) { sc.match++; sc.digits = digits; sc.template = text.replace(numStr, '{v}'); if (!/^-?0(\.0+)?$/.test(numStr)) sc.nonzero++; }
          } else if (vals.some((v) => typeof v === 'string' && v === text)) { sc.match++; sc.nonzero++; sc.digits = null; sc.template = '{v}'; }
          score.set(k, sc);
        }
      }
    }
    const good = [...score.entries()].filter(([, s]) => s.n >= 5 && s.match / s.n >= 0.8);
    if (!good.length) continue;
    good.sort((a, b) => b[1].nonzero - a[1].nonzero || b[1].match - a[1].match);
    const [bestK, best] = good[0];
    const ties = best.nonzero === 0 ? good.filter(([, s]) => s.nonzero === 0) : good.filter(([, s]) => s.nonzero === best.nonzero && s.match === best.match);
    const [attr, path] = bestK.split('|');
    const label = kind === 'panel' ? key.replace(/\[data-testid="(.+)"\]/, '$1') : `row ${key.split(' > ').pop()}`;
    res.push({ kind, selector: selFor(key), label, attr, path, digits: best.digits, template: best.template, alternatives: ties.slice(1).map(([k]) => ({ attr: k.split('|')[0], path: k.split('|')[1] })), samples: usableSamples, confidence: +(best.match / best.n).toFixed(2) });
  }
  return res;
}

export async function discover(): Promise<Model> {
  const tap = new Tap();
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', slowMo: EV ? 120 : 0 });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  tap.attach(page);
  if (EV) {
    const cdp = await page.context().newCDPSession(page); let last = 0;
    cdp.on('Page.screencastFrame', (f: any) => { cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined); if (Date.now() - last > 150) { last = Date.now(); emit({ event: 'frame', data: f.data }); } });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 55, maxWidth: 1280, maxHeight: 900 });
  }
  await page.goto(APP);
  await page.locator('[data-testid^="device-row-"]').first().waitFor({ timeout: 20_000 });
  await sleep(2500);
  log('▶ exploring the screen: which elements can an operator see and use?');
  const texts0 = await leafTexts(page);
  const candidates = [...new Set([...Object.keys(texts0), '[data-testid="map-canvas"]', ...(await page.$$eval('a[href]', (as) => as.map((a) => `a[href="${a.getAttribute('href')}"]`)))])];
  const presenceBy: Record<string, Model['presence']> = {};
  for (const [vp, size] of Object.entries({ desktop: { width: 1440, height: 900 }, tablet: { width: 768, height: 1024 }, phone: { width: 390, height: 844 } })) {
    await page.setViewportSize(size); await sleep(1200);
    const list: Model['presence'] = [];
    for (const sel of candidates) {
      if ((await usable(page, sel, true)) === 'ok') list.push({ sel, label: sel, hitTest: true });
      else if ((await usable(page, sel, false)) === 'ok') list.push({ sel, label: sel, hitTest: false });
    }
    presenceBy[vp] = list; log(`  ${vp}: ${list.length} usable elements`);
  }
  await page.setViewportSize({ width: 1440, height: 900 }); await sleep(1000);
  const presence = presenceBy.desktop;
  const connectionSel = Object.entries(texts0).find(([, t]) => /connected/i.test(t))?.[0];
  const entities = await page.$$eval('[data-testid^="device-row-"]', (els) => els.map((e) => e.getAttribute('data-testid')!.replace('device-row-', '')));
  log(`  ${presence.length} usable elements, ${entities.length} entities, connection indicator: ${connectionSel ?? 'none'}`);

  log('▶ learning display bindings: flying a probe drone and correlating screen text with wire messages');
  const { drone } = await api('POST', '/control/drones', { name: `LEARN-${Date.now() % 10000}` });
  const panel: Sample[] = []; const row: Sample[] = []; let echoes: string[] = [];
  try {
    await page.getByTestId(`device-row-${drone.id}`).click();
    await sleep(1500);
    echoes = await page.evaluate((name) => Array.from(document.querySelectorAll('body *')).filter((e) => !e.children.length && (e.textContent ?? '').includes(name) && !e.closest('[data-testid^="device-row-"]')).map((e) => { const p = e.parentElement!; const pc = p.className ? '.' + String(p.className).trim().split(/\s+/)[0] : p.tagName.toLowerCase(); return `${pc} > ${e.tagName.toLowerCase()}:nth-child(${Array.from(p.children).indexOf(e) + 1})`; }), drone.name);
    await api('POST', '/control/command', { deviceId: drone.id, type: 'takeoff' });
    for (let i = 0; i < 24; i++) {
      const t = Date.now();
      panel.push({ t, texts: await leafTexts(page) }); if (EV) emit({ event: 'sample', i: i + 1, of: 24, texts: panel[panel.length - 1].texts });
      row.push({ t, texts: await rowLeaves(page, drone.id) });
      await sleep(650);
      if (i === 16) await api('POST', '/control/command', { deviceId: drone.id, type: 'land' });
    }
    await sleep(400);
  } finally { await api('DELETE', `/control/drones/${drone.id}`).catch(() => undefined); }
  const bindings = [
    ...bind(panel, tap, drone.id, 'panel', (k) => k),
    ...bind(row, tap, drone.id, 'row', (k) => `[data-testid="device-row-{id}"] > ${k}`),
  ];
  // Anything on screen that shows a CHANGING value we could not explain from the wire is suspicious:
  // either it comes from elsewhere (e.g. the dock) or the build we learned from is already wrong.
  const bound = new Set(bindings.filter((b) => b.kind === 'panel').map((b) => b.selector));
  const unexplained = [...new Set(panel.flatMap((s) => Object.keys(s.texts)))].filter((k) => !bound.has(k)).map((k) => ({ selector: k, texts: [...new Set(panel.map((s) => s.texts[k]).filter(Boolean))] as string[] })).filter((u) => u.texts.some((t) => /-?\d+(\.\d+)?\s*(%|m\/s|m|°)(\s|$)/.test(t))); // measured values only (number + unit)
  await browser.close();
  const model: Model = { unexplained, presenceBy, learnedAt: new Date().toISOString(), app: APP, entityPattern: 'device-row-{id}', entities, presence, bindings, echoes: [...new Set(echoes)], connectionSel };
  out(process.env.MODEL_FILE ?? 'model.json', model);
  if (EV) emit({ event: 'bindings', bindings, unexplained, presenceBy: Object.fromEntries(Object.entries(presenceBy).map(([k, v]) => [k, v.length])), wire: tap.count });
  log(`  learned ${bindings.length} bindings from ${tap.count} wire messages:`);
  for (const b of bindings) log(`   • ${b.label.padEnd(26)} = ${b.attr}.${b.path}  as "${b.template.replace('{v}', b.digits === null ? '<text>' : `<${b.digits} dp>`)}"${b.alternatives.length ? `  (or ${b.alternatives.map((a) => a.attr + '.' + a.path).join(', ')})` : ''}  [${Math.round(b.confidence * 100)}%]`);
  for (const u of unexplained) log(`  ⚠ unexplained value ${u.selector}: shows ${u.texts.slice(0, 4).map((t) => '"' + t + '"').join(', ')} but matches no field the UI received for this drone`);
  log(`  selection echoes (must name the selected drone): ${model.echoes.join(', ')}`);
  return model;
}

if (process.argv[1]?.endsWith('discover.ts')) discover().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
void API;
