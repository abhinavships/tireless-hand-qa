/**
 * WIRE-TO-PIXEL LEDGER
 * Taps the browser's own websocket and records every message the cockpit actually received.
 * For any value on screen we then know exactly what the UI was told, so the check is an EXACT
 * string match against the display contract, with no tolerance and no timing guesswork.
 * A second comparison, wire vs backend, locates WHERE a mismatch was introduced:
 *   backend → wire   (transport / backend bug: the UI was sent wrong or old data)
 *   wire → screen    (frontend bug: the UI was sent the right data but showed it wrong)
 */
import type { Page } from '@playwright/test';

type Frame = { t: number; payload: any };
export type Layer = 'wire→screen (frontend rendering)' | 'backend→wire (transport/backend)' | 'screen (element missing)';
export type Mismatch = { drone: string; field: string; screen: string; expected: string[]; layer: Layer };

/** Display contract: how each on-screen field must be rendered from the message the UI received. */
export const CONTRACT: { field: string; testid: string; topic: string; render: (p: any) => string | undefined }[] = [
  { field: 'Battery', testid: 'telemetry-battery', topic: 'battery', render: (p) => p?.percent === undefined ? undefined : `${Number(p.percent).toFixed(0)} %` },
  { field: 'Altitude AGL', testid: 'telemetry-alt-agl', topic: 'global_position', render: (p) => p?.position?.height === undefined ? undefined : `${Number(p.position.height).toFixed(1)} m` },
  { field: 'Altitude ASL', testid: 'telemetry-alt-asl', topic: 'global_position', render: (p) => p?.position?.elevation === undefined ? undefined : `${Number(p.position.elevation).toFixed(1)} m` },
  { field: 'H-Speed', testid: 'telemetry-hspeed', topic: 'global_position', render: (p) => p?.speed?.horizontal === undefined ? undefined : `${Number(p.speed.horizontal).toFixed(1)} m/s` },
  { field: 'V-Speed', testid: 'telemetry-vspeed', topic: 'global_position', render: (p) => p?.speed?.vertical === undefined ? undefined : `${Number(p.speed.vertical).toFixed(1)} m/s` },
  { field: 'Heading', testid: 'telemetry-heading', topic: 'attitude', render: (p) => p?.yaw === undefined ? undefined : `${Number(p.yaw).toFixed(0)} °` },
  { field: 'Home distance', testid: 'telemetry-home-distance', topic: 'global_position', render: (p) => p?.home_position?.distance === undefined ? undefined : `${Number(p.home_position.distance).toFixed(0)} m` },
  { field: 'Status (panel)', testid: 'status-flight', topic: 'flight_status', render: (p) => p?.flight_status },
];

export class WireLedger {
  private frames = new Map<string, Frame[]>();
  frameCount = 0; assertions = 0; exact = 0; mismatches: Mismatch[] = [];
  constructor(private onStats: (s: { frames: number; assertions: number; exact: number; mismatches: number; byLayer: Record<string, number> }) => void = () => undefined) {}

  /** Start recording every socket.io message the page receives (call before page.goto). */
  attach(page: Page) {
    page.on('websocket', (ws) => {
      if (!ws.url().includes('/socket.io/')) return;
      ws.on('framereceived', (f) => {
        const m = String(f.payload).match(/^\d+(\[[\s\S]*)$/);
        if (!m) return;
        try {
          const [topic, payload] = JSON.parse(m[1]);
          if (typeof topic !== 'string') return;
          this.frameCount++;
          const arr = this.frames.get(topic) ?? [];
          arr.push({ t: Date.now(), payload }); if (arr.length > 60) arr.shift();
          this.frames.set(topic, arr);
        } catch { /* not a data message */ }
      });
    });
  }
  /** Messages for a device attribute received up to `until` (ms). */
  private recent(drone: string, topic: string, until: number, n = 3) {
    const arr = this.frames.get(`flytbase/${drone}/telemetry/${topic}`) ?? [];
    const upto = arr.filter((f) => f.t <= until);
    return upto.slice(-n);
  }
  latest(drone: string, topic: string) { const a = this.frames.get(`flytbase/${drone}/telemetry/${topic}`); return a?.[a.length - 1]?.payload; }
  stats() {
    const byLayer: Record<string, number> = {};
    for (const m of this.mismatches) byLayer[m.layer] = (byLayer[m.layer] ?? 0) + 1;
    return { frames: this.frameCount, assertions: this.assertions, exact: this.exact, mismatches: this.mismatches.length, byLayer };
  }
  private push() { this.onStats(this.stats()); }
  /** Record a structural mismatch (e.g. a drone's row is missing entirely). */
  missing(drone: string, field: string) { this.assertions++; this.mismatches.push({ drone, field, screen: '(missing)', expected: ['present'], layer: 'screen (element missing)' }); this.push(); }

  /**
   * Batch exact check: read every field of one drone in a single pass, wait once for in-flight
   * messages, then compare each field against strings rendered from the last messages the UI received.
   */
  async checkMany(page: Page, drone: string, specs: { field: string; sel: string; topic: string; render: (p: any) => string | undefined }[], backend?: () => Promise<any>) {
    const readAt = Date.now();
    const texts = await page.evaluate((sels) => sels.map((s) => (document.querySelector(s) as HTMLElement | null)?.innerText?.trim() ?? ''), specs.map((x) => x.sel));
    await new Promise((r) => setTimeout(r, 350));
    const b = backend ? await backend().catch(() => undefined) : undefined;
    const out: ({ ok: boolean; field: string; screen: string; expected: string[]; layer?: Layer })[] = [];
    specs.forEach((sp, i) => {
      const cands = this.recent(drone, sp.topic, readAt + 350, 3).map((f) => sp.render(f.payload)).filter((x): x is string => x !== undefined);
      if (!cands.length) return;
      this.assertions++;
      const screen = texts[i];
      if (screen && cands.includes(screen)) { this.exact++; out.push({ ok: true, field: sp.field, screen, expected: cands }); return; }
      let layer: Layer = screen ? 'wire→screen (frontend rendering)' : 'screen (element missing)';
      const wire = this.latest(drone, sp.topic);
      if (screen && b !== undefined && wire !== undefined && !sameish(b, wire, sp.topic)) layer = 'backend→wire (transport/backend)';
      const mm = { drone, field: sp.field, screen: screen || '(missing)', expected: [...new Set(cands)], layer };
      this.mismatches.push(mm); out.push({ ok: false, ...mm });
    });
    this.push();
    return out;
  }

  /**
   * Exact check of one on-screen text against what the UI was sent.
   * Accepts only a string rendered from one of the last messages received around the read (±1 message),
   * which absorbs render latency without any numeric tolerance.
   */
  async checkText(page: Page, drone: string, field: string, testid: string, topic: string, render: (p: any) => string | undefined, backend?: () => Promise<any>) {
    const readAt = Date.now();
    const loc = page.getByTestId(testid);
    const screen = (await loc.first().innerText({ timeout: 1500 }).catch(() => '')).trim();
    await new Promise((r) => setTimeout(r, 350)); // let in-flight messages reach the ledger
    const cands = this.recent(drone, topic, readAt + 350, 3).map((f) => render(f.payload)).filter((x): x is string => x !== undefined);
    if (!cands.length) return null; // the UI has not been sent this value yet; nothing to assert
    this.assertions++;
    if (screen && cands.includes(screen)) { this.exact++; this.push(); return { ok: true as const, screen, expected: cands }; }
    let layer: Layer = screen ? 'wire→screen (frontend rendering)' : 'screen (element missing)';
    if (screen && backend) {
      // Was the UI sent stale/wrong data (transport) or did it render good data wrongly (frontend)?
      const b = await backend().catch(() => undefined);
      const wire = this.latest(drone, topic);
      if (b !== undefined && wire !== undefined && !sameish(b, wire, topic)) layer = 'backend→wire (transport/backend)';
    }
    const mm = { drone, field, screen: screen || '(missing)', expected: [...new Set(cands)], layer };
    this.mismatches.push(mm); this.push();
    return { ok: false as const, ...mm };
  }
}

/** Loose wire-vs-backend agreement used only to classify the layer (the snapshots are taken at different instants). */
function sameish(backend: any, wire: any, topic: string) {
  if (topic === 'battery') return Math.abs((backend.battery ?? 0) - (wire.percent ?? 0)) <= 2;
  if (topic === 'flight_status') return backend.status === wire.flight_status;
  if (topic === 'global_position') return Math.abs((backend.height ?? 0) - (wire.position?.height ?? 0)) <= 3;
  return true;
}
