/**
 * BUG PLANTER (separate from QA): introduce a map bug into the running cockpit, look at it yourself, then deploy QA.
 *
 *   npm run bug                 list the map bugs
 *   npm run bug -- MAP04        plant MAP04 (you know which)
 *   npm run bug -- random       plant a secret random map bug (or none)
 *   npm run bug -- status       is a bug planted right now?
 *   npm run bug -- reveal       show what was planted (use after QA has reported)
 *   npm run bug -- revert       remove it; the app is back to its original code
 * Reload http://localhost:4010 after plant/revert to load the changed code.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const QA = fileURLToPath(new URL('..', import.meta.url));
const SEALED = fileURLToPath(new URL('../../.context/sealed/answer.json', import.meta.url));
const pool: Record<string, string> = Object.fromEntries([...readFileSync(`${QA}blind/saboteur.ts`, 'utf8').matchAll(/^\s+(MAP\d+): '((?:[^'\\]|\\.)*)',/gm)].map((m) => [m[1], m[2].replace(/\\'/g, "'")]));
const saboteur = (...a: string[]): any[] => {
  let out: string;
  try { out = execFileSync('npx', ['tsx', 'blind/saboteur.ts', ...a], { cwd: QA }).toString(); } catch (e: any) { out = String(e.stdout ?? ''); }
  return out.trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { event: 'error', text: l }; } });
};
const arg = (process.argv[2] ?? 'list').toLowerCase().replace(/^-+/, '');

if (arg === 'list') {
  console.log('\nMap bugs QA can catch (npm run bug:random picks one in secret, or npm run bug -- MAPxx):\n');
  for (const [id, d] of Object.entries(pool)) if (id !== 'MAP08') console.log(`  ${id}  ${d}`);
  console.log(existsSync(SEALED) ? '\n  ⚠ a bug is planted right now (npm run bug -- revert)\n' : '\n  app is clean\n');
} else if (arg === 'status') {
  console.log(existsSync(SEALED) ? 'A bug is planted. Deploy QA (npm run qa), then npm run bug -- reveal.' : 'No bug planted: the cockpit runs its original code.');
} else if (arg === 'reveal') {
  if (!existsSync(SEALED)) console.log('Nothing planted.'); else { const a = JSON.parse(readFileSync(SEALED, 'utf8')); console.log(`Planted: ${a.id} — ${a.description}`); }
} else if (arg === 'revert') {
  for (const e of saboteur('revert')) console.log(e.text);
  console.log('Reload http://localhost:4010 to see the original cockpit.');
} else {
  const id = arg === 'random' ? 'random-caught' : arg.toUpperCase();
  if (id !== 'random-caught' && id !== 'NONE' && !pool[id]) { console.error(`Unknown bug "${process.argv[2]}". Run: npm run bug`); process.exit(1); }
  const ev = saboteur('plant', id === 'NONE' ? 'none' : id);
  const err = ev.find((e) => e.event === 'error'); if (err) { console.error(/already planted/.test(err.text) ? 'A bug is already planted. Run: npm run bug:revert   then plant again.' : err.text); process.exit(1); }
  console.log(id === 'random-caught' ? 'Planted a SECRET map bug (one of the ones QA can catch).' : id === 'NONE' ? 'Planted nothing (clean control run).' : `Planted ${id}: ${pool[id]}`);
  console.log('Reload http://localhost:4010 to see it. Then deploy QA: npm run qa');
}
