/** Shared building blocks for the autonomous scenario engine. */
import type { Page } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const API = process.env.API_URL ?? 'http://localhost:4000/api';
export const APP = process.env.APP_URL ?? 'http://localhost:4010';
export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const OUT = fileURLToPath(new URL('./out/', import.meta.url));
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

/** Records every socket.io message the page receives: the "wire". */
export class Tap {
  frames = new Map<string, { t: number; payload: any }[]>();
  count = 0;
  attach(page: Page) {
    page.on('websocket', (ws) => {
      if (!ws.url().includes('/socket.io/')) return;
      ws.on('framereceived', (f) => {
        const m = String(f.payload).match(/^\d+(\[[\s\S]*)$/); if (!m) return;
        try {
          const [topic, payload] = JSON.parse(m[1]); if (typeof topic !== 'string') return;
          this.count++; const a = this.frames.get(topic) ?? []; a.push({ t: Date.now(), payload }); if (a.length > 80) a.shift(); this.frames.set(topic, a);
        } catch { /* not data */ }
      });
    });
  }
  recent(topic: string, until: number, n = 3) { return (this.frames.get(topic) ?? []).filter((f) => f.t <= until).slice(-n); }
  lastAt(topic: string) { const a = this.frames.get(topic); return a?.[a.length - 1]?.t ?? 0; }
  topicsOf(entity: string) { return [...this.frames.keys()].filter((k) => k.startsWith(`flytbase/${entity}/telemetry/`)); }
}

/** Flatten a payload into dotted paths with primitive values. */
export function flatten(o: any, prefix = ''): { path: string; value: string | number | boolean }[] {
  if (o === null || o === undefined) return [];
  if (typeof o !== 'object') return [{ path: prefix, value: o }];
  return Object.entries(o).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
}
export const get = (o: any, path: string) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

/** Is an element usable by an operator: present, sized, on screen after scrolling, and (optionally) not covered? */
export async function usable(page: Page, sel: string, hitTest = true) {
  return page.evaluate(([s, ht]) => {
    const el = document.querySelector(s) as HTMLElement | null;
    if (!el) return 'missing';
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return 'no visible size';
    if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return 'off screen';
    if (ht) { const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!h || !(h === el || el.contains(h) || h.contains(el))) return 'covered'; }
    return 'ok';
  }, [sel, hitTest] as const);
}

export function withLock<T>(owner: string, fn: () => Promise<T>): Promise<T> {
  const lock = `${ROOT}.context/locks/app.lock`;
  mkdirSync(`${ROOT}.context/locks`, { recursive: true });
  try { mkdirSync(lock); } catch { throw new Error('The shared app lock is held by another run.'); }
  writeFileSync(`${lock}/owner`, `${owner} ${new Date().toISOString()} pid=${process.pid}\n`);
  return fn().finally(() => rmSync(lock, { recursive: true, force: true }));
}
export const out = (name: string, data: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(OUT + name, typeof data === 'string' ? data : JSON.stringify(data, null, 1)); };
