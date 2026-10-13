// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useFullscreen } from '../../../experiments/native-architecture/src/platform/useFullscreen.web.ts';
import { useFullscreen as useNativeFullscreen } from '../../../experiments/native-architecture/src/platform/useFullscreen.ts';

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

let root;
let host;
let current;
let browser;
let descriptors;
let originalActEnvironment;

function FullscreenAction({ enabled = true }) {
  current = useFullscreen(enabled);
  return createElement(
    'div',
    null,
    current.supported
      ? createElement(
          'button',
          {
            'aria-label': current.label,
            disabled: !enabled || current.pending,
            onClick: current.toggle,
          },
          current.label
        )
      : null,
    createElement('span', { 'aria-live': 'polite' }, current.message)
  );
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  browser = {
    userAgent: ANDROID_CHROME,
    appLike: false,
    enabled: true,
    element: null,
    request: vi.fn().mockResolvedValue(undefined),
    exit: vi.fn().mockResolvedValue(undefined),
  };
  descriptors = [
    [document, 'fullscreenEnabled'],
    [document, 'fullscreenElement'],
    [document, 'exitFullscreen'],
    [document.documentElement, 'requestFullscreen'],
    [navigator, 'userAgent'],
    [window, 'matchMedia'],
  ].map(([target, key]) => [target, key, Object.getOwnPropertyDescriptor(target, key)]);
  Object.defineProperties(document, {
    fullscreenEnabled: { configurable: true, get: () => browser.enabled },
    fullscreenElement: { configurable: true, get: () => browser.element },
    exitFullscreen: { configurable: true, get: () => browser.exit },
  });
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    get: () => browser.request,
  });
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    get: () => browser.userAgent,
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query) => ({ matches: browser.appLike && query.includes('display-mode') }),
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  for (const [target, key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else delete target[key];
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  vi.restoreAllMocks();
});

it('waits for a gesture and calls the browser before that gesture returns', async () => {
  const request = deferred();
  const order = [];
  browser.request.mockImplementation(() => {
    order.push('request');
    return request.promise;
  });
  await act(async () => root.render(createElement(FullscreenAction)));
  expect(host.querySelector('button').getAttribute('aria-label')).toBe('Enter fullscreen');
  expect(browser.request).not.toHaveBeenCalled();
  act(() => {
    host.querySelector('button').click();
    order.push('gesture returned');
  });
  expect(order).toEqual(['request', 'gesture returned']);
  expect(current.active).toBe(false);
  expect(current.pending).toBe(true);
  expect(current.toggle()).toBe(false);
  expect(browser.request).toHaveBeenCalledOnce();
  await act(async () => request.resolve());
  expect(current.active).toBe(false);
  expect(current.pending).toBe(false);
});

