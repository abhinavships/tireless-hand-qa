import type { Page } from '@playwright/test';
import { test, expect } from '../lib/fixtures.js';
import { narrate } from '../lib/overlay.js';
import { TruthSocket, topic } from '../lib/socket.js';

type VideoTruth = { enabled: boolean; url: string | null };

/** Observe decoded playback, rather than trusting the component's live label. */
async function expectPlayback(page: Page, name: string) {
  const player = page.locator('video[data-testid="video-player"]');
  await expect(player, `${name}: live video must contain an actual video element`).toBeVisible();
  await expect.poll(() => player.evaluate(el => (el as HTMLVideoElement).videoWidth), {
    timeout: 30_000, message: `${name}: a live label must be backed by decoded video frames`,
  }).toBeGreaterThan(0);
  const first = await player.evaluate(el => (el as HTMLVideoElement).currentTime);
  const started = Date.now();
  await expect.poll(async () => {
    const now = await player.evaluate(el => {
      const video = el as HTMLVideoElement;
      return { time: video.currentTime, width: video.videoWidth, paused: video.paused };
    });
    return Date.now() - started >= 2_000 && now.time - first >= 1 && now.width > 0 && !now.paused;
  }, { timeout: 15_000, message: `${name}: video labelled live must advance currentTime over a two-second observation` }).toBe(true);
}

test('S07 · video off/live labels match actual playback and selected stream @video @visual', async ({
  appLock, api, cockpit, page, isolatedDrone,
}) => {
  void appLock;
  test.setTimeout(150_000);
  const truth = new TruthSocket();
  let secondId: string | undefined;
  const whepRequests: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /\/whep(?:\?|$)/.test(request.url())) whepRequests.push(request.url());
  });
  try {
    await api.clearFaults();
    secondId = (await api.addDrone({ name: `${isolatedDrone.name}-camera-B` })).drone.id;
    await truth.connect();
    const firstTopic = topic(isolatedDrone.id, 'video');
    const secondTopic = topic(secondId, 'video');
    truth.subscribe(firstTopic);
    truth.subscribe(secondTopic);
    await api.video('stop', isolatedDrone.id);
    await api.video('stop', secondId);
    await truth.waitFor<VideoTruth>(firstTopic, value => !value.enabled);
    await cockpit.open();
    await cockpit.waitReady();
    await cockpit.selectDrone(isolatedDrone.id);
    await narrate(page, 'S07 · stream stopped: operator must see Off and the Video off placeholder');
    await expect(cockpit.videoLabel(), 'Stopped stream must be labelled off; a live label would mislead the operator').toHaveText('off');
    await expect(page.getByTestId('video-player'), 'Stopped stream must show the Video off placeholder').toContainText('Video off');
    await expect(page.locator('video[data-testid="video-player"]'), 'Stopped stream must not retain a live player').toHaveCount(0);

    await narrate(page, 'S07 · start camera A: require decoded frames and two seconds of advancing playback');
    truth.messages.delete(firstTopic);
    await api.video('start', isolatedDrone.id);
    const firstTruth = await truth.waitFor<VideoTruth>(firstTopic, value => value.enabled && !!value.url);
    await expect(cockpit.videoLabel(), 'Started stream must recover to live without reloading the cockpit').toHaveText('live', { timeout: 45_000 });
    await expectPlayback(page, isolatedDrone.name);
    await expect.poll(() => whepRequests.includes(firstTruth.url!), {
      message: 'Camera A playback must request the stream URL announced for the selected drone',
    }).toBe(true);

    await narrate(page, 'S07 · switch to camera B: the selected drone must use its own stream');
    truth.messages.delete(secondTopic);
    await api.video('start', secondId);
    const secondTruth = await truth.waitFor<VideoTruth>(secondTopic, value => value.enabled && !!value.url);
    expect(secondTruth.url, 'Different drones must announce different video streams').not.toBe(firstTruth.url);
    const requestCount = whepRequests.length;
    await cockpit.selectDrone(secondId);
    await expect(page.locator('.video-header'), 'Video header must identify the newly selected drone').toContainText(`${isolatedDrone.name}-camera-B`);
    await expect.poll(() => whepRequests.slice(requestCount).includes(secondTruth.url!), {
      timeout: 30_000, message: 'Switching drones must request camera B stream rather than continue camera A',
    }).toBe(true);
    await expect(cockpit.videoLabel(), 'Camera B must become live after selection').toHaveText('live', { timeout: 45_000 });
    await expectPlayback(page, `${isolatedDrone.name}-camera-B`);
  } finally {
    truth.close();
    try { await api.clearFaults(); }
    finally {
      try { await api.video('stop', isolatedDrone.id); }
      finally { if (secondId) await api.removeDrone(secondId); }
    }
  }
});
