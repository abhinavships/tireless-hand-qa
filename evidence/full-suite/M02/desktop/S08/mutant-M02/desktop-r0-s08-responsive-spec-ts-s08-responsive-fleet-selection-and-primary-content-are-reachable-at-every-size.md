# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S08-responsive.spec.ts >> S08 @responsive · fleet selection and primary content are reachable at every size
- Location: scenarios/S08-responsive.spec.ts:4:1

# Error details

```
Error: Operator cannot see the required control or region

expect(locator).toBeVisible() failed

Locator: getByRole('link', { name: /Control panel/ })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Operator cannot see the required control or region getByRole('link', { name: /Control panel/ }) with timeout 10000ms
  - waiting for getByRole('link', { name: /Control panel/ })

```

```yaml
- banner: FlytBase Cockpit socket connected
- complementary:
  - heading "Devices" [level=2]
  - list:
    - listitem: Drone 1 Dock 1 dock closed standby
    - listitem: Drone 2 Dock 2 dock closed standby
    - listitem: Drone 3 Dock 3 dock closed standby
    - listitem: Drone 4 Dock 4 dock closed standby
    - listitem: QA-da45a959 Dock 225 dock closed standby
  - heading "Drone Telemetry · QA-da45a959 standby" [level=2]
  - term: Battery
  - definition: 100 %
  - term: Altitude RLT
  - definition: 0.0 m
  - term: Altitude AGL
  - definition: 0.0 m
  - term: Altitude ASL
  - definition: 560.0 m
  - term: H-Speed
  - definition: 0.0 m/s
  - term: V-Speed
  - definition: 0.0 m/s
  - term: Heading
  - definition: 38 °
  - term: Wind
  - definition: NE 2.6 m/s
  - term: Dist. from home
  - definition: 0 m
- main:
  - group "Map view":
    - button "2D"
    - button "3D" [pressed]
  - text: FPV · QA-da45a959 off Video off
```

# Test source

