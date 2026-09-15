import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNetwork, type NetworkState } from './network.svelte';

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
  });

  it('seeds from navigator.onLine and follows the online/offline events', () => {
    const state = installNetwork();
    expect(state.online).toBe(true);

    window.dispatchEvent(new Event('offline'));
    expect(state.online).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(state.online).toBe(true);
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
