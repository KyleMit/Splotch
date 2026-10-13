// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOfflineLibrary } from '../../experiments/native-architecture/src/offlineLibrary/useOfflineLibrary.ts';
import { subscribeNetworkReturn } from '../../experiments/native-architecture/src/platform/networkReturn.web.ts';
import { createOfflineLibrary } from '../../experiments/native-architecture/src/offlineLibrary/controller.ts';

const host = vi.hoisted(() => ({ appState: null, networkReturn: null }));
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_type, listener) => {
      host.appState = listener;
      return { remove: () => (host.appState = null) };
    },
  },
}));
vi.mock('../../experiments/native-architecture/src/platform/networkReturn.ts', () => ({
  subscribeNetworkReturn: (listener) => {
    host.networkReturn = listener;
    return () => (host.networkReturn = null);
  },
}));
const library = vi.hoisted(() => {
  const snapshot = { status: 'failed' };
  return {
    subscribe: () => () => {},
    snapshot: () => snapshot,
    initialize: async () => {},
    setActive: () => {},
    setDrawing: () => {},
    engage: () => {},
    retryStalled: vi.fn(),
  };
});
vi.mock('../../experiments/native-architecture/src/offlineLibrary/runtime.ts', () => ({
  offlineLibrary: library,
}));

function Probe({ drawing }) {
  useOfflineLibrary(drawing, false);
  return null;
}

describe('the drawing screen’s ambient download retry', () => {
  let root;
  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    library.retryStalled.mockClear();
    root = createRoot(document.createElement('div'));
    await act(async () => root.render(createElement(Probe, { drawing: false })));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it('asks for one on the return to the foreground and the network’s return', () => {
    host.appState('background');
    expect(library.retryStalled).not.toHaveBeenCalled();
    host.appState('active');
    expect(library.retryStalled).toHaveBeenCalledOnce();
    host.networkReturn();
    expect(library.retryStalled).toHaveBeenCalledTimes(2);
  });

  it('never asks because drawing stopped', async () => {
    await act(async () => root.render(createElement(Probe, { drawing: true })));
    await act(async () => root.render(createElement(Probe, { drawing: false })));
    expect(library.retryStalled).not.toHaveBeenCalled();
  });

  it('stops listening when the screen unmounts', async () => {
    await act(async () => root.unmount());
    expect(host.appState).toBeNull();
    expect(host.networkReturn).toBeNull();
    root = createRoot(document.createElement('div'));
  });
});

// A library whose network, policy writes and transfers the test controls; a transfer that starts
// stays pending, so its call is the evidence that a download began.
function fakePlatform() {
  const network = { online: true, failWrite: false };
  const platform = {
    environment: async () => ({ online: network.online, metered: false, freeBytes: 1e9 }),
    list: async () => [],
    read: async () => null,
    write: vi.fn(async () => {
      if (network.failWrite) throw new Error('ENOSPC: no space left on device');
    }),
    move: async () => {},
    remove: async () => {},
    uri: (path) => path,
    verify: async () => false,
    download: vi.fn(() => new Promise(() => {})),
    dispose() {},
  };
  const owner = createOfflineLibrary(platform, 'full');
  owner.setFeatureEnabled(true);
  return { network, platform, owner };
}
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('retryStalled on the real controller', () => {
  it('retries a download waiting for the network', async () => {
    const { network, platform, owner } = fakePlatform();
    network.online = false;
    await owner.initialize();
    owner.engage();
    await owner.settled();
    expect(owner.snapshot()).toMatchObject({ status: 'waiting', fault: 'offline' });
    network.online = true;
    owner.retryStalled();
    await vi.waitFor(() => expect(platform.download).toHaveBeenCalled());
    owner.dispose();
  });

  // Negative control: retry() in its place lifts the removal's pause and starts downloading.
  it('keeps a failed removal’s pause through foreground and network returns', async () => {
    const { network, platform, owner } = fakePlatform();
    await owner.initialize();
    network.failWrite = true;
    await owner.remove(async () => []);
    expect(owner.snapshot()).toMatchObject({ status: 'failed', enabled: true });
    network.failWrite = false;
    owner.engage();
    owner.retryStalled();
    await turn();
    await owner.settled();
    expect(platform.download).not.toHaveBeenCalled();
    expect(owner.snapshot().status).toBe('failed');
    owner.dispose();
  });
});

describe('subscribeNetworkReturn on the web', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'connection');
  });

  it('reports the browser coming back online, until unsubscribed', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNetworkReturn(listener);
    window.dispatchEvent(new Event('online'));
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    window.dispatchEvent(new Event('online'));
    expect(listener).toHaveBeenCalledOnce();
  });

  it('reports a connection change, such as mobile data to Wi-Fi while online', () => {
    const connection = new EventTarget();
    Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
    const listener = vi.fn();
    const unsubscribe = subscribeNetworkReturn(listener);
    connection.dispatchEvent(new Event('change'));
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    connection.dispatchEvent(new Event('change'));
    expect(listener).toHaveBeenCalledOnce();
  });
});
