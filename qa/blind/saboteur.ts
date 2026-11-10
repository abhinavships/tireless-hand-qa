/**
 * SABOTEUR: an isolated process that secretly plants one bug (or none) in the running app.
 * It never tells the QA inspector what it did. It publishes only a sha256 commitment of its
 * choice; the sealed answer is revealed by the referee after QA has finished.
 *
 *   npx tsx blind/saboteur.ts plant [random|none|Mxx]
 *   npx tsx blind/saboteur.ts revert
 *
 * Output: one JSON event per line on stdout (the referee relays these).
 */
import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PRODUCT = `${ROOT}product`;
const SEALED_DIR = `${ROOT}.context/sealed`;
const SEALED = `${SEALED_DIR}/answer.json`;
const say = (ev: Record<string, unknown>) => process.stdout.write(JSON.stringify({ from: 'saboteur', ...ev }) + '\n');
const sh = (c: string) => execSync(c, { cwd: PRODUCT, stdio: 'pipe' }).toString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bugs the saboteur may plant: realistic, user-visible, in the style of the evaluators' examples. */
const POOL: Record<string, string> = {
  none: 'No bug planted (control run: QA must report everything healthy)',
  M01: 'Video tile removed from the cockpit',
  M02: 'Control panel link removed from the header',
  M03: 'Every drone shown as "online" regardless of its real state',
  M04: 'Last drone silently missing from the device list',
  M05: 'Battery always shown as 0 %',
  M05b: 'Battery shows the previously selected drone\'s value',
  M06: 'Telemetry status stuck on "docked" during flight',
  M07: 'Connection badge always says "connected"',
  M08: 'Stopped video labelled "live"',
  M10: 'Drone names rendered as HTML (script injection)',
  M13: 'Land button removed from the control panel',
  MAP01: 'Drone drawn with latitude and longitude swapped',
  MAP02: 'Drone drawn about 40 m east of its real position',
  MAP03: 'Drone model shrunk to an invisible, unclickable size',
  MAP04: 'Height label shows sea-level altitude instead of height above take-off',
  MAP05: 'Drone model points the wrong way (heading inverted)',
  MAP06: 'Drone position never updates after it first appears (old position looks current)',
  MAP07: 'Flight track stops growing after it is first drawn',
  MAP08: 'Dock icon always shows online, even when its data has stopped',
  MAP09: 'Map label keeps the first status it saw (says standby while flying)',
  MAP10: 'Removed drones stay on the map (ghosts)',
  MAP11: '2D button leaves the camera tilted instead of top-down',
  MAP12: 'Selected drone is drawn with the unselected style and vice versa',
  MAP13: 'Selecting a flying drone flies the camera to its dock instead of the drone',
  MAP14: 'Map draws the previous position message: drone and track one message behind the wire',
  MAP15: 'Sea-level altitude drawn as WGS84 ellipsoid height (geoid/ellipsoid datum mix-up)',
  MAP16: 'Dock icon drawn about 30 m east of the real dock location',
};

function patchFor(id: string) {
  const dir = `${ROOT}qa/mutations`;
  const f = readdirSync(dir).find((n) => n.startsWith(`${id}-`) && n.endsWith('.patch'));
  if (!f) throw new Error(`no patch for ${id}`);
  return `${dir}/${f}`;
}
const filesIn = (patch: string) => [...readFileSync(patch, 'utf8').matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]);
const servedUrl = (file: string) => file.startsWith('frontend/src/') ? `http://localhost:4010/${file.slice('frontend/'.length)}` : file === 'backend/public/dashboard.html' ? 'http://localhost:4000/dashboard' : undefined;
const sync = (file: string) => sh(`docker compose cp ${file} ${file.split('/')[0]}:/app/${file}`);
const fetchText = async (u: string) => { try { const r = await fetch(u, { cache: 'no-store' }); return r.ok ? await r.text() : ''; } catch { return ''; } };

async function waitServed(files: string[], before: Record<string, string>) {
  for (const f of files) {
    const u = servedUrl(f); if (!u) continue;
    for (let i = 0; i < 60; i++) { if ((await fetchText(u)) !== before[f]) break; await sleep(500); }
  }
}

async function plant(choice: string) {
  if (existsSync(SEALED)) throw new Error('a bug is already planted; run "revert" first');
  if (sh('git status --porcelain').trim()) throw new Error('product/ is not clean; refusing to plant');
  const ids = Object.keys(POOL);
  // MAP08 is excluded from random picks: on this build stale docks never turn offline anyway (finding G13), so it cannot be told apart.
  const mapPool = ['none', ...ids.filter((k) => k.startsWith('MAP') && k !== 'MAP08')];
  // Map bugs the blind map QA has been proven to catch (MAP08 is masked by product finding G13).
  const caught = ids.filter((k) => k.startsWith('MAP') && k !== 'MAP08');
  const cockpit = ['M01', 'M02', 'M03', 'M04', 'M05', 'M05b', 'M06', 'M07'];
  const id = choice === 'random' ? ids[randomBytes(1)[0] % ids.length] : choice === 'random-cockpit' ? cockpit[randomBytes(1)[0] % cockpit.length] : choice === 'random-map' ? mapPool[randomBytes(1)[0] % mapPool.length] : choice === 'random-caught' ? caught[randomBytes(1)[0] % caught.length] : choice;
  if (!POOL[id]) throw new Error(`unknown choice ${choice}`);
  say({ event: 'status', text: 'Choosing a bug in secret…' });
  await sleep(1500);
  let files: string[] = [];
  if (id !== 'none') {
    const patch = patchFor(id);
    files = filesIn(patch);
    const before: Record<string, string> = {};
    for (const f of files) { const u = servedUrl(f); if (u) before[f] = await fetchText(u); }
    sh(`git apply ${patch}`);
    // Strip the mutation-lab markers so the QA side cannot possibly detect the bug by a label.
    for (const f of files) {
      const p = `${PRODUCT}/${f}`;
      writeFileSync(p, readFileSync(p, 'utf8').split('\n').filter((l) => !l.includes('mutation-lab') && !l.includes('omitted')).join('\n'));
      sync(f);
    }
    await waitServed(files, before);
  }
  const salt = randomBytes(16).toString('hex');
  const commitment = createHash('sha256').update(`${id}:${salt}`).digest('hex');
  mkdirSync(SEALED_DIR, { recursive: true });
  writeFileSync(SEALED, JSON.stringify({ id, description: POOL[id], salt, commitment, files, plantedAt: new Date().toISOString() }, null, 1));
  say({ event: 'planted', commitment, text: 'Done. My choice is sealed; only its fingerprint is public.' });
}

async function revert() {
  if (!existsSync(SEALED)) { say({ event: 'reverted', text: 'Nothing to revert.' }); return; }
  const a = JSON.parse(readFileSync(SEALED, 'utf8')) as { files: string[] };
  for (const f of a.files) { sh(`git checkout -- ${f}`); sync(f); }
  await sleep(1500);
  rmSync(SEALED, { force: true });
  const dirty = sh('git status --porcelain').trim();
  say({ event: 'reverted', clean: !dirty, text: dirty ? `product/ still has changes: ${dirty}` : 'Bug removed; the app is back to its original code.' });
}

const [mode, arg = 'random'] = process.argv.slice(2);
(mode === 'plant' ? plant(arg) : mode === 'revert' ? revert() : Promise.reject(new Error('usage: saboteur.ts plant [random|none|Mxx] | revert')))
  .then(() => process.exit(0))
  .catch((e) => { say({ event: 'error', text: String(e?.message ?? e) }); process.exit(1); });
