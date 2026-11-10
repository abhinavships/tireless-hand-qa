/**
 * MAP ANATOMY: reads the live Cesium scene graph from outside the app (no source changes).
 * The viewer lives in a React ref inside the map component; we reach it through the React fiber
 * attached to the map's DOM container, then read entities, camera and screen projection directly.
 */
import type { Page } from '@playwright/test';

export type MapEntity = {
  id: string; owner: string; kind: 'drone' | 'dock' | 'track' | 'hline' | 'hlabel' | 'other'; show: boolean;
  lon: number | null; lat: number | null; h: number | null; label?: string; labelShow?: boolean;
  model?: string; modelShow?: boolean; minPx?: number; scale?: number; image?: string; bbShow?: boolean;
  heading?: number; points?: [number, number, number][]; screen?: [number, number] | null;
};
export type MapSnapshot = { ok: boolean; entities: MapEntity[]; camera: { lon: number; lat: number; h: number; pitch: number; heading: number }; canvas: [number, number]; centre: { lon: number; lat: number } | null };

/** tsx/esbuild injects a __name() helper into functions it compiles; define it inside the page too. */
const prep = (page: Page) => page.evaluate('window.__name = window.__name || function (f) { return f; }');

/** Take a full snapshot of the map scene. */
export async function snapshot(page: Page): Promise<MapSnapshot> {
  await prep(page);
  return page.evaluate(() => {
    const w = window as any;
    if (!w.__qaViewer || w.__qaViewer.isDestroyed?.()) {
      const el = document.querySelector('[data-testid="map-canvas"]') as any;
      const fk = el && Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      let f = fk ? el[fk] : null; w.__qaViewer = null;
      for (let i = 0; f && i < 12 && !w.__qaViewer; i++, f = f.return) { let h = f.memoizedState; while (h) { const c = h.memoizedState?.current; if (c && c.scene && c.entities) { w.__qaViewer = c; break; } h = h.next; } }
    }
    const v = w.__qaViewer;
    if (!v) return { ok: false, entities: [], camera: { lon: 0, lat: 0, h: 0, pitch: 0, heading: 0 }, canvas: [0, 0], centre: null };
    const t = v.clock.currentTime; const ell = v.scene.globe.ellipsoid; const D = 180 / Math.PI;
    const carto = (p: any) => { const c = ell.cartesianToCartographic(p); return c ? [c.longitude * D, c.latitude * D, c.height] as [number, number, number] : null; };
    const val = (prop: any) => (prop && typeof prop.getValue === 'function' ? prop.getValue(t) : prop);
    const uri = (x: any) => (x && typeof x === 'object' && 'url' in x ? x.url : x);
    const kindOf = (id: string) => id.startsWith('track:') ? 'track' : id.startsWith('hline:') ? 'hline' : id.startsWith('hlabel:') ? 'hlabel' : id.startsWith('drone-') ? 'drone' : id.startsWith('dock-') ? 'dock' : 'other';
    /** Heading of a model: its body x-axis measured against local east/north at its position. */
    const headingOf = (q: any, p: any) => {
      if (!q || !p) return undefined;
      const { x, y, z, w: qw } = q;
      const bx = [1 - 2 * (y * y + z * z), 2 * (x * y + qw * z), 2 * (x * z - qw * y)]; // rotated body x-axis
      const c = ell.cartesianToCartographic(p); const lo = c.longitude, la = c.latitude;
      const east = [-Math.sin(lo), Math.cos(lo), 0];
      const north = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
      const de = bx[0] * east[0] + bx[1] * east[1] + bx[2] * east[2];
      const dn = bx[0] * north[0] + bx[1] * north[1] + bx[2] * north[2];
      return ((Math.atan2(-dn, de) * D) % 360 + 360) % 360; // clockwise from east
    };
    const entities = v.entities.values.map((e: any) => {
      const id = String(e.id); const kind = kindOf(id); const pos = val(e.position);
      const c = pos ? carto(pos) : null; const scr = pos ? v.scene.cartesianToCanvasCoordinates(pos) : null;
      const pts = e.polyline ? (val(e.polyline.positions) ?? []).map((p: any) => carto(p)).filter(Boolean) : undefined;
      return {
        id, owner: id.replace(/^(track|hline|hlabel):/, ''), kind, show: e.show !== false,
        lon: c?.[0] ?? null, lat: c?.[1] ?? null, h: c?.[2] ?? null,
        label: e.label ? val(e.label.text) : undefined, labelShow: e.label ? val(e.label.show) !== false : undefined,
        model: e.model ? uri(val(e.model.uri)) : undefined, modelShow: e.model ? val(e.model.show) !== false : undefined,
        minPx: e.model ? val(e.model.minimumPixelSize) : undefined, scale: e.model ? val(e.model.scale) : undefined,
        image: e.billboard ? uri(val(e.billboard.image)) : undefined, bbShow: e.billboard ? val(e.billboard.show) !== false : undefined,
        heading: e.orientation ? headingOf(val(e.orientation), pos) : undefined,
        points: pts, screen: scr ? [scr.x, scr.y] : null,
      };
    });
    const cam = v.camera; const cc = cam.positionCartographic;
    const cw = v.scene.canvas.clientWidth, ch = v.scene.canvas.clientHeight;
    const ray = cam.getPickRay({ x: cw / 2, y: ch / 2 }); const hit = ray ? v.scene.globe.pick(ray, v.scene) : undefined;
    const centre = hit ? (() => { const c = carto(hit)!; return { lon: c[0], lat: c[1] }; })() : null;
    return { ok: true, entities, camera: { lon: cc.longitude * D, lat: cc.latitude * D, h: cc.height, pitch: cam.pitch * D, heading: cam.heading * D }, canvas: [cw, ch], centre };
  });
}

/** What does the map draw at this canvas pixel? Returns the ids of every picked entity, top first. */
export async function pickAt(page: Page, x: number, y: number): Promise<string[]> {
  await prep(page);
  return page.evaluate(([px, py]) => {
    const v = (window as any).__qaViewer; if (!v) return [];
    v.scene.render();
    return (v.scene.drillPick({ x: px, y: py }, 5) ?? []).map((p: any) => (p?.id && typeof p.id === 'object' && 'id' in p.id ? String(p.id.id) : String(p?.id ?? ''))).filter(Boolean);
  }, [x, y]);
}

/** Ground height (ellipsoid metres) under a point, as the map's own globe reports it. */
export async function groundAt(page: Page, lon: number, lat: number): Promise<number | null> {
  await prep(page);
  return page.evaluate(([lo, la]) => {
    const v = (window as any).__qaViewer; if (!v) return null;
    const h = v.scene.globe.getHeight({ longitude: lo * Math.PI / 180, latitude: la * Math.PI / 180, height: 0 });
    return h === undefined ? null : h;
  }, [lon, lat]);
}

/** Great-circle distance in metres. */
export function metres(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
