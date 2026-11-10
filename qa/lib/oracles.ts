import { expect, type Locator, type Page } from '@playwright/test';

/** Numeric telemetry keyed by the operator-facing measurement names. */
export type TelemetryValues = Record<string, number | null | undefined>;
/** Absolute tolerance for every field, or individual tolerances with an optional default. */
export type TelemetryTolerance = number | Record<string, number>;

const normalise = (value: string) => value.trim().toLowerCase().replace(/^(socket|dock)\s+/, '').replace(/[\s-]+/g, '_');

/** Assert a status label agrees with API/socket truth, allowing a bounded live-data update delay. */
export async function expectStatusMatchesTruth(
  locator: Locator,
  truth: string | boolean | { status?: string; simulator?: string; connected?: boolean },
  options: { timeout?: number; subject?: string } = {},
): Promise<void> {
  const expected = typeof truth === 'string' ? truth : typeof truth === 'boolean'
    ? (truth ? 'connected' : 'disconnected')
    : truth.status ?? truth.simulator ?? (truth.connected === undefined ? undefined : truth.connected ? 'connected' : 'disconnected');
  if (expected === undefined) throw new Error('Status oracle needs an explicit ground-truth status.');
  const target = normalise(expected);
  await expect.poll(async () => normalise(await locator.innerText()), {
    timeout: options.timeout ?? 5_000,
    message: `${options.subject ?? 'Operator status'} contradicts API/socket truth: expected ${expected}; stale or incorrect status can mislead the operator`,
  }).toBe(target);
}

/** Compare displayed telemetry to an API snapshot within explicit absolute numeric tolerances. */
export function expectTelemetryMatchesState(
  actual: TelemetryValues,
  expected: TelemetryValues,
  tolerance: TelemetryTolerance = 1,
): void {
  const fields = Object.keys(expected);
  expect(fields.length, 'Telemetry ground truth must contain at least one measurement').toBeGreaterThan(0);
  for (const field of fields) {
    const truth = expected[field];
    if (truth === undefined || truth === null) continue;
    const displayed = actual[field];
    const tol = typeof tolerance === 'number' ? tolerance : tolerance[field] ?? tolerance.default ?? 1;
    expect(Number.isFinite(truth), `${field}: API ground truth must be a finite number`).toBe(true);
    expect(Number.isFinite(displayed), `${field}: operator sees missing or non-numeric telemetry instead of ${truth}`).toBe(true);
    expect(Number.isFinite(tol) && tol >= 0, `${field}: tolerance must be finite and nonnegative`).toBe(true);
    const rawDifference = Math.abs(displayed! - truth);
    const difference = field.toLowerCase() === 'heading'
      ? Math.min(rawDifference % 360, 360 - rawDifference % 360) : rawDifference;
    expect(difference, `${field}: operator sees ${displayed}, but API says ${truth} (allowed difference ${tol}); telemetry may belong to the wrong drone or be stale`).toBeLessThanOrEqual(tol);
  }
}

/** Scroll a control into reach and verify its centre is visible, unclipped, enabled and hit-testable. */
export async function expectVisibleAndUsable(locator: Locator): Promise<void> {
  await expect(locator, 'Operator cannot see the required control or region').toBeVisible();
  await expect(locator, 'Operator cannot use the disabled control').toBeEnabled();
  await locator.scrollIntoViewIfNeeded();
  const result = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const issues: string[] = [];
    if (rect.width <= 0 || rect.height <= 0) issues.push('has no visible area');
    if (rect.left < -1 || rect.right > viewportWidth + 1) issues.push('extends outside the horizontal viewport');
    if (x < 0 || x >= viewportWidth || y < 0 || y >= viewportHeight) issues.push('centre remains outside the viewport after scrolling');
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const box = ancestor.getBoundingClientRect();
      // Scrollable containers are allowed: scrolling is a normal route to reach a control.
      if (['hidden', 'clip'].includes(style.overflowX) && (rect.left < box.left - 1 || rect.right > box.right + 1)) issues.push('is horizontally clipped by an ancestor');
      if (['hidden', 'clip'].includes(style.overflowY) && (rect.top < box.top - 1 || rect.bottom > box.bottom + 1)) issues.push('is vertically clipped by an ancestor');
    }
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === element || element.contains(hit))) issues.push(`centre is covered by ${hit ? hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '') : 'no reachable element'}`);
    return { label: element.getAttribute('data-testid') ?? element.textContent?.trim().slice(0, 100) ?? element.tagName, issues };
  });
  expect(result.issues, `Operator cannot reach/use ${result.label}: ${result.issues.join('; ')}`).toEqual([]);
}

/** Assert the page does not require horizontal scrolling to reach its content. */
export async function expectNoHorizontalScroll(page: Page, tolerance = 1): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    content: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.content - dimensions.viewport, `Operator must scroll horizontally: content ${dimensions.content}px exceeds viewport ${dimensions.viewport}px`).toBeLessThanOrEqual(tolerance);
}

/** Assert two visible peer regions do not geometrically overlap beyond a rounding tolerance. */
export async function expectNoOverlap(a: Locator, b: Locator, tolerance = 1): Promise<void> {
  await expect(a, 'First region is missing from the operator view').toBeVisible();
  await expect(b, 'Second region is missing from the operator view').toBeVisible();
  const [first, second] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  if (!first || !second) throw new Error('Operator regions have no visible bounding boxes.');
  const width = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
  const height = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  expect(width > tolerance && height > tolerance, `Operator regions overlap by ${Math.max(0, width).toFixed(1)}×${Math.max(0, height).toFixed(1)}px, obscuring content`).toBe(false);
}

/** Assert user-supplied markup is displayed literally and creates no injected elements. */
export async function expectTextNotHtml(locator: Locator, text: string): Promise<void> {
  await expect(locator, 'User-supplied name must appear as literal text, not interpreted HTML').toHaveText(text);
  const tags = [...text.matchAll(/<\s*([a-z][a-z0-9-]*)\b/gi)].map((match) => match[1].toLowerCase());
  for (const tag of new Set(tags)) {
    await expect(locator.locator(tag), `User-supplied ${tag} markup became an HTML element; names must render safely as text`).toHaveCount(0);
  }
}
