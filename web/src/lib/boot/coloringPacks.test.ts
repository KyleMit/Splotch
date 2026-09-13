import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLORING_PACK_POLICY_EVENT } from '$lib/coloringPacks/policy';

const mocks = vi.hoisted(() => ({
  idleQueue: [] as (() => void)[],
  cancelIdle: vi.fn(),
  settings: { coloringBookEnabled: true },
  start: vi.fn(),
  stop: vi.fn(),
  createDownloader: vi.fn(),
  storageExists: vi.fn(),
  isNative: vi.fn(),
  setNoDownloadedColoringBooks: vi.fn(),
}));

vi.mock('$lib/idle', () => ({
  scheduleIdle: (callback: () => void) => {
    mocks.idleQueue.push(callback);
    return mocks.cancelIdle;
  },
}));
vi.mock('$lib/state/settings.svelte', () => ({ settings: mocks.settings }));
vi.mock('$lib/state/coloringPacks.svelte', () => ({
  setNoDownloadedColoringBooks: mocks.setNoDownloadedColoringBooks,
}));
vi.mock('$lib/coloringPacks/cacheKeys', () => ({
  webColoringPackStorageExists: mocks.storageExists,
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
  mocks.storageExists.mockResolvedValue(true);
  mocks.isNative.mockReturnValue(false);
  mocks.createDownloader.mockReturnValue({ start: mocks.start, stop: mocks.stop });
});

afterEach(() => {
  downloads?.stop();
  downloads = undefined;
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

describe('installColoringPackDownloads', () => {
  it('waits for durable settings before scheduling downloads', async () => {
    const settingsReady = deferred();

    downloads = installColoringPackDownloads(settingsReady.promise);

    await settlePromises();
    expect(mocks.storageExists).not.toHaveBeenCalled();
    expect(mocks.idleQueue).toHaveLength(0);
    settingsReady.resolve();
    await vi.waitFor(() => expect(mocks.idleQueue).toHaveLength(1));
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
});

describe('a web visit with no pack storage', () => {
  beforeEach(() => {
    mocks.storageExists.mockResolvedValue(false);
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
});

describe('a native launch', () => {
  it('schedules downloads at boot without checking for engagement', async () => {
    mocks.isNative.mockReturnValue(true);
    mocks.storageExists.mockResolvedValue(false);
    downloads = installColoringPackDownloads(Promise.resolve());

    await vi.waitFor(() => expect(mocks.idleQueue).toHaveLength(1));
    expect(mocks.storageExists).not.toHaveBeenCalled();
    expect(mocks.setNoDownloadedColoringBooks).not.toHaveBeenCalled();
  });
});
