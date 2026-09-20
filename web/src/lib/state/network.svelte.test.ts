import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNetwork, networkState, type NetworkState } from './network.svelte';
import { STORAGE_KEYS } from '$lib/storageKeys';

type StatusListener = (status: { connected: boolean }) => void;

const mocks = vi.hoisted(() => ({
  native: false,
  getStatus: vi.fn<() => Promise<{ connected: boolean }>>(),
  addListener:
    vi.fn<(event: string, listener: StatusListener) => Promise<{ remove: () => void }>>(),
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/platform')>()),
  isNative: () => mocks.native,
}));
vi.mock('@capacitor/network', () => ({
  Network: { getStatus: mocks.getStatus, addListener: mocks.addListener },
}));

let network: NetworkState | null = null;

beforeEach(() => networkState.dispose());

function installNetwork() {
  network = createNetwork();
  network.install();
  return network;
}

afterEach(() => {
  network?.dispose();
  network = null;
});

describe('web network status', () => {
  beforeEach(() => {
    mocks.native = false;
    vi.clearAllMocks();
    localStorage.removeItem(STORAGE_KEYS.lastNetworkOnline);
  });

  it('seeds from navigator.onLine and follows the online/offline events', () => {
    const state = installNetwork();
    expect(state.online).toBe(true);

    window.dispatchEvent(new Event('offline'));
    expect(state.online).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.lastNetworkOnline)).toBe('false');

    window.dispatchEvent(new Event('online'));
    expect(state.online).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.lastNetworkOnline)).toBe('true');
  });

  it('uses the stored state before the platform status arrives', () => {
    const state = createNetwork(undefined, false);
    network = state;
    expect(state.online).toBe(false);

    state.install();
    expect(state.online).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.lastNetworkOnline)).toBe('true');
  });

  it('stops following the events once disposed', () => {
    const state = installNetwork();
    state.dispose();

    window.dispatchEvent(new Event('offline'));

    expect(state.online).toBe(true);
  });

  it('installs its listeners once', () => {
    const state = installNetwork();
    const addListener = vi.spyOn(window, 'addEventListener');

    state.install();

    expect(addListener).not.toHaveBeenCalled();
    addListener.mockRestore();
  });
});

describe('native network status', () => {
  beforeEach(() => {
    mocks.native = true;
    vi.clearAllMocks();
    localStorage.removeItem(STORAGE_KEYS.lastNetworkOnline);
  });

  it('keeps a status change that arrives before the initial status read resolves', async () => {
    let resolveStatus!: (status: { connected: boolean }) => void;
    mocks.getStatus.mockReturnValue(new Promise((resolve) => (resolveStatus = resolve)));
    let listener: StatusListener | undefined;
    mocks.addListener.mockImplementation(async (_event, callback) => {
      listener = callback;
      return { remove: () => {} };
    });

    const state = installNetwork();
    await vi.waitFor(() => expect(listener).toBeDefined());

    listener!({ connected: false });
    resolveStatus({ connected: true });
    await vi.waitFor(() => expect(mocks.getStatus).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.online).toBe(false);
  });

  it('uses the initial native status when no event has arrived', async () => {
    mocks.getStatus.mockResolvedValue({ connected: false });
    mocks.addListener.mockResolvedValue({ remove: () => {} });

    const state = installNetwork();

    await vi.waitFor(() => expect(state.online).toBe(false));
    expect(mocks.getStatus).toHaveBeenCalledOnce();
    expect(localStorage.getItem(STORAGE_KEYS.lastNetworkOnline)).toBe('false');
  });

  it('keeps a stored offline state until the native plugin reports connectivity', async () => {
    let resolveStatus!: (status: { connected: boolean }) => void;
    mocks.getStatus.mockReturnValue(new Promise((resolve) => (resolveStatus = resolve)));
    mocks.addListener.mockResolvedValue({ remove: () => {} });
    network = createNetwork(undefined, false);
    network.install();
    await vi.waitFor(() => expect(mocks.getStatus).toHaveBeenCalledOnce());

    expect(network.online).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.lastNetworkOnline)).toBeNull();

    window.dispatchEvent(new Event('online'));
    expect(network.online).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.lastNetworkOnline)).toBeNull();

    resolveStatus({ connected: true });
    await vi.waitFor(() => expect(network?.online).toBe(true));
    expect(localStorage.getItem(STORAGE_KEYS.lastNetworkOnline)).toBe('true');
  });

  it('applies later events after the initial native status', async () => {
    mocks.getStatus.mockResolvedValue({ connected: false });
    let listener: StatusListener | undefined;
    mocks.addListener.mockImplementation(async (_event, callback) => {
      listener = callback;
      return { remove: () => {} };
    });
    const state = installNetwork();
    await vi.waitFor(() => expect(state.online).toBe(false));

    listener!({ connected: true });
    expect(state.online).toBe(true);
    listener!({ connected: false });
    expect(state.online).toBe(false);
  });

  it('subscribes to nothing when disposed while the plugin is still loading', async () => {
    mocks.getStatus.mockResolvedValue({ connected: false });
    mocks.addListener.mockResolvedValue({ remove: () => {} });
    let deliverPlugin!: () => void;
    const pluginLoaded = new Promise<void>((resolve) => (deliverPlugin = resolve));
    network = createNetwork(() =>
      pluginLoaded.then(() => ({
        Network: { getStatus: mocks.getStatus, addListener: mocks.addListener },
      }))
    );
    network.install();

    network.dispose();
    deliverPlugin();
    await pluginLoaded;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.getStatus).not.toHaveBeenCalled();
    expect(mocks.addListener).not.toHaveBeenCalled();
    expect(network.online).toBe(true);
  });

  it('removes the native listener and ignores late events once disposed', async () => {
    mocks.getStatus.mockResolvedValue({ connected: true });
    const remove = vi.fn();
    let listener: StatusListener | undefined;
    mocks.addListener.mockImplementation(async (_event, callback) => {
      listener = callback;
      return { remove };
    });
    const state = installNetwork();
    await vi.waitFor(() => expect(listener).toBeDefined());

    state.dispose();
    listener!({ connected: false });

    expect(remove).toHaveBeenCalledOnce();
    expect(state.online).toBe(true);
  });
});
