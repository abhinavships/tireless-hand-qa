/** Model review → existing deterministic engine → visual review. No model-written code executes. */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { reviewPlan, reviewScreenshots } from './client.js';

const QA = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
const limit = Number(process.argv[2] ?? 3);
if (!Number.isInteger(limit) || limit < 1 || limit > 8) throw new Error('Choose 1–8 scenarios for a bounded model-assisted run');
const emit = (event: Record<string, unknown>) => console.log(JSON.stringify({ from: 'models', ...event }));
await mkdir(OUT, { recursive: true });
// Require a trusted baseline; never silently learn from a possibly broken build.
const model = await readFile(`${QA}auto/out/model.json`, 'utf8');
const contract = await readFile(`${QA}contracts/cockpit.json`, 'utf8');
const planning = await reviewPlan(JSON.stringify({ goal: 'Review coverage and suggest targeted checks for operator-impacting bugs. Existing deterministic scenarios remain authoritative.', model: JSON.parse(model), contract: JSON.parse(contract) }));
emit({ event: 'model-review', role: 'coding', ...planning });

type Event = Record<string, unknown>;
const observations: Event[] = []; const evidence: { scenario: string; frame: Buffer }[] = [];
let lastFrame: Buffer | undefined; let frameScenario = ''; let currentScenario = '';
const childExit = await new Promise<number>((resolve, reject) => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'auto/engine.ts', 'run', '--limit', String(limit), '--events'], { cwd: QA, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let buffer = '';
  const line = (text: string) => {
    try {
      const ev = JSON.parse(text) as Event;
      if (ev.event === 'frame') { lastFrame = Buffer.from(String(ev.data), 'base64'); frameScenario = currentScenario; }
      if (ev.event === 'scenario' && ev.status === 'running') { currentScenario = String(ev.id); lastFrame = undefined; }
      if (ev.event === 'scenario' && ev.status !== 'running') {
        observations.push(ev);
        if (lastFrame && frameScenario === String(ev.id) && evidence.length < 2) evidence.push({ scenario: String(ev.id), frame: lastFrame });
      }
      if (ev.event === 'report') observations.push(ev);
      console.log(text);
    } catch { emit({ event: 'log', text: text.slice(0, 500) }); }
  };
  child.stdout.on('data', d => { buffer += String(d); let i; while ((i = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0, i)); buffer = buffer.slice(i + 1); } });
  child.stderr.on('data', d => process.stderr.write(d));
  child.on('error', reject);
  child.on('close', code => { if (buffer.trim()) line(buffer); resolve(code ?? 1); });
});
const visual = evidence.length ? await reviewScreenshots(JSON.stringify({ contract: JSON.parse(contract), screenshots: evidence.map((e, index) => ({ index, scenario: e.scenario })), observations,
  note: 'Screenshots are sampled frames near scenario completion, not exact-time API snapshots. Do not infer live/stale telemetry or temporal behavior from a still image.' }), evidence.map(e => e.frame)) : undefined;
if (visual) emit({ event: 'model-review', role: 'vision', ...visual });
for (let i = 0; i < evidence.length; i++) await writeFile(`${OUT}frame-${evidence[i].scenario}.jpg`, evidence[i].frame);
const deterministicFailed = childExit !== 0 || observations.some(ev => ev.event === 'scenario' && ev.status === 'fail');
const result = { createdAt: new Date().toISOString(), childExit, deterministicFailed, observations, planning, visual,
  limitations: ['Model hypotheses are advisory and do not alter test verdicts.', 'Vision samples at most two scenarios; it does not cover the entire run.'] };
await writeFile(`${OUT}pipeline.json`, JSON.stringify(result, null, 2));
emit({ event: 'model-pipeline', deterministicFailed, output: `${OUT}pipeline.json` });
process.exitCode = deterministicFailed ? 1 : 0;
