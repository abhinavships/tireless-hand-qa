# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: S07-video-truth.spec.ts >> S07 · video off/live labels match actual playback and selected stream @video @visual
- Location: scenarios/S07-video-truth.spec.ts:26:1

# Error details

```
Error: Stopped stream must be labelled off; a live label would mislead the operator

expect(locator).toHaveText(expected) failed

Locator:  getByTestId('video-state')
Expected: "off"
Received: "live"
Timeout:  10000ms

Call log:
  - Stopped stream must be labelled off; a live label would mislead the operator getByTestId('video-state') with timeout 10000ms
  - waiting for getByTestId('video-state')
    23 × locator resolved to <span data-testid="video-state" class="muted video-state video-state-live">live</span>
       - unexpected value "live"

```

```yaml
- text: live
```

# Test source

```ts
  1  | import type { Page } from '@playwright/test';
  2  | import { test, expect } from '../lib/fixtures.js';
  3  | import { narrate } from '../lib/overlay.js';
  4  | import { TruthSocket, topic } from '../lib/socket.js';
  5  | 
  6  | type VideoTruth = { enabled: boolean; url: string | null };
  7  | 
  8  | /** Observe decoded playback, rather than trusting the component's live label. */
  9  | async function expectPlayback(page: Page, name: string) {
  10 |   const player = page.locator('video[data-testid="video-player"]');
  11 |   await expect(player, `${name}: live video must contain an actual video element`).toBeVisible();
  12 |   await expect.poll(() => player.evaluate(el => (el as HTMLVideoElement).videoWidth), {
  13 |     timeout: 30_000, message: `${name}: a live label must be backed by decoded video frames`,
  14 |   }).toBeGreaterThan(0);
  15 |   const first = await player.evaluate(el => (el as HTMLVideoElement).currentTime);
  16 |   const started = Date.now();
  17 |   await expect.poll(async () => {
  18 |     const now = await player.evaluate(el => {
  19 |       const video = el as HTMLVideoElement;
  20 |       return { time: video.currentTime, width: video.videoWidth, paused: video.paused };
  21 |     });
  22 |     return Date.now() - started >= 2_000 && now.time - first >= 1 && now.width > 0 && !now.paused;
  23 |   }, { timeout: 15_000, message: `${name}: video labelled live must advance currentTime over a two-second observation` }).toBe(true);
  24 | }
  25 | 
  26 | test('S07 · video off/live labels match actual playback and selected stream @video @visual', async ({
  27 |   appLock, api, cockpit, page, isolatedDrone,
  28 | }) => {
  29 |   void appLock;
  30 |   test.setTimeout(150_000);
  31 |   const truth = new TruthSocket();
  32 |   let secondId: string | undefined;
  33 |   const whepRequests: string[] = [];
  34 |   page.on('request', request => {
  35 |     if (request.method() === 'POST' && /\/whep(?:\?|$)/.test(request.url())) whepRequests.push(request.url());
  36 |   });
  37 |   try {
  38 |     await api.clearFaults();
  39 |     secondId = (await api.addDrone({ name: `${isolatedDrone.name}-camera-B` })).drone.id;
  40 |     await truth.connect();
  41 |     const firstTopic = topic(isolatedDrone.id, 'video');
  42 |     const secondTopic = topic(secondId, 'video');
  43 |     truth.subscribe(firstTopic);
  44 |     truth.subscribe(secondTopic);
  45 |     await api.video('stop', isolatedDrone.id);
  46 |     await api.video('stop', secondId);
  47 |     await truth.waitFor<VideoTruth>(firstTopic, value => !value.enabled);
  48 |     await cockpit.open();
  49 |     await cockpit.waitReady();
  50 |     await cockpit.selectDrone(isolatedDrone.id);
  51 |     await narrate(page, 'S07 · stream stopped: operator must see Off and the Video off placeholder');
> 52 |     await expect(cockpit.videoLabel(), 'Stopped stream must be labelled off; a live label would mislead the operator').toHaveText('off');
     |                                                                                                                        ^ Error: Stopped stream must be labelled off; a live label would mislead the operator
  53 |     await expect(page.getByTestId('video-player'), 'Stopped stream must show the Video off placeholder').toContainText('Video off');
  54 |     await expect(page.locator('video[data-testid="video-player"]'), 'Stopped stream must not retain a live player').toHaveCount(0);
  55 | 
  56 |     await narrate(page, 'S07 · start camera A: require decoded frames and two seconds of advancing playback');
  57 |     truth.messages.delete(firstTopic);
  58 |     await api.video('start', isolatedDrone.id);
  59 |     const firstTruth = await truth.waitFor<VideoTruth>(firstTopic, value => value.enabled && !!value.url);
  60 |     await expect(cockpit.videoLabel(), 'Started stream must recover to live without reloading the cockpit').toHaveText('live', { timeout: 45_000 });
  61 |     await expectPlayback(page, isolatedDrone.name);
  62 |     await expect.poll(() => whepRequests.includes(firstTruth.url!), {
  63 |       message: 'Camera A playback must request the stream URL announced for the selected drone',
  64 |     }).toBe(true);
  65 | 
  66 |     await narrate(page, 'S07 · switch to camera B: the selected drone must use its own stream');
  67 |     truth.messages.delete(secondTopic);
  68 |     await api.video('start', secondId);
  69 |     const secondTruth = await truth.waitFor<VideoTruth>(secondTopic, value => value.enabled && !!value.url);
  70 |     expect(secondTruth.url, 'Different drones must announce different video streams').not.toBe(firstTruth.url);
  71 |     const requestCount = whepRequests.length;
  72 |     await cockpit.selectDrone(secondId);
  73 |     await expect(page.locator('.video-header'), 'Video header must identify the newly selected drone').toContainText(`${isolatedDrone.name}-camera-B`);
  74 |     await expect.poll(() => whepRequests.slice(requestCount).includes(secondTruth.url!), {
  75 |       timeout: 30_000, message: 'Switching drones must request camera B stream rather than continue camera A',
  76 |     }).toBe(true);
  77 |     await expect(cockpit.videoLabel(), 'Camera B must become live after selection').toHaveText('live', { timeout: 45_000 });
  78 |     await expectPlayback(page, `${isolatedDrone.name}-camera-B`);
  79 |   } finally {
  80 |     truth.close();
  81 |     try { await api.clearFaults(); }
  82 |     finally {
  83 |       try { await api.video('stop', isolatedDrone.id); }
  84 |       finally { if (secondId) await api.removeDrone(secondId); }
  85 |     }
  86 |   }
  87 | });
  88 | 
```