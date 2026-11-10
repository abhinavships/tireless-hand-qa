/**
 * MAP CONTRACT: a small, strict language for "what the map draws must equal what the drone reported",
 * and a deterministic evaluator for it. Checks in this language can be written by hand or proposed by an LLM
 * (map/discover.ts); either way only this evaluator decides pass/fail, over every device in the fleet.
 */
import type { MapSnapshot, MapEntity } from './anatomy.js';
import { metres } from './anatomy.js';
import type { Tap } from '../auto/lib.js';

export type Check = {
  id: string; title: string; why: string;
  entity: 'drone' | 'dock';                    // which devices the check applies to (all of them)
  target: 'self' | 'hlabel' | 'hline' | 'track'; // the device's own icon/model, its height label, height line or track
  type: 'position' | 'number' | 'text';
  observable?: 'height' | 'heading' | 'label' | 'image' | 'model' | 'top_height' | 'bottom_height' | 'count';
  lon?: string; lat?: string;                  // position: wire fields, "topic.path" e.g. "global_position.position.longitude"
  wire?: string;                               // number: wire field
  angle?: boolean;                             // number: compare as degrees on a circle
  template?: string;                           // text: e.g. "{name} {flight_status.flight_status}" or "{global_position.position.height|round} m"
  tolerance?: number;                          // metres / units
};
export type Outcome = { device: string; ok: boolean | null; screen: string; truth: string };
export const OBSERVABLES = {
  self: { drone: ['position', 'height (above its dock/ground)', 'heading (deg, clockwise from north... as drawn)', 'label', 'model'], dock: ['position', 'label', 'image'] },
  hlabel: ['label (height label text next to the device)'], hline: ['position (of the line)', 'top_height', 'bottom_height (above ground)'], track: ['position (of its last point)', 'count (points)'],
};

const get = (o: any, path: string) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const angle = (a: number, b: number) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
/** Recent values of a wire field for one device, "topic.path" (topic = last segment of flytbase/<id>/telemetry/<topic>). */
function wireVals(tap: Tap, device: string, field: string, n = 3): any[] {
  const [topic, ...rest] = field.split('.');
  return (tap.frames.get(`flytbase/${device}/telemetry/${topic}`) ?? []).slice(-n).map((f) => get(f.payload, rest.join('.'))).filter((v) => v !== undefined);
}
/** Recent frames of a topic, so position checks pair lon/lat from the SAME message. */
function frames(tap: Tap, device: string, topic: string, n = 3) { return (tap.frames.get(`flytbase/${device}/telemetry/${topic}`) ?? []).slice(-n).map((f) => f.payload); }

function fill(template: string, device: { name: string }, frame: (field: string) => any): string | undefined {
  let bad = false;
  const out = template.replace(/\{([^}|]+)(?:\|(\w+))?\}/g, (_m, f: string, fmt?: string) => {
    if (f === 'name') return device.name;
    const v = frame(f); if (v === undefined || v === null) { bad = true; return ''; }
    if (typeof v === 'number') return fmt === 'round' ? String(Math.round(v)) : fmt?.startsWith('fixed') ? v.toFixed(Number(fmt.slice(5)) || 0) : String(v);
    return String(v);
  });
  return bad ? undefined : out.trim();
}

export function evaluate(c: Check, s: MapSnapshot, tap: Tap, devices: { id: string; type: string; name: string; droneId?: string }[]): Outcome[] {
  const ent = (id: string) => s.entities.find((e) => e.id === id);
  const out: Outcome[] = [];
  for (const d of devices.filter((x) => x.type === c.entity)) {
    const tid = c.target === 'self' ? d.id : `${c.target}:${d.id}`; const e = ent(tid);
    // ground reference: a drone's dock (drawn standing on the ground), or the dock itself
    const dock = c.entity === 'dock' ? ent(d.id) : ent(devices.find((x) => x.droneId === d.id)?.id ?? '');
    const g = dock?.h ?? null;
    if (!e || e.show === false) { out.push({ device: d.name, ok: null, screen: 'not drawn', truth: '' }); continue; }
    try {
      if (c.type === 'position') {
        const [topic] = (c.lon ?? '').split('.'); const fr = frames(tap, d.id, topic);
        const p = c.target === 'track' ? e.points?.at(-1) : c.target === 'hline' ? e.points?.[0] : undefined;
        const lon = p ? p[0] : e.lon, lat = p ? p[1] : e.lat;
        if (lon == null || !fr.length) { out.push({ device: d.name, ok: null, screen: '—', truth: 'no data' }); continue; }
        const dist = Math.min(...fr.map((f) => metres({ lon, lat: lat! }, { lon: get(f, c.lon!.split('.').slice(1).join('.')), lat: get(f, c.lat!.split('.').slice(1).join('.')) })));
        out.push({ device: d.name, ok: Number.isFinite(dist) ? dist <= (c.tolerance ?? 1) : null, screen: `${lat!.toFixed(6)}, ${lon.toFixed(6)}`, truth: `${dist.toFixed(1)} m away` });
      } else if (c.type === 'number') {
        const vals = wireVals(tap, d.id, c.wire!).filter((v) => typeof v === 'number');
        let sv: number | undefined;
        if (c.observable === 'heading') sv = e.heading;
        else if (c.observable === 'height') sv = e.h != null && g != null ? e.h - g : undefined;
        else if (c.observable === 'top_height' && e.points?.length) sv = g != null ? Math.max(...e.points.map((q) => q[2])) - g : undefined;
        else if (c.observable === 'bottom_height' && e.points?.length) sv = g != null ? Math.min(...e.points.map((q) => q[2])) - g : undefined;
        else if (c.observable === 'count') sv = e.points?.length;
        if (sv == null || !vals.length) { out.push({ device: d.name, ok: null, screen: String(sv ?? '—'), truth: 'no data' }); continue; }
        const diff = Math.min(...vals.map((v) => (c.angle ? angle(sv!, v) : Math.abs(sv! - v))));
        out.push({ device: d.name, ok: diff <= (c.tolerance ?? 1), screen: sv.toFixed(1), truth: `${vals.at(-1)} (off by ${diff.toFixed(1)})` });
      } else {
        const sv = c.observable === 'image' ? e.image : c.observable === 'model' ? e.model : e.label;
        const [topic] = (c.template!.match(/\{([a-z_]+)\./)?.[1] ?? 'global_position').split('.');
        const fr = frames(tap, d.id, topic);
        const cands = (fr.length ? fr : [undefined]).map((f) => fill(c.template!, d, (field) => { const [t, ...r] = field.split('.'); return t === topic && f ? get(f, r.join('.')) : wireVals(tap, d.id, field, 1)[0]; })).filter((x): x is string => x !== undefined);
        if (!cands.length || sv == null) { out.push({ device: d.name, ok: null, screen: String(sv ?? '—'), truth: 'no data' }); continue; }
        out.push({ device: d.name, ok: cands.includes(String(sv).trim()), screen: `"${sv}"`, truth: `"${cands.at(-1)}"` });
      }
    } catch (err) { out.push({ device: d.name, ok: null, screen: 'error', truth: String((err as Error).message).slice(0, 80) }); }
  }
  return out;
}
export type { MapEntity };
