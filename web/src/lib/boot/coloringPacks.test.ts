import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLORING_PACK_CACHE_FAMILY_PREFIX } from '$lib/coloringPacks/cacheKeys';
import { COLORING_PACK_POLICY_EVENT } from '$lib/coloringPacks/policy';

const mocks = vi.hoisted(() => ({
  idleQueue: [] as (() => void)[],
  cancelIdle: vi.fn(),
  settings: { coloringBookEnabled: true },
  start: vi.fn(),
  stop: vi.fn(),
  createDownloader: vi.fn(),
  cacheNames: [] as string[],
  isNative: vi.fn(),
  setNoDownloadedColoringBooks: vi.fn(),
}));

vi.mock('$lib/idle', () => ({
  scheduleIdle: (callback: () => void) => {
    mocks.idleQueue.push(callback);
    return mocks.cancelIdle;
  },
}));
vi.mock('$lib/state/settings.svelte', () => ({ settingsState: mocks.settings }));
vi.mock('$lib/state/coloringPacks.svelte', () => ({
  setNoDownloadedColoringBooks: mocks.setNoDownloadedColoringBooks,
}));
vi.mock('$lib/platform', () => ({ isNative: mocks.isNative }));
vi.mock('$lib/coloringPacks/manager', () => ({
  createColoringPackDownloader: mocks.createDownloader,
}));

import { installColoringPackDownloads, type ColoringPackDownloads } from './coloringPacks';

let downloads: ColoringPackDownloads | undefined;

beforeEach(() => {
  mocks.idleQueue.length = 0;
  mocks.settings.coloringBookEnabled = true;
  mocks.cacheNames = [`${COLORING_PACK_CACHE_FAMILY_PREFIX}v2-full`];
  vi.stubGlobal('caches', { keys: async () => mocks.cacheNames });
  mocks.isNative.mockReturnValue(false);
  mocks.createDownloader.mockReturnValue({ start: mocks.start, stop: mocks.stop });
});

afterEach(() => {
  downloads?.stop();
  downloads = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

// Longer than any chain of already-settled promises the scheduler awaits, so a
// negative assertion after it cannot pass merely by asserting too early.
const settlePromises = () => new Promise<void>((done) => setTimeout(done, 0));

describe('a device that holds pack storage', () => {
  it('waits for durable settings before scheduling downloads', async () => {
    const settingsReady = deferred();

    downloads = installColoringPackDownloads(settingsReady.promise);

    await settlePromises();
    expect(mocks.idleQueue).toHaveLength(0);
    settingsReady.resolve();
    await vi.waitFor(() => expect(mocks.idleQueue).toHaveLength(1));
    expect(mocks.setNoDownloadedColoringBooks).not.toHaveBeenCalled();
  });

  it('keeps downloads dormant when the saved setting is disabled, then starts after enabling', async () => {
    mocks.settings.coloringBookEnabled = false;
    downloads = installColoringPackDownloads(Promise.resolve());

    await settlePromises();
    expect(mocks.idleQueue).toHaveLength(0);

    mocks.settings.coloringBookEnabled = true;
    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));
    await vi.waitFor(() => expect(mocks.idleQueue).toHaveLength(1));

    mocks.idleQueue[0]?.();
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  });

  it('cancels pending idle work and rechecks the policy before starting', async () => {
    downloads = installColoringPackDownloads(Promise.resolve());
    await vi.waitFor(() => expect(mocks.idleQueue).toHaveLength(1));

    const pendingIdleWork = mocks.idleQueue[0];
    mocks.settings.coloringBookEnabled = false;
    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));

    expect(mocks.cancelIdle).toHaveBeenCalledOnce();
    pendingIdleWork?.();
    await vi.waitFor(() => expect(mocks.createDownloader).not.toHaveBeenCalled());
  });

  it('does not schedule a second downloader while the manager chunk is loading', async () => {
    downloads = installColoringPackDownloads(Promise.resolve());
    await vi.waitFor(() => expect(mocks.idleQueue).toHaveLength(1));

    mocks.idleQueue[0]?.();
    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));

    await settlePromises();
    expect(mocks.idleQueue).toHaveLength(1);
    await vi.waitFor(() => expect(mocks.createDownloader).toHaveBeenCalledOnce());
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it('retries a manager chunk that failed to load on the next engagement', async () => {
    let failuresLeft = 1;
    const loadManager = async () => {
      if (failuresLeft-- > 0) throw new TypeError('Failed to fetch dynamically imported module');
      return { createColoringPackDownloader: mocks.createDownloader };
    };
    downloads = installColoringPackDownloads(Promise.resolve(), loadManager);
    await vi.waitFor(() => expect(mocks.idleQueue).toHaveLength(1));

    mocks.idleQueue.shift()?.();
    await settlePromises();
    expect(mocks.start).not.toHaveBeenCalled();

    downloads.engage();
    await vi.waitFor(() => expect(mocks.idleQueue).toHaveLength(1));
    mocks.idleQueue.shift()?.();
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  });
});

describe('a web visit with no pack storage', () => {
  beforeEach(() => {
    mocks.cacheNames = ['workbox-precache-v2', 'pages'];
  });

  it('publishes only the starter book and loads nothing until the child engages', async () => {
    downloads = installColoringPackDownloads(Promise.resolve());

    await vi.waitFor(() => expect(mocks.setNoDownloadedColoringBooks).toHaveBeenCalledWith('web'));
    await settlePromises();
    expect(mocks.idleQueue).toHaveLength(0);
    expect(mocks.createDownloader).not.toHaveBeenCalled();

    downloads.engage();
    downloads.engage();
    await vi.waitFor(() => expect(mocks.idleQueue).toHaveLength(1));
    mocks.idleQueue[0]?.();
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    expect(mocks.createDownloader).toHaveBeenCalledOnce();
  });

  it('starts once the storage check lands when the child engaged before it', async () => {
    downloads = installColoringPackDownloads(Promise.resolve());
    downloads.engage();

    await vi.waitFor(() => expect(mocks.idleQueue).toHaveLength(1));
    expect(mocks.setNoDownloadedColoringBooks).toHaveBeenCalledOnce();
    mocks.idleQueue[0]?.();
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  });

  it('does not start when the feature is turned off while it waits', async () => {
    downloads = installColoringPackDownloads(Promise.resolve());
    await vi.waitFor(() => expect(mocks.setNoDownloadedColoringBooks).toHaveBeenCalledOnce());

    mocks.settings.coloringBookEnabled = false;
    window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));
    downloads.engage();

    await settlePromises();
    expect(mocks.idleQueue).toHaveLength(0);
  });

  it('treats an engine without Cache Storage as holding no packs', async () => {
    vi.stubGlobal('caches', undefined);
    downloads = installColoringPackDownloads(Promise.resolve());

    await vi.waitFor(() => expect(mocks.setNoDownloadedColoringBooks).toHaveBeenCalledWith('web'));
  });
});

describe('a native launch', () => {
  it('schedules downloads without checking storage or waiting for engagement', async () => {
    mocks.isNative.mockReturnValue(true);
    const keys = vi.fn(async () => []);
    vi.stubGlobal('caches', { keys });
    downloads = installColoringPackDownloads(Promise.resolve());

    await vi.waitFor(() => expect(mocks.idleQueue).toHaveLength(1));
    expect(keys).not.toHaveBeenCalled();
    expect(mocks.setNoDownloadedColoringBooks).not.toHaveBeenCalled();
  });
});
