/** Explicit, read-only source review; generated hypotheses never execute. */
import { realpath, readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewPlan } from './client.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const files = process.argv.slice(2);
if (!files.length || files.length > 12) throw new Error('Pass 1–12 explicit product/ or qa/ source files (paths relative to project root)');
const sources = [];
const original = new Map<string, string[]>();
for (const file of files) {
  const path = await realpath(resolve(ROOT, file)); const rel = relative(ROOT, path);
  if (!/^(product|qa)\//.test(rel) || !['.ts', '.tsx', '.js', '.jsx', '.html'].includes(extname(path)) || /(^|\/)(node_modules|out|test-results|secrets)(\/|$)/.test(rel)) throw new Error(`Not an allowed source path: ${file}`);
  const source = await readFile(path, 'utf8');
  original.set(rel, source.split('\n'));
  sources.push({ file: rel, source: source.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n') });
}
const context = JSON.stringify({ goal: 'Read source to propose concrete bug and security hypotheses. Every issue evidence MUST use format "file:line | exact unmodified code substring from that line". Copy the file name and code accurately. Identify input-to-sink flows, missing guards, stale state and UI mismatches. Suggest localhost runtime checks that could confirm or disprove each hypothesis. Source inspection alone is not a reproduced finding. Do not label arbitrary command enums as shell injection without showing a shell execution sink.', sources });
const result = await reviewPlan(context);
if (result.review) {
  const grounded = result.review.issues.filter(issue => {
    const match = issue.evidence.match(/^(.+):(\d+)\s*\|\s*(.+)$/);
    return match && match[3].trim().length >= 8 && original.get(match[1])?.[Number(match[2]) - 1]?.includes(match[3].trim());
  });
  const rejected = result.review.issues.length - grounded.length;
  result.review.issues = grounded;
  result.review.summary = `${grounded.length} source-grounded advisory hypotheses; ${rejected} unsupported source citations discarded. Runtime confirmation is required.`;
}
const output = fileURLToPath(new URL('./out/source-review.json', import.meta.url));
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ from: 'models', event: 'model-review', role: 'source', ...result }));
if (result.status === 'unavailable') process.exitCode = 2;
