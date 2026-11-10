import { AxeBuilder } from '@axe-core/playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { test, expect } from '../lib/fixtures.js';
import { narrate } from '../lib/overlay.js';

interface Allowance { id: string; impact: string; selector: string; reason: string }
const baseline = JSON.parse(await readFile(new URL('../contracts/a11y-baseline.json', import.meta.url), 'utf8')) as {
  pages: Record<string, Allowance[]>;
};

test('S13 @visual @a11y cockpit and control panel introduce no serious accessibility barriers', async ({ page, cockpit, api, isolatedDrone }, info) => {
  test.skip(info.project.name !== 'desktop', 'Reviewed desktop accessibility baseline');
  void isolatedDrone;
  for (const name of ['cockpit', 'dashboard']) {
    if (name === 'cockpit') { await cockpit.open(); await cockpit.waitReady(); }
    else {
      await page.goto(`${api.baseURL}/dashboard`);
      await expect(page.getByTestId('dash-socket')).toHaveText('connected');
      await expect(page.getByTestId(`dash-takeoff-${isolatedDrone.id}`)).toBeVisible();
      await page.locator('details summary').click();
    }
    await narrate(page, `S13: Audit ${name}, including button names; allow only reviewed baseline contrast issues.`);
    // The shared caption is aria-hidden and noninteractive, so it remains readable in the scan video.
    const result = await new AxeBuilder({ page }).analyze();
    const unexpected: string[] = [];
    for (const violation of result.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')) {
      for (const node of violation.nodes) {
        // A rule-wide exemption would hide a new defect; each allowance must match this exact node and severity.
        const allowed = await page.evaluate(({ target, entries, id, impact }) => {
          if (target.length !== 1 || typeof target[0] !== 'string') return false;
          const element = document.querySelector(target[0]);
          return !!element && entries.some(entry => entry.id === id && entry.impact === impact && element.matches(entry.selector));
        }, { target: node.target, entries: baseline.pages[name] ?? [], id: violation.id, impact: violation.impact });
        if (!allowed) unexpected.push(`${violation.id} (${violation.impact}) at ${JSON.stringify(node.target)}: ${node.failureSummary}`);
      }
    }
    const auditPath = info.outputPath(`${name}-axe.json`);
    await writeFile(auditPath, JSON.stringify(result, null, 2));
    await info.attach(`${name}-axe.json`, { path: auditPath, contentType: 'application/json' });
    await narrate(page, `S13: ${name} audit complete; ${unexpected.length} new serious/critical barriers.`);
    expect(unexpected, `Operators face new serious/critical accessibility barriers on ${name}; unnamed buttons cannot communicate their action`).toEqual([]);
  }
});
