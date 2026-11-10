import { defineConfig } from '@playwright/test';
const runId=process.env.RUN_ID??'default';
if(!/^[a-zA-Z0-9_-]+$/.test(runId))throw new Error('RUN_ID must contain only letters, numbers, underscore or hyphen');
export default defineConfig({
 globalSetup: './lib/run-lock.ts',
 testDir: './scenarios', timeout: 60_000, expect: { timeout: 10_000 }, fullyParallel: false,
 workers: 1, retries: 0, outputDir: `./test-results/${runId}/artifacts`,
 reporter: [['list'], ['html', { outputFolder: `test-results/${runId}/html`, open: 'never' }], ['json', { outputFile: `test-results/${runId}/results.json` }]],
 use: { baseURL: process.env.COCKPIT_URL ?? 'http://localhost:4010', browserName: 'chromium', video: 'on', trace: 'on', screenshot: 'on', launchOptions: { slowMo: Number(process.env.SLOWMO ?? 0) } },
 projects: [
  { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
  { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
 ],
});
