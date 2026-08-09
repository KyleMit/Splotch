import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLORING_PACK_POLICY_EVENT } from '$lib/coloringPacks/policy';

const mocks = vi.hoisted(() => ({
  idleQueue: [] as (() => void)[],
  cancelIdle: vi.fn(),
  settings: { coloringBookEnabled: true },
  start: vi.fn(),
  stop: vi.fn(),
  createDownloader: vi.fn(),
}));

vi.mock('$lib/idle', () => ({
  scheduleIdle: (callback: () => void) => {
    mocks.idleQueue.push(callback);
    return mocks.cancelIdle;
  },
}));
vi.mock('$lib/state/settings.svelte', () => ({ settings: mocks.settings }));
vi.mock('$lib/coloringPacks/manager', () => ({
  createColoringPackDownloader: mocks.createDownloader,
}));

import { installColoringPackDownloads } from './coloringPacks';

let teardown: (() => void) | undefined;

beforeEach(() => {
  mocks.idleQueue.length = 0;
  mocks.settings.coloringBookEnabled = true;
  mocks.createDownloader.mockReturnValue({ start: mocks.start, stop: mocks.stop });
});

afterEach(() => {
  teardown?.();
  teardown = undefined;
  vi.clearAllMocks();
});

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('installColoringPackDownloads', () => {
  it('waits for durable settings before scheduling downloads', async () => {
    const settingsReady = deferred();

    teardown = installColoringPackDownloads(settingsReady.promise);

    expect(mocks.idleQueue).toHaveLength(0);
    settingsReady.resolve();
    await vi.waitFor(() => expect(mocks.idleQueue).toHaveLength(1));
  });

  it('keeps downloads dormant when the saved setting is disabled, then starts after enabling', async () => {
    mocks.settings.coloringBookEnabled = false;
    teardown = installColoringPackDownloads(Promise.resolve());

    await Promise.resolve();
    expect(mocks.idleQueue).toHaveLength(0);

    mocks.settings.coloringBookEnabled = true;
    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));
    expect(mocks.idleQueue).toHaveLength(1);

    mocks.idleQueue[0]?.();
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  });

  it('cancels pending idle work and rechecks the policy before starting', async () => {
    teardown = installColoringPackDownloads(Promise.resolve());
    await vi.waitFor(() => expect(mocks.idleQueue).toHaveLength(1));

    const pendingIdleWork = mocks.idleQueue[0];
    mocks.settings.coloringBookEnabled = false;
    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));

    expect(mocks.cancelIdle).toHaveBeenCalledOnce();
    pendingIdleWork?.();
    await vi.waitFor(() => expect(mocks.createDownloader).not.toHaveBeenCalled());
  });
});
