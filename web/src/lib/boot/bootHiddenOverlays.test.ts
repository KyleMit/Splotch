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
