// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAiAvailability } from '../../src/product/useAiAvailability.ts';

const appState = vi.hoisted(() => ({ listeners: new Set() }));
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_type, listener) => {
      appState.listeners.add(listener);
      return { remove: () => appState.listeners.delete(listener) };
    },
  },
}));

let root, host, owner;
function Probe({ aiEnabled, online }) {
  useAiAvailability(owner, { status: 'ready', aiEnabled }, online);
  return null;
}
const render = (props) => act(async () => root.render(createElement(Probe, props)));
const foreground = () =>
  act(async () => {
    for (const listener of appState.listeners) listener('active');
  });

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  root = createRoot(host);
  owner = { state: { availability: 'ready' }, inspect: vi.fn(), getState: () => owner.state };
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it('keeps a known allowance through a reconnect, as shipping’s followEligibility does', async () => {
  await render({ aiEnabled: true, online: true });
  expect(owner.inspect).toHaveBeenCalledTimes(1);
  await render({ aiEnabled: true, online: false });
  await render({ aiEnabled: true, online: true });
  expect(owner.inspect).toHaveBeenCalledTimes(1);
  owner.state = { availability: 'unavailable' };
  await render({ aiEnabled: true, online: false });
  await render({ aiEnabled: true, online: true });
  expect(owner.inspect).toHaveBeenCalledTimes(2);
});

it('looks at the allowance again when AI is turned back on, online or once back online', async () => {
  await render({ aiEnabled: true, online: true });
  await render({ aiEnabled: false, online: true });
  await render({ aiEnabled: true, online: true });
  expect(owner.inspect).toHaveBeenCalledTimes(2);
  await render({ aiEnabled: false, online: false });
  await render({ aiEnabled: true, online: false });
  expect(owner.inspect).toHaveBeenCalledTimes(2);
  await render({ aiEnabled: true, online: true });
  expect(owner.inspect).toHaveBeenCalledTimes(3);
});

it('retries only an unknown allowance on a return to the foreground', async () => {
  await render({ aiEnabled: true, online: true });
  await foreground();
  expect(owner.inspect).toHaveBeenCalledTimes(1);
  owner.state = { availability: 'unavailable' };
  await foreground();
  expect(owner.inspect).toHaveBeenCalledTimes(2);
});
