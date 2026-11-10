/**
 * DEPLOY QA: run the blind map inspector against the cockpit as it is right now, in a visible browser.
 * It is never told whether a bug is planted. Steps and results show on screen; a report card ends the run.
 *   npm run qa            (PACE=1.5 slower · KEEP_OPEN=40 seconds the report stays up · HEADLESS=1 hidden)
 */
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const QA = fileURLToPath(new URL('..', import.meta.url));
const C = { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', off: '\x1b[0m' };
const p = spawn('npx', ['tsx', 'map/inspector.ts'], { cwd: QA, env: { ...process.env, HEADLESS: process.env.HEADLESS ?? '0' } });
let buf = ''; let verdict: any;
console.log(`${C.bold}\n  BLIND MAP QA · not told whether a bug is planted${C.off}\n`);
p.stdout.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const l = buf.slice(0, i); buf = buf.slice(i + 1); let e: any; try { e = JSON.parse(l); } catch { continue; }
    if (e.event === 'check' && e.status === 'running') console.log(`${C.cyan}${e.id.padEnd(4)}${C.off} ${C.dim}${e.message}${C.off}`);
    else if (e.event === 'check') console.log(`${C.cyan}${e.id.padEnd(4)}${C.off} ${e.status === 'pass' ? `${C.green}PASS${C.off}` : e.status === 'fail' ? `${C.red}${C.bold}BUG ${C.off}` : `${C.yellow}FINDING${C.off}`} ${e.message}`);
    else if (e.event === 'cmd') console.log(`     ${C.dim}▶ ${e.text}${C.off}`);
    else if (e.event === 'error') console.log(`${C.red}error: ${e.text}${C.off}`);
    else if (e.event === 'verdict') verdict = e;
  }
});
p.on('close', () => {
  const f = verdict?.failures ?? [];
  console.log(`\n${C.bold}${f.length ? `${C.red}QA found ${f.length} map bug(s):` : `${C.green}QA found no map bugs.`}${C.off}`);
  for (const x of f) console.log(`  ${C.red}✖ ${x.id} ${x.title}${C.off}\n    ${x.message}`);
  for (const x of verdict?.findings ?? []) console.log(`  ${C.yellow}! ${x.id} known product finding: ${x.message}${C.off}`);
  console.log(`\nCheck the answer: npm run bug -- reveal   ·   restore: npm run bug -- revert\n`);
  mkdirSync(`${QA}map/out`, { recursive: true }); appendFileSync(`${QA}map/out/qa-runs.jsonl`, JSON.stringify({ at: new Date().toISOString(), ...verdict }) + '\n');
});
