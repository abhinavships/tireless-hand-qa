/** Safe file-based progress snapshot: never reads sealed answers or local secrets. */
import { stat, readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const QA = fileURLToPath(new URL('../', import.meta.url));
const files = ['hub/hub.ts', 'auto/discover.ts', 'auto/engine.ts', 'map/anatomy.ts', 'map/learn.ts', 'map/inspector.ts', 'map/out/matrix.jsonl', 'blind/inspector.ts', 'sec/surface.ts', 'sec/inspector.ts'];
async function snapshot() {
  const activity = await Promise.all(files.map(async file => {
    try { const s = await stat(QA + file); return { file, modifiedAt: s.mtime.toISOString(), bytes: s.size }; }
    catch { return { file, missing: true }; }
  }));
  let mapTrials: unknown[] = [];
  try { mapTrials = (await readFile(QA + 'map/out/matrix.jsonl', 'utf8')).trim().split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return { incomplete: true }; } }); } catch { /* not yet run */ }
  const report = { event: 'build-status', checkedAt: new Date().toISOString(), activity, mapTrials };
  await mkdir(QA + 'models/out', { recursive: true });
  await writeFile(QA + 'models/out/build-status.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
await snapshot();
if (process.argv.includes('--watch')) setInterval(() => { snapshot().catch(e => console.error(String(e))); }, 30_000);
