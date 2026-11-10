import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewPlan, reviewScreenshots } from './client.js';

const valid = { summary: 'No proven issue', checks: [], issues: [], nextChecks: ['Check status against the wire'] };
test('deduplicates simultaneous requests and caches validated responses', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'model-cache-')); let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ message: { content: JSON.stringify(valid) } }); };
  try {
    const options = { cacheDir, fetch: fetcher };
    const [a, b] = await Promise.all([reviewPlan('facts', options), reviewPlan('facts', options)]);
    assert.equal(calls, 1); assert.equal(a.advisory, true); assert.deepEqual(a, b);
    assert.equal((await reviewPlan('facts', options)).cached, true); assert.equal(calls, 1);
    await reviewPlan('different facts', options); assert.equal(calls, 2);
  } finally { await rm(cacheDir, { recursive: true, force: true }); }
});
test('rejects hallucinated malformed claims and treats failures as unavailable', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'model-invalid-'));
  try {
    const result = await reviewPlan('facts', { cacheDir, fetch: async () => Response.json({ message: { content: JSON.stringify({ ...valid, issues: [{ title: 'bug', confidence: 2 }] }) } }) });
    assert.equal(result.status, 'unavailable'); assert.equal(result.review, undefined);
    const offline = await reviewPlan('other facts', { cacheDir, fetch: async () => { throw new Error('offline'); } });
    assert.equal(offline.status, 'unavailable'); assert.equal(offline.error, 'offline');
  } finally { await rm(cacheDir, { recursive: true, force: true }); }
});
test('sends screenshot bytes to the vision model and requires image evidence', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'model-image-'));
  try {
    await assert.rejects(() => reviewScreenshots('contract', []), /requires/);
    await reviewScreenshots('contract', [Buffer.from('image-bytes')], { cacheDir, fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'qwen3-vl:8b-instruct');
      assert.equal(body.messages[1].images[0], Buffer.from('image-bytes').toString('base64'));
      return Response.json({ message: { content: JSON.stringify(valid) } });
    } });
  } finally { await rm(cacheDir, { recursive: true, force: true }); }
});
test('aborts a slow request at its deadline', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'model-timeout-'));
  try {
    const result = await reviewPlan('slow', { cacheDir, timeoutMs: 30, fetch: async (_url, init) => new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('deadline failed')), 500);
      init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('deadline')); }, { once: true });
    }) });
    assert.equal(result.status, 'unavailable'); assert.match(result.error!, /deadline/); assert.ok(result.durationMs < 500);
  } finally { await rm(cacheDir, { recursive: true, force: true }); }
});
