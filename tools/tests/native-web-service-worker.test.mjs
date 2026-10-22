// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createPWAServiceWorker, usePWAUpdates } from '../../src/platform/serviceWorker.web.ts';
import { installPrompt as nativeInstallPrompt } from '../../src/platform/installPrompt.ts';
import { SERVICE_WORKER_PATH, VERSION_JSON_PATH } from '../../src/lib/pwa/versionEndpoint.ts';
import { WEB_VERSION_META_SELECTOR } from '../../src/platform/webVersion.ts';
import { NATIVE_WEB_SERVICE_WORKER, webVersionHeadTag } from '../migration/build-native-web.mjs';
import {
  makeRegistration,
  makeWorker,
  stubServiceWorker,
  stubDeployedVersion,
  setDocumentVisibility,
  restoreDocumentVisibility,
  controllerChangeListeners,
  stubReloadableLocation,
} from '../../src/lib/pwa/updatesTestHarness.ts';

const scheduler = vi.hoisted(() => ({ painted: false, waiters: [], quiet: [], idle: [] }));
vi.mock('../../src/product/drawingPaint.ts', () => ({
  drawingPaint: {
    painted: () =>
      scheduler.painted
        ? Promise.resolve()
        : new Promise((resolve) => scheduler.waiters.push(resolve)),
  },
}));
vi.mock('../../src/lib/idle.ts', () => {
  const enqueue = (queue, run) => {
    const entry = { active: true, run };
    queue.push(entry);
    return () => {
      entry.active = false;
    };
  };
  return {
    scheduleInteractionIdle: (run) => enqueue(scheduler.quiet, run),
    scheduleIdle: (run) => enqueue(scheduler.idle, run),
  };
});
const nativeSource = (path) => readFileSync(join(import.meta.dirname, '../../src', path), 'utf8');
const originalFetch = globalThis.fetch;
const originalLocation = window.location;
const BUILT_WEB_VERSION = '1.6.1234';
let owners;
beforeEach(() => {
  scheduler.painted = false;
  scheduler.waiters.length = scheduler.quiet.length = scheduler.idle.length = 0;
  owners = [];
  vi.stubGlobal('__DEV__', false);
  document.head.insertAdjacentHTML('beforeend', webVersionHeadTag(BUILT_WEB_VERSION));
  stubDeployedVersion(BUILT_WEB_VERSION);
  stubReloadableLocation();
  window.location.replace = vi.fn();
});
afterEach(() => {
  for (const owner of owners) owner.stop();
  document.querySelector(WEB_VERSION_META_SELECTOR)?.remove();
  delete navigator.serviceWorker;
  delete navigator.connection;
  restoreDocumentVisibility();
  globalThis.fetch = originalFetch;
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
  vi.unstubAllGlobals();
});
function fixture(registration) {
  const container = stubServiceWorker(registration);
  const owner = createPWAServiceWorker();
  owners.push(owner);
  owner.update({ canvasEmpty: false, strokes: 0 });
  return { owner, container };
}
function flush(queue) {
  for (const entry of queue.splice(0)) if (entry.active) entry.run();
}
async function start({ owner }) {
  const pending = owner.start();
  scheduler.painted = true;
  for (const ready of scheduler.waiters.splice(0)) ready();
  await vi.waitFor(() => expect(scheduler.quiet).toHaveLength(1));
  flush(scheduler.quiet);
  await pending;
}

it('stops the mounted drawing lifecycle while an information page is open', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = stubServiceWorker();
  scheduler.painted = true;
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  function Drawing({ active }) {
    usePWAUpdates({ canvasEmpty: true, strokes: 0 }, active);
    return null;
  }
  const render = (active) => act(async () => root.render(createElement(Drawing, { active })));
  try {
    await render(false);
    expect(scheduler.quiet).toHaveLength(0);
    expect(container.getRegistration).not.toHaveBeenCalled();
    await render(true);
    await vi.waitFor(() => expect(scheduler.quiet).toHaveLength(1));
    await render(false);
    flush(scheduler.quiet);
    await Promise.resolve();
    expect(container.getRegistration).not.toHaveBeenCalled();
    await render(true);
    await vi.waitFor(() => expect(scheduler.quiet).toHaveLength(1));
    flush(scheduler.quiet);
    await vi.waitFor(() => expect(container.getRegistration).toHaveBeenCalled());
  } finally {
    await act(async () => root.unmount());
    element.remove();
  }
});

