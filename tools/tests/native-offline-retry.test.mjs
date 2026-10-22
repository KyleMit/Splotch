// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOfflineLibrary } from '../../src/offlineLibrary/useOfflineLibrary.ts';
import { subscribeNetworkReturn } from '../../src/platform/networkReturn.web.ts';
import { createOfflineLibrary } from '../../src/offlineLibrary/controller.ts';

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
vi.mock('../../src/platform/networkReturn.ts', () => ({
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
    engage: vi.fn(),
    retryStalled: vi.fn(),
  };
});
vi.mock('../../src/offlineLibrary/runtime.ts', () => ({
  offlineLibrary: library,
}));

function Probe({ drawing, pickerOpen = false, committedStrokes = 0 }) {
  useOfflineLibrary(drawing, pickerOpen, committedStrokes);
  return null;
}

describe('the drawing screen’s ambient download retry', () => {
  let root;
  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    library.retryStalled.mockClear();
    library.engage.mockClear();
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

  it('engages downloads after three committed strokes or opening the picker', async () => {
    expect(library.engage).not.toHaveBeenCalled();
    await act(async () => root.render(createElement(Probe, { committedStrokes: 2 })));
    expect(library.engage).not.toHaveBeenCalled();
    await act(async () => root.render(createElement(Probe, { committedStrokes: 3 })));
    expect(library.engage).toHaveBeenCalledOnce();
    library.engage.mockClear();
    await act(async () => root.render(createElement(Probe, { pickerOpen: true })));
    expect(library.engage).toHaveBeenCalledOnce();
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
  const network = { online: true, failWrite: false, failRemove: false };
  const files = new Map();
  const platform = {
    environment: async () => ({ online: network.online, metered: false, freeBytes: 1e9 }),
    list: async () => {
      if (network.failRemove) throw new Error('Coloring storage could not be removed.');
      return [
        ...new Set(
          [...files.keys()].filter((path) => path.includes('/')).map((path) => path.split('/')[0])
        ),
      ];
    },
    read: async (path) => files.get(path) ?? null,
    write: vi.fn(async (path, bytes) => {
      if (network.failWrite) throw new Error('ENOSPC: no space left on device');
      files.set(path, new Uint8Array(bytes));
    }),
    move: async (from, to) => {
      files.set(to, files.get(from));
      files.delete(from);
    },
    remove: async () => {
      if (network.failRemove) throw new Error('Coloring storage could not be removed.');
    },
    uri: (path) => path,
    verify: async (path, expected) => {
      const bytes = files.get(path);
      return (
        bytes !== undefined &&
        bytes.length === expected.bytes &&
        createHash('sha256').update(bytes).digest('hex') === expected.sha256
      );
    },
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
    network.failRemove = true;
    await owner.remove();
    expect(owner.snapshot()).toMatchObject({ status: 'failed', enabled: true });
    network.failRemove = false;
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
