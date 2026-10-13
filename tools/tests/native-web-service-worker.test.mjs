// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerServiceWorker } from '../../experiments/native-architecture/src/platform/serviceWorker.web.ts';
import { registerServiceWorker as registerNativeServiceWorker } from '../../experiments/native-architecture/src/platform/serviceWorker.ts';
import { installPrompt as nativeInstallPrompt } from '../../experiments/native-architecture/src/platform/installPrompt.ts';
import { SERVICE_WORKER_PATH } from '../../experiments/native-architecture/src/platform/serviceWorkerPath.ts';
import { NATIVE_WEB_SERVICE_WORKER } from '../migration/build-native-web.mjs';

const nativeSource = (path) =>
  readFileSync(
    join(import.meta.dirname, '../../experiments/native-architecture/src', path),
    'utf8'
  );

let register;
let readyState;
beforeEach(() => {
  register = vi.fn().mockResolvedValue({});
  readyState = 'complete';
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } });
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => readyState });
});
afterEach(() => {
  delete navigator.serviceWorker;
  delete document.readyState;
});

it('registers the exported worker on the web once the page has loaded', () => {
  readyState = 'loading';
  registerServiceWorker();
  expect(register).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('load'));
  expect(register).toHaveBeenCalledWith(SERVICE_WORKER_PATH);
  expect(SERVICE_WORKER_PATH).toBe(`/${NATIVE_WEB_SERVICE_WORKER}`);
});

it('registers immediately when the page already loaded', () => {
  registerServiceWorker();
  expect(register).toHaveBeenCalledTimes(1);
});

it('keeps drawing when registration fails', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  register.mockRejectedValue(new Error('blocked'));
  registerServiceWorker();
  await vi.waitFor(() => expect(warn).toHaveBeenCalled());
  warn.mockRestore();
});

it('registers nothing and offers no install prompt in the native apps', () => {
  registerNativeServiceWorker();
  window.dispatchEvent(new Event('load'));
  expect(register).not.toHaveBeenCalled();
  expect(nativeInstallPrompt).toBeNull();
  for (const path of ['platform/serviceWorker.ts', 'platform/installPrompt.ts'])
    expect(nativeSource(path)).not.toMatch(/navigator|beforeinstallprompt|appinstalled/);
});

it('listens for the browser install events from the moment the web module loads', async () => {
  localStorage.clear();
  const { installPrompt } =
    await import('../../experiments/native-architecture/src/platform/installPrompt.web.ts');
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

it('reaches the worker and install prompt only through platform-split modules', () => {
  // Metro picks the .web.ts file for the web bundle and the plain file for native;
  // an import naming the .web file would ship web code to the native apps.
  expect(nativeSource('index.ts')).toMatch(
    /\{ registerServiceWorker \} from '\.\/platform\/serviceWorker';/
  );
  for (const path of [
    'index.ts',
    'rsdDrawing/RsdInstallBanner.tsx',
    'rsdDrawing/RsdInstallGuide.tsx',
  ])
    expect(nativeSource(path)).not.toMatch(/from '[^']*\.web'/);
});