it('tracks browser entry, exit and Escape through fullscreenchange', async () => {
  await act(async () => root.render(createElement(FullscreenAction)));
  act(() => {
    browser.element = document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  expect(host.querySelector('button').getAttribute('aria-label')).toBe('Exit fullscreen');
  act(() => host.querySelector('button').click());
  expect(browser.exit).toHaveBeenCalledOnce();
  expect(browser.request).not.toHaveBeenCalled();
  await act(async () => {
    browser.element = null;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  expect(host.querySelector('button').getAttribute('aria-label')).toBe('Enter fullscreen');
});

it.each(['enabled', 'request', 'exit'])(
  'hides fullscreen when %s is unavailable',
  async (field) => {
    browser[field] = field === 'enabled' ? false : undefined;
    await act(async () => root.render(createElement(FullscreenAction)));
    expect(host.querySelector('button')).toBeNull();
    expect(current.toggle()).toBe(false);
    expect(current.supported).toBe(false);
  }
);

it('uses the latest drawing or modal guard even through a retained click callback', async () => {
  await act(async () => root.render(createElement(FullscreenAction)));
  const retainedToggle = current.toggle;
  await act(async () => root.render(createElement(FullscreenAction, { enabled: false })));
  expect(retainedToggle()).toBe(false);
  expect(browser.request).not.toHaveBeenCalled();
  await act(async () => root.render(createElement(FullscreenAction)));
  await act(async () => host.querySelector('button').click());
  expect(browser.request).toHaveBeenCalledOnce();
});

it('announces rejected entry without claiming fullscreen and allows retry', async () => {
  browser.request.mockRejectedValueOnce(new Error('denied'));
  await act(async () => root.render(createElement(FullscreenAction)));
  await act(async () => host.querySelector('button').click());
  expect(host.querySelector('[aria-live]').textContent).toBe(
    'Fullscreen could not be changed. Try again.'
  );
  expect(current.active).toBe(false);
  expect(current.pending).toBe(false);
  await act(async () => host.querySelector('button').click());
  expect(browser.request).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[aria-live]').textContent).toBe('');
});

it('keeps the current browser event state when an older request rejects late', async () => {
  const request = deferred();
  browser.request.mockReturnValueOnce(request.promise);
  await act(async () => root.render(createElement(FullscreenAction)));
  act(() => host.querySelector('button').click());
  act(() => {
    browser.element = document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  await act(async () => request.reject(new Error('stale rejection')));
  expect(current.active).toBe(true);
  expect(current.pending).toBe(false);
  expect(current.message).toBe('');
  expect(host.querySelector('button').getAttribute('aria-label')).toBe('Exit fullscreen');
});

it('retains a fullscreenerror announcement when an older request resolves', async () => {
  const request = deferred();
  browser.request.mockReturnValueOnce(request.promise);
  await act(async () => root.render(createElement(FullscreenAction)));
  act(() => host.querySelector('button').click());
  act(() => document.dispatchEvent(new Event('fullscreenerror')));
  await act(async () => request.resolve());
  expect(current.message).toBe('Fullscreen could not be changed. Try again.');
  expect(current.pending).toBe(false);
});

it('handles a synchronous browser exception without leaving the action pending', async () => {
  browser.request.mockImplementationOnce(() => {
    throw new Error('policy denied');
  });
  await act(async () => root.render(createElement(FullscreenAction)));
  act(() => host.querySelector('button').click());
  expect(current.message).toBe('Fullscreen could not be changed. Try again.');
  expect(current.pending).toBe(false);
});

it('removes listeners and rejects retained activation after unmount and late settlement', async () => {
  const add = vi.spyOn(document, 'addEventListener');
  const remove = vi.spyOn(document, 'removeEventListener');
  const request = deferred();
  browser.request.mockReturnValueOnce(request.promise);
  await act(async () => root.render(createElement(FullscreenAction)));
  const retainedToggle = current.toggle;
  act(() => host.querySelector('button').click());
  await act(async () => root.render(null));
  expect(retainedToggle()).toBe(false);
  expect(remove).toHaveBeenCalledWith(
    'fullscreenchange',
    add.mock.calls.find(([type]) => type === 'fullscreenchange')[1]
  );
  expect(remove).toHaveBeenCalledWith(
    'fullscreenerror',
    add.mock.calls.find(([type]) => type === 'fullscreenerror')[1]
  );
  await act(async () => request.reject(new Error('late rejection')));
  await act(async () => root.render(createElement(FullscreenAction)));
  expect(current.message).toBe('');
  expect(current.pending).toBe(false);
  expect(browser.request).toHaveBeenCalledOnce();
});

it.each([
  ['an iPhone', IPHONE_SAFARI, false],
  ['a desktop browser', DESKTOP_CHROME, false],
  ['an installed Android app', ANDROID_CHROME, true],
])(
  'offers no fullscreen to %s, as shipping offers it to an Android browser tab alone',
  async (_name, userAgent, appLike) => {
    browser.userAgent = userAgent;
    browser.appLike = appLike;
    await act(async () => root.render(createElement(FullscreenAction)));
    expect(host.querySelector('button')).toBeNull();
    expect(current.supported).toBe(false);
    expect(current.toggle()).toBe(false);
    expect(browser.request).not.toHaveBeenCalled();
  }
);

it('keeps offering the way back once fullscreen itself reports an app-like display mode', async () => {
  await act(async () => root.render(createElement(FullscreenAction)));
  act(() => {
    browser.appLike = true;
    browser.element = document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  expect(host.querySelector('button').getAttribute('aria-label')).toBe('Exit fullscreen');
  act(() => host.querySelector('button').click());
  expect(browser.exit).toHaveBeenCalledOnce();
});

it('offers no redundant native fullscreen action', () => {
  const native = useNativeFullscreen(true);
  expect(native.supported).toBe(false);
  expect(native.toggle()).toBe(false);
});
