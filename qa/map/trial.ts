/**
 * MAP TRIAL: one command, three isolated processes.
 *
 *   npm run map:trial                → secret random map bug (or none)
 *   npm run map:trial -- MAP04       → a specific bug      ·  none → clean control
 *   HEADLESS=0 npm run map:trial     → watch the QA browser (also exposed over CDP on :9222)
 *
 *   1. SABOTEUR (blind/saboteur.ts)  plants the bug in the product and publishes only sha256(id:salt).
 *   2. QA       (map/inspector.ts)   knows nothing about the bug; reads the Cesium scene graph and the websocket.
 *   3. REFEREE  (this file)          opens the sealed answer after QA has reported, verifies the hash, scores, reverts.
 * Appends every result to map/out/trials.jsonl.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const QA = fileURLToPath(new URL('..', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LOCK = `${ROOT}.context/locks/app.lock`;
const EXPECT: Record<string, string[]> = { MAP01: ['G2', 'G6'], MAP02: ['G2', 'G6'], MAP03: ['G8', 'G15'], MAP04: ['G3'], MAP05: ['G4'], MAP06: ['G2', 'G6', 'G7'], MAP07: ['G7'], MAP08: ['G13'], MAP09: ['G5'], MAP10: ['G12'], MAP11: ['G11'], MAP12: ['G10'], MAP13: ['G9'], MAP14: ['G14'], MAP15: ['G3'], MAP16: ['title:dock position'] };
const C = { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', mag: '\x1b[35m', cyan: '\x1b[36m', bold: '\x1b[1m', off: '\x1b[0m' };
const say = (who: string, col: string, text: string) => console.log(`${col}${who.padEnd(9)}${C.off} ${text}`);

function run(script: string, args: string[], onEvent: (e: any) => void): Promise<any[]> {
  return new Promise((resolve) => {
    const p = spawn('npx', ['tsx', script, ...args], { cwd: QA, env: process.env });
    const evs: any[] = []; let buf = '';
    p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { const e = JSON.parse(l); evs.push(e); onEvent(e); } catch { /* not an event */ } } });
    p.on('close', () => resolve(evs));
  });
}

async function main() {
  const choice = process.argv[2] ?? 'random-map';
  mkdirSync(`${ROOT}.context/locks`, { recursive: true });
  try { mkdirSync(LOCK); } catch { console.error('The shared app lock is held by another run (.context/locks/app.lock). Wait for it, or remove it if no run is active.'); process.exit(2); }
  writeFileSync(`${LOCK}/owner`, `map-trial ${new Date().toISOString()} pid=${process.pid}\n`);
  let planted = false;
  const revert = async () => { if (planted) { await run('blind/saboteur.ts', ['revert'], (e) => say('SABOTEUR', C.mag, e.text)); planted = false; } };
  process.on('SIGINT', async () => { await revert(); rmSync(LOCK, { recursive: true, force: true }); process.exit(130); });
  try {
    console.log(`${C.bold}\n  MAP TRIAL · saboteur ⟂ blind QA · referee${C.off}\n`);
    const sab = await run('blind/saboteur.ts', ['plant', choice], (e) => say('SABOTEUR', C.mag, e.text + (e.commitment ? `  ${C.dim}sha256 ${e.commitment}${C.off}` : '')));
    const p = sab.find((e) => e.event === 'planted'); if (!p) throw new Error('saboteur failed');
    planted = true;
    console.log();
    const qa = await run('map/inspector.ts', [], (e) => {
      if (e.event === 'check' && e.status !== 'running') say(`QA ${e.id}`, C.cyan, e.status === 'pass' ? `${C.green}PASS${C.off} ${e.message}` : e.status === 'fail' ? `${C.red}FAIL${C.off} ${e.message}` : `${C.yellow}FINDING${C.off} ${e.message}`);
      else if (e.event === 'check') say(`QA ${e.id}`, C.cyan, `${C.dim}${e.message}${C.off}`);
      else if (e.event === 'log' && /tolerances|Blind/.test(e.text)) say('QA', C.cyan, `${C.dim}${e.text}${C.off}`);
      else if (e.event === 'error') say('QA', C.red, e.text);
    });
    const v = qa.find((e) => e.event === 'verdict') ?? { failures: [], findings: [] };
    // Referee: open the sealed answer only now, and check it against the published commitment.
    const a = JSON.parse(readFileSync(`${ROOT}.context/sealed/answer.json`, 'utf8'));
    const verified = createHash('sha256').update(`${a.id}:${a.salt}`).digest('hex') === p.commitment;
    const failed = new Set<string>(v.failures.map((f: any) => f.id)); const exp = EXPECT[a.id] ?? [];
    const outcome = a.id === 'none' ? (failed.size ? 'FALSE ALARM' : 'CORRECT: no bug, no alarm') : exp.some((x) => x.startsWith('title:') ? v.failures.some((f: any) => String(f.title).toLowerCase().includes(x.slice(6))) : failed.has(x)) ? 'CAUGHT' : failed.size ? 'DETECTED (other check)' : 'MISSED';
    const good = /CAUGHT|CORRECT|DETECTED/.test(outcome);
    console.log();
    say('REFEREE', C.bold, `planted: ${C.bold}${a.id}${C.off} — ${a.description}   ${verified ? `${C.green}sha256 verified${C.off}` : `${C.red}sha256 MISMATCH${C.off}`}`);
    say('REFEREE', C.bold, `QA failed: ${[...failed].join(', ') || 'nothing'}   expected: ${exp.join(' or ') || 'nothing'}`);
    say('REFEREE', C.bold, `${good ? C.green : C.red}${C.bold}${outcome}${C.off}`);
    mkdirSync(`${QA}map/out`, { recursive: true });
    appendFileSync(`${QA}map/out/trials.jsonl`, JSON.stringify({ at: new Date().toISOString(), id: a.id, description: a.description, verified, outcome, failures: v.failures, findings: v.findings }) + '\n');
    await revert();
    process.exitCode = good ? 0 : 1;
  } finally {
    await revert().catch(() => undefined);
    await fetch('http://localhost:4000/api/control/fault', { method: 'DELETE' }).catch(() => undefined);
    rmSync(LOCK, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