```ts
  1   | import { expect, type Locator, type Page } from '@playwright/test';
  2   | 
  3   | /** Numeric telemetry keyed by the operator-facing measurement names. */
  4   | export type TelemetryValues = Record<string, number | null | undefined>;
  5   | /** Absolute tolerance for every field, or individual tolerances with an optional default. */
  6   | export type TelemetryTolerance = number | Record<string, number>;
  7   | 
  8   | const normalise = (value: string) => value.trim().toLowerCase().replace(/^(socket|dock)\s+/, '').replace(/[\s-]+/g, '_');
  9   | 
  10  | /** Assert a status label agrees with API/socket truth, allowing a bounded live-data update delay. */
  11  | export async function expectStatusMatchesTruth(
  12  |   locator: Locator,
  13  |   truth: string | boolean | { status?: string; simulator?: string; connected?: boolean },
  14  |   options: { timeout?: number; subject?: string } = {},
  15  | ): Promise<void> {
  16  |   const expected = typeof truth === 'string' ? truth : typeof truth === 'boolean'
  17  |     ? (truth ? 'connected' : 'disconnected')
  18  |     : truth.status ?? truth.simulator ?? (truth.connected === undefined ? undefined : truth.connected ? 'connected' : 'disconnected');
  19  |   if (expected === undefined) throw new Error('Status oracle needs an explicit ground-truth status.');
  20  |   const target = normalise(expected);
  21  |   await expect.poll(async () => normalise(await locator.innerText()), {
  22  |     timeout: options.timeout ?? 5_000,
  23  |     message: `${options.subject ?? 'Operator status'} contradicts API/socket truth: expected ${expected}; stale or incorrect status can mislead the operator`,
  24  |   }).toBe(target);
  25  | }
  26  | 
  27  | /** Compare displayed telemetry to an API snapshot within explicit absolute numeric tolerances. */
  28  | export function expectTelemetryMatchesState(
  29  |   actual: TelemetryValues,
  30  |   expected: TelemetryValues,
  31  |   tolerance: TelemetryTolerance = 1,
  32  | ): void {
  33  |   const fields = Object.keys(expected);
  34  |   expect(fields.length, 'Telemetry ground truth must contain at least one measurement').toBeGreaterThan(0);
  35  |   for (const field of fields) {
  36  |     const truth = expected[field];
  37  |     if (truth === undefined || truth === null) continue;
  38  |     const displayed = actual[field];
  39  |     const tol = typeof tolerance === 'number' ? tolerance : tolerance[field] ?? tolerance.default ?? 1;
  40  |     expect(Number.isFinite(truth), `${field}: API ground truth must be a finite number`).toBe(true);
  41  |     expect(Number.isFinite(displayed), `${field}: operator sees missing or non-numeric telemetry instead of ${truth}`).toBe(true);
  42  |     expect(Number.isFinite(tol) && tol >= 0, `${field}: tolerance must be finite and nonnegative`).toBe(true);
  43  |     const rawDifference = Math.abs(displayed! - truth);
  44  |     const difference = field.toLowerCase() === 'heading'
  45  |       ? Math.min(rawDifference % 360, 360 - rawDifference % 360) : rawDifference;
  46  |     expect(difference, `${field}: operator sees ${displayed}, but API says ${truth} (allowed difference ${tol}); telemetry may belong to the wrong drone or be stale`).toBeLessThanOrEqual(tol);
  47  |   }
  48  | }
  49  | 
  50  | /** Scroll a control into reach and verify its centre is visible, unclipped, enabled and hit-testable. */
  51  | export async function expectVisibleAndUsable(locator: Locator): Promise<void> {
> 52  |   await expect(locator, 'Operator cannot see the required control or region').toBeVisible();
      |                                                                               ^ Error: Operator cannot see the required control or region
  53  |   await expect(locator, 'Operator cannot use the disabled control').toBeEnabled();
  54  |   await locator.scrollIntoViewIfNeeded();
  55  |   const result = await locator.evaluate((element) => {
  56  |     const rect = element.getBoundingClientRect();
  57  |     const x = rect.left + rect.width / 2;
  58  |     const y = rect.top + rect.height / 2;
  59  |     const viewportWidth = document.documentElement.clientWidth;
  60  |     const viewportHeight = document.documentElement.clientHeight;
  61  |     const issues: string[] = [];
  62  |     if (rect.width <= 0 || rect.height <= 0) issues.push('has no visible area');
  63  |     if (rect.left < -1 || rect.right > viewportWidth + 1) issues.push('extends outside the horizontal viewport');
  64  |     if (x < 0 || x >= viewportWidth || y < 0 || y >= viewportHeight) issues.push('centre remains outside the viewport after scrolling');
  65  |     for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
  66  |       const style = getComputedStyle(ancestor);
  67  |       const box = ancestor.getBoundingClientRect();
  68  |       // Scrollable containers are allowed: scrolling is a normal route to reach a control.
  69  |       if (['hidden', 'clip'].includes(style.overflowX) && (rect.left < box.left - 1 || rect.right > box.right + 1)) issues.push('is horizontally clipped by an ancestor');
  70  |       if (['hidden', 'clip'].includes(style.overflowY) && (rect.top < box.top - 1 || rect.bottom > box.bottom + 1)) issues.push('is vertically clipped by an ancestor');
  71  |     }
  72  |     const hit = document.elementFromPoint(x, y);
  73  |     if (!hit || !(hit === element || element.contains(hit))) issues.push(`centre is covered by ${hit ? hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '') : 'no reachable element'}`);
  74  |     return { label: element.getAttribute('data-testid') ?? element.textContent?.trim().slice(0, 100) ?? element.tagName, issues };
  75  |   });
  76  |   expect(result.issues, `Operator cannot reach/use ${result.label}: ${result.issues.join('; ')}`).toEqual([]);
  77  | }
  78  | 
  79  | /** Assert the page does not require horizontal scrolling to reach its content. */
  80  | export async function expectNoHorizontalScroll(page: Page, tolerance = 1): Promise<void> {
  81  |   const dimensions = await page.evaluate(() => ({
  82  |     content: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
  83  |     viewport: document.documentElement.clientWidth,
  84  |   }));
  85  |   expect(dimensions.content - dimensions.viewport, `Operator must scroll horizontally: content ${dimensions.content}px exceeds viewport ${dimensions.viewport}px`).toBeLessThanOrEqual(tolerance);
  86  | }
  87  | 
  88  | /** Assert two visible peer regions do not geometrically overlap beyond a rounding tolerance. */
  89  | export async function expectNoOverlap(a: Locator, b: Locator, tolerance = 1): Promise<void> {
  90  |   await expect(a, 'First region is missing from the operator view').toBeVisible();
  91  |   await expect(b, 'Second region is missing from the operator view').toBeVisible();
  92  |   const [first, second] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  93  |   if (!first || !second) throw new Error('Operator regions have no visible bounding boxes.');
  94  |   const width = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
  95  |   const height = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  96  |   expect(width > tolerance && height > tolerance, `Operator regions overlap by ${Math.max(0, width).toFixed(1)}×${Math.max(0, height).toFixed(1)}px, obscuring content`).toBe(false);
  97  | }
  98  | 
  99  | /** Assert user-supplied markup is displayed literally and creates no injected elements. */
  100 | export async function expectTextNotHtml(locator: Locator, text: string): Promise<void> {
  101 |   await expect(locator, 'User-supplied name must appear as literal text, not interpreted HTML').toHaveText(text);
  102 |   const tags = [...text.matchAll(/<\s*([a-z][a-z0-9-]*)\b/gi)].map((match) => match[1].toLowerCase());
  103 |   for (const tag of new Set(tags)) {
  104 |     await expect(locator.locator(tag), `User-supplied ${tag} markup became an HTML element; names must render safely as text`).toHaveCount(0);
  105 |   }
  106 | }
  107 | 
```