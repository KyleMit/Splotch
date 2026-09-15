import { beforeEach, describe, expect, it, vi } from 'vitest';

const scheduler = vi.hoisted(() => ({
  idle: [] as Array<{ active: boolean; run: () => void }>,
  interaction: [] as Array<{ active: boolean; run: () => void }>,
}));

function enqueue(queue: typeof scheduler.idle, run: () => void) {
  const entry = { active: true, run };
  queue.push(entry);
  return () => {
    entry.active = false;
  };
}

vi.mock('$lib/idle', () => ({
  scheduleIdle: (run: () => void) => enqueue(scheduler.idle, run),
  scheduleInteractionIdle: (run: () => void) => enqueue(scheduler.interaction, run),
}));

const overlays = vi.hoisted(() => ({
  ParentalGate: () => {},
  ColorPicker: () => {},
  ColoringBook: () => {},
  AiImagePrompt: () => {},
  AiWaitingPolaroid: () => {},
  AiImageResult: () => {},
  InstallBanner: () => {},
  SettingsModal: () => {},
}));

vi.mock('$lib/components/overlayChunk', () => overlays);

import { mountBootHiddenOverlays, type BootHiddenOverlayKey } from './bootHiddenOverlays';

async function flushNext(queue: typeof scheduler.idle) {
  let entry = queue.shift();
  while (entry && !entry.active) entry = queue.shift();
  expect(entry).toBeDefined();
  entry?.run();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForActive(queue: typeof scheduler.idle) {
  await vi.waitFor(() => expect(queue.some((entry) => entry.active)).toBe(true));
}

describe('mountBootHiddenOverlays', () => {
  beforeEach(() => {
    scheduler.idle.length = 0;
    scheduler.interaction.length = 0;
  });

  it('loads at boot idle and mounts one resident per interaction-quiet slice', async () => {
    const mounted: BootHiddenOverlayKey[] = [];
    mountBootHiddenOverlays((key) => mounted.push(key));

    expect(mounted).toEqual([]);
    await flushNext(scheduler.idle);
    expect(mounted).toEqual([]);
    await waitForActive(scheduler.interaction);

    const expected: BootHiddenOverlayKey[] = [
      'parentalGate',
      'colorPicker',
      'coloringBook',
      'aiPrompt',
      'aiWaiting',
      'aiResult',
      'installBanner',
      'settings',
    ];
    for (const key of expected) {
      await flushNext(scheduler.interaction);
      expect(mounted.at(-1)).toBe(key);
    }
    expect(mounted).toEqual(expected);
    expect(scheduler.interaction).toEqual([]);
  });

  it('mounts demand before unrelated background work and never mounts it twice', async () => {
    const mounted: BootHiddenOverlayKey[] = [];
    const controller = mountBootHiddenOverlays((key) => mounted.push(key));

    controller.demand('coloringBook');
    await vi.waitFor(() => expect(mounted).toEqual(['coloringBook']));
    expect(scheduler.idle.every((entry) => !entry.active)).toBe(true);
    expect(mounted).toEqual(['coloringBook']);

    controller.demand('coloringBook');
    await flushNext(scheduler.interaction);
    expect(mounted).toEqual(['coloringBook', 'parentalGate']);
  });

  it('invalidates pending background work when a new demand arrives', async () => {
    const mounted: BootHiddenOverlayKey[] = [];
    const controller = mountBootHiddenOverlays((key) => mounted.push(key));
    await flushNext(scheduler.idle);
    await waitForActive(scheduler.interaction);
    const staleBackground = scheduler.interaction.find((entry) => entry.active)!;

    controller.demand('settings');
    expect(mounted).toEqual(['settings']);
    staleBackground.run();
    expect(mounted).toEqual(['settings']);
    await flushNext(scheduler.interaction);
    expect(mounted).toEqual(['settings', 'parentalGate']);
  });

  it('mounts the AI return surface before the result modal', async () => {
    const mounted: BootHiddenOverlayKey[] = [];
    const controller = mountBootHiddenOverlays((key) => mounted.push(key));

    controller.demand('aiResult');
    await vi.waitFor(() => expect(mounted).toEqual(['aiWaiting', 'aiResult']));
  });

  it('retries a failed chunk load at idle, a bounded number of times, and at once on demand', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let failuresLeft = 5;
    // The stand-in catalog crosses the loader's typed boundary the same way the
    // module mock above does.
    const loadChunk = vi.fn(async () => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error('chunk fetch failed');
      }
      return overlays as unknown as typeof import('$lib/components/overlayChunk');
    });
    const mounted: BootHiddenOverlayKey[] = [];
    const controller = mountBootHiddenOverlays((key) => mounted.push(key), loadChunk);

    // The boot attempt plus three idle retries, then idle gives up.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await flushNext(scheduler.idle);
      expect(loadChunk).toHaveBeenCalledTimes(attempt);
    }
    expect(scheduler.idle.some((entry) => entry.active)).toBe(false);

    // A demand retries regardless of the budget, and its own failure is answered
    // at once: one more failure, then the load lands.
    controller.demand('settings');
    await vi.waitFor(() => expect(mounted).toEqual(['settings']));
    expect(loadChunk).toHaveBeenCalledTimes(6);
    error.mockRestore();
  });

  it('retries at once for a demand that arrived during a pending attempt, past the idle budget', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const attempts: Array<{ resolve: () => void; reject: () => void }> = [];
    const loadChunk = vi.fn(
      () =>
        new Promise<typeof import('$lib/components/overlayChunk')>((resolve, reject) => {
          attempts.push({
            resolve: () =>
              resolve(overlays as unknown as typeof import('$lib/components/overlayChunk')),
            reject: () => reject(new Error('chunk fetch failed')),
          });
        })
    );
    const mounted: BootHiddenOverlayKey[] = [];
    const controller = mountBootHiddenOverlays((key) => mounted.push(key), loadChunk);

    // Burn the idle budget: the boot attempt and three idle retries all fail.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await flushNext(scheduler.idle);
      attempts[attempt - 1].reject();
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(loadChunk).toHaveBeenCalledTimes(4);
    expect(scheduler.idle.some((entry) => entry.active)).toBe(false);

    // A demand starts an attempt; a second demand lands while it is pending.
    controller.demand('settings');
    expect(loadChunk).toHaveBeenCalledTimes(5);
    controller.demand('aiResult');
    attempts[4].reject();
    await Promise.resolve();
    await Promise.resolve();

    // The failure answers the waiting demand at once, with no idle slot to wait for.
    expect(loadChunk).toHaveBeenCalledTimes(6);
    expect(scheduler.idle.some((entry) => entry.active)).toBe(false);
    attempts[5].resolve();
    await vi.waitFor(() => expect(mounted).toEqual(['settings', 'aiWaiting', 'aiResult']));
    error.mockRestore();
  });

  it('stops idle and import continuations from mounting residents', async () => {
    const mounted: BootHiddenOverlayKey[] = [];
    const controller = mountBootHiddenOverlays((key) => mounted.push(key));
    controller.stop();

    scheduler.idle.forEach((entry) => entry.run());
    await Promise.resolve();
    await Promise.resolve();
    expect(mounted).toEqual([]);
    controller.demand('settings');
    expect(mounted).toEqual([]);
  });
});