it('registers on the first qualifying stroke at idle after drawing paints', async () => {
  const f = fixture();
  const pending = f.owner.start();
  await Promise.resolve();
  expect(f.container.register).not.toHaveBeenCalled();
  expect(scheduler.quiet).toHaveLength(0);
  await start(f);
  await pending;
  for (const strokes of [1, 2]) f.owner.update({ canvasEmpty: false, strokes });
  expect(scheduler.idle).toHaveLength(0);
  f.owner.update({ canvasEmpty: false, strokes: 3 });
  expect(f.container.register).not.toHaveBeenCalled();
  flush(scheduler.idle);
  await vi.waitFor(() =>
    expect(f.container.register).toHaveBeenCalledExactlyOnceWith(SERVICE_WORKER_PATH)
  );
  expect(SERVICE_WORKER_PATH).toBe('/' + NATIVE_WEB_SERVICE_WORKER);
  expect(fetch).toHaveBeenCalledWith(VERSION_JSON_PATH, { cache: 'no-store' });
});

it('resumes repeat-visit registration at idle without waiting for more strokes', async () => {
  const f = fixture(makeRegistration());
  await start(f);
  await vi.waitFor(() => expect(scheduler.idle).toHaveLength(1));
  flush(scheduler.idle);
  await vi.waitFor(() =>
    expect(f.container.register).toHaveBeenCalledExactlyOnceWith(SERVICE_WORKER_PATH)
  );
});

it('leaves Save-Data first visits unregistered', async () => {
  const f = fixture();
  Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
  await start(f);
  f.owner.update({ canvasEmpty: false, strokes: 3 });
  await Promise.resolve();
  flush(scheduler.idle);
  expect(f.container.register).not.toHaveBeenCalled();
});

it('does not initialize a worker lifecycle after the drawing owner stops', async () => {
  const f = fixture();
  const pending = f.owner.start();
  f.owner.stop();
  scheduler.painted = true;
  for (const ready of scheduler.waiters.splice(0)) ready();
  await pending;
  expect(scheduler.quiet).toHaveLength(0);
  expect(f.container.getRegistration).not.toHaveBeenCalled();
  expect(f.container.register).not.toHaveBeenCalled();
});

it('keeps an inked stale session and waits for a hidden blank page before reloading', async () => {
  const worker = makeWorker();
  const f = fixture(makeRegistration({ waiting: worker }));
  stubDeployedVersion('9.9.9');
  await start(f);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  setDocumentVisibility('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(worker.postMessage).not.toHaveBeenCalled();
  f.owner.update({ canvasEmpty: true, strokes: 0 });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'SKIP_WAITING' });
  setDocumentVisibility('visible');
  for (const listener of controllerChangeListeners(f.container))
    listener(new Event('controllerchange'));
  expect(window.location.reload).not.toHaveBeenCalled();
  setDocumentVisibility('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(window.location.reload).toHaveBeenCalledOnce();
});

it('activates a matching worker silently while retaining the visible drawing', async () => {
  const worker = makeWorker();
  const f = fixture(makeRegistration({ waiting: worker }));
  await start(f);
  await vi.waitFor(() =>
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'SKIP_WAITING' })
  );
  for (const listener of controllerChangeListeners(f.container))
    listener(new Event('controllerchange'));
  expect(window.location.reload).not.toHaveBeenCalled();
});

it('offers no browser update or install lifecycle in the native apps', () => {
  expect(nativeInstallPrompt).toBeNull();
  for (const path of ['platform/serviceWorker.ts', 'platform/installPrompt.ts'])
    expect(nativeSource(path)).not.toMatch(/navigator|beforeinstallprompt|appinstalled/);
});

it('listens for the browser install events from the moment the web module loads', async () => {
  localStorage.clear();
  const { installPrompt } = await import('../../src/platform/installPrompt.web.ts');
  expect(installPrompt.snapshot().mode).toBe('none');
  window.dispatchEvent(new Event('beforeinstallprompt'));
  expect(installPrompt.snapshot().mode).toBe('none');
  const event = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(event, {
    prompt: async () => {},
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(installPrompt.snapshot().mode).toBe('oneTap');
  window.dispatchEvent(new Event('appinstalled'));
  expect(installPrompt.snapshot().installed).toBe(true);
  expect(localStorage.getItem('splotch-install-completed')).toBe('true');
});

it('reaches the lifecycle through the drawing screen and platform-split modules', () => {
  expect(nativeSource('rsdDrawing/RsdDrawingScreen.tsx')).toMatch(
    /\{ usePWAUpdates \} from '\.\.\/platform\/serviceWorker';/
  );
  expect(nativeSource('index.ts')).not.toContain('registerServiceWorker');
  for (const path of [
    'rsdDrawing/RsdDrawingScreen.tsx',
    'rsdDrawing/RsdInstallBanner.tsx',
    'rsdDrawing/RsdInstallGuide.tsx',
  ])
    expect(nativeSource(path)).not.toMatch(/from '[^']*\.web'/);
});
