// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../web/src/lib/storageKeys.ts';
import { useOnline } from '../../experiments/native-architecture/src/platform/useOnline.ts';
import { useOnline as useWebOnline } from '../../experiments/native-architecture/src/platform/useOnline.web.ts';
import { subscribeNetworkReturn } from '../../experiments/native-architecture/src/platform/networkReturn.ts';

const sdk = vi.hoisted(() => ({
  stored: null,
  read: vi.fn(),
  listen: vi.fn(),
  remove: vi.fn(),
  listener: null,
}));
vi.mock('expo-network', () => ({
  getNetworkStateAsync: sdk.read,
  addNetworkStateListener: sdk.listen,
}));
vi.mock('expo-file-system', () => ({
  Paths: { document: 'file:///owned/' },
  File: class {
    get exists() {
      return sdk.stored !== null;
    }
    textSync() {
      return sdk.stored;
    }
    create() {}
    writeSync(value) {
      sdk.stored = value;
    }
  },
}));
let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  sdk.stored = 'false';
  sdk.read.mockReset().mockImplementation(() => new Promise(() => {}));
  sdk.remove.mockClear();
  sdk.listen.mockReset().mockImplementation((listener) => {
    sdk.listener = listener;
    return { remove: sdk.remove };
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  localStorage.clear();
});
async function show(hook = useOnline) {
  function Status() {
    return createElement('span', null, String(hook()));
  }
  await act(async () => root.render(createElement(Status)));
}

it('keeps the last offline status until native connectivity arrives and saves later events', async () => {
  await show();
  expect(host.textContent).toBe('false');
  await act(async () => sdk.listener({ isConnected: true }));
  expect(host.textContent).toBe('true');
  expect(sdk.stored).toBe('true');
  await act(async () => root.unmount());
  expect(sdk.remove).toHaveBeenCalledOnce();
});

it('does not overwrite a native connectivity event with an older status read', async () => {
  let release;
  sdk.read.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  await show();
  await act(async () => sdk.listener({ isConnected: false }));
  await act(async () => release({ isConnected: true }));
  expect(host.textContent).toBe('false');
  expect(sdk.stored).toBe('false');
});

it('follows browser connectivity immediately and persists its changes', async () => {
  let connected = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => connected);
  await show(useWebOnline);
  expect(host.textContent).toBe('true');
  connected = false;
  await act(async () => window.dispatchEvent(new Event('offline')));
  expect(host.textContent).toBe('false');
  expect(localStorage.getItem(STORAGE_KEYS.lastNetworkOnline)).toBe('false');
  connected = true;
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(host.textContent).toBe('true');
});

it('declares the native network module where Expo autolinking reads it', () => {
  const native = JSON.parse(
    readFileSync(
      new NodeURL('../../experiments/native-architecture/package.json', import.meta.url),
      'utf8'
    )
  );
  const version = native.devDependencies['expo-network'];
  expect(version).toBeDefined();
  const pods = readFileSync(
    new NodeURL('../../experiments/native-architecture/ios/Podfile.lock', import.meta.url),
    'utf8'
  );
  expect(pods).toContain(`- ExpoNetwork (${version})`);
});

it('retries coloring downloads on native connectivity return and network changes until unsubscribed', () => {
  const retry = vi.fn();
  const unsubscribe = subscribeNetworkReturn(retry);
  expect(sdk.listen).toHaveBeenCalledOnce();
  expect(sdk.read).not.toHaveBeenCalled();
  sdk.listener({ isConnected: false });
  sdk.listener({ isConnected: undefined });
  expect(retry).not.toHaveBeenCalled();
  sdk.listener({ isConnected: true, type: 'CELLULAR' });
  sdk.listener({ isConnected: true, type: 'WIFI' });
  expect(retry).toHaveBeenCalledTimes(2);
  expect(sdk.stored).toBe('false');
  unsubscribe();
  expect(sdk.remove).toHaveBeenCalledOnce();
  sdk.listener({ isConnected: true });
  expect(retry).toHaveBeenCalledTimes(2);
});
