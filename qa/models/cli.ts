import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { reviewPlan, reviewScreenshots } from './client.js';

const [mode, contextPath, ...imagePaths] = process.argv.slice(2);
if (!['plan', 'triage', 'vision', 'both'].includes(mode) || !contextPath || (['vision', 'both'].includes(mode) && !imagePaths.length)) {
  console.error('Usage: npx tsx models/cli.ts plan|triage context.json\n       npx tsx models/cli.ts vision|both context.json screenshot.png [after.png]');
  process.exitCode = 2;
} else {
  try {
    const context = await readFile(resolve(contextPath), 'utf8');
    const images = await Promise.all(imagePaths.map(p => readFile(resolve(p))));
    const results = [];
    if (mode !== 'vision') results.push({ role: 'coding', ...await reviewPlan(context) });
    if (mode === 'vision' || mode === 'both') results.push({ role: 'vision', ...await reviewScreenshots(context, images) });
    const report = { createdAt: new Date().toISOString(), advisory: true, results };
    const output = resolve(process.env.MODEL_REPORT ?? 'models/out/latest.json');
    await mkdir(resolve(output, '..'), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ event: 'model-review', ...report, output }));
    if (results.some(r => r.status === 'unavailable')) process.exitCode = 2;
  } catch (e) { console.error(e instanceof Error ? e.message : e); process.exitCode = 2; }
}
