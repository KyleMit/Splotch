// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOfflineLibrary } from '../../experiments/native-architecture/src/offlineLibrary/useOfflineLibrary.ts';
import { subscribeNetworkReturn } from '../../experiments/native-architecture/src/platform/networkReturn.web.ts';

const host = vi.hoisted(() => ({ appState: null, networkReturn: null, status: 'ready' }));
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
const library = vi.hoisted(() => ({
  subscribe: () => () => {},
  snapshot: vi.fn(),
  initialize: vi.fn(async () => {}),
  setActive: vi.fn(),
  setDrawing: vi.fn(),
  engage: vi.fn(),
  retry: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/offlineLibrary/runtime.ts', () => ({
  offlineLibrary: library,
}));

function Probe({ drawing }) {
  useOfflineLibrary(drawing, false);
  return null;
}

let root;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host.status = 'ready';
  const snapshots = new Map();
  library.snapshot.mockImplementation(() => {
    if (!snapshots.has(host.status)) snapshots.set(host.status, { status: host.status });
    return snapshots.get(host.status);
  });
  library.retry.mockClear();
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(createElement(Probe, { drawing: false })));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

describe('status-driven coloring download retry', () => {
  it.each(['failed', 'waiting'])(
    'retries a %s download when the app returns to the foreground or the network returns',
    (status) => {
      host.status = status;
      host.appState('background');
      expect(library.retry).not.toHaveBeenCalled();
      host.appState('active');
      expect(library.retry).toHaveBeenCalledOnce();
      host.networkReturn();
      expect(library.retry).toHaveBeenCalledTimes(2);
    }
  );

  it.each(['ready', 'downloading', 'loading', 'removing'])(
    'leaves a %s library alone',
    (status) => {
      host.status = status;
      host.appState('active');
      host.networkReturn();
      expect(library.retry).not.toHaveBeenCalled();
    }
  );

  it('never retries because drawing stopped', async () => {
    host.status = 'failed';
    await act(async () => root.render(createElement(Probe, { drawing: true })));
    await act(async () => root.render(createElement(Probe, { drawing: false })));
    expect(library.retry).not.toHaveBeenCalled();
  });

  it('stops listening when the screen unmounts', async () => {
    await act(async () => root.unmount());
    expect(host.appState).toBeNull();
    expect(host.networkReturn).toBeNull();
    root = createRoot(document.createElement('div'));
  });
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
