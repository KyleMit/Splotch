// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  autoOverridesSystemLock,
  useDeviceOrientation,
  useOrientationLockApplies,
} from '../../src/platform/deviceOrientation.web.ts';

let root, host, fullscreenElement, coarse, applies;
const orientation = { lock: vi.fn(async () => {}), unlock: vi.fn() };

function Probe({ choice }) {
  useDeviceOrientation(choice);
  applies = useOrientationLockApplies();
  return null;
}
async function render(choice) {
  await act(async () => root.render(createElement(Probe, { choice })));
}
async function setFullscreen(element) {
  fullscreenElement = element;
  await act(async () => document.dispatchEvent(new Event('fullscreenchange')));
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  fullscreenElement = null;
  coarse = true;
  orientation.lock.mockClear();
  orientation.unlock.mockClear();
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(window.screen, 'orientation', {
    configurable: true,
    get: () => orientation,
  });
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query === '(pointer: coarse)' && coarse,
  }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

it('locks a touch browser only in fullscreen, and again on every fullscreen entry', async () => {
  await render('landscape');
  expect(applies).toBe(false);
  expect(orientation.lock).not.toHaveBeenCalled();
  await setFullscreen(document.body);
  expect(applies).toBe(true);
  expect(orientation.lock.mock.calls).toEqual([['landscape']]);
  await setFullscreen(null);
  await setFullscreen(document.body);
  expect(orientation.lock.mock.calls).toEqual([['landscape'], ['landscape']]);
  await render('auto');
  expect(orientation.unlock).toHaveBeenCalledOnce();
  await render('portrait');
  expect(orientation.lock.mock.calls.at(-1)).toEqual(['portrait']);
  expect(autoOverridesSystemLock()).toBe(false);
});

it('never offers or requests a lock with a mouse-primary pointer', async () => {
  coarse = false;
  await render('portrait');
  await setFullscreen(document.body);
  expect(applies).toBe(false);
  expect(orientation.lock).not.toHaveBeenCalled();
});
