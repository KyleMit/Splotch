import { afterEach, describe, expect, it } from 'vitest';
import { isAppShellNavigation } from '../../src/lib/pwa/appShellRoute.ts';
import { DRAWING_PATHS, isDrawingPath, currentAppPage } from '../../src/platform/appPath.web.ts';
import { APP_PAGE_PATHS } from '../../src/information/appPages.ts';
import {
  isNativeAppNavigation,
  isOtherNativeNavigation,
  nativeWebServiceWorkerConfig,
  APP_SHELL_FILE,
  NOT_FOUND_FILE,
} from '../migration/build-native-web.mjs';
import { nativeWebPrecacheProblems } from '../migration/check-native-web-precache.mjs';
import { reloadApp } from '../../src/platform/appRestart.web.ts';

const PATHS = ['/', '/index.html', '/does-not-exist', '/changelog', '/index.htm', '/a/'];

afterEach(() => {
  delete globalThis.location;
});

describe("the web export's unknown paths", () => {
  it('shows the drawing screen exactly where the worker answers with the app shell', () => {
    for (const path of PATHS) {
      const url = new URL(path, 'https://splotch.test');
      const shell = isAppShellNavigation({ request: { mode: 'navigate' }, url });
      expect(DRAWING_PATHS.includes(path), path).toBe(shell);
      globalThis.location = { pathname: path };
      expect(isDrawingPath(), path).toBe(shell);
    }
  });

  it('routes each page load once: app paths with a timeout, others on failure, /admin never', () => {
    for (const [page, path] of Object.entries(APP_PAGE_PATHS)) {
      globalThis.location = { pathname: path };
      expect(currentAppPage()).toBe(page);
    }
    globalThis.location = { pathname: '/unknown' };
    expect(currentAppPage()).toBe('notFound');
    const routes = (path, mode = 'navigate') => {
      const request = { mode };
      const url = new URL(path, 'https://splotch.art');
      return [isNativeAppNavigation({ request, url }), isOtherNativeNavigation({ request, url })];
    };
    for (const path of [...Object.values(APP_PAGE_PATHS), '/index.html'])
      expect(routes(path), path).toEqual([true, false]);
    for (const path of ['/unknown', '/version.json', '/privacy/missing'])
      expect(routes(path), path).toEqual([false, true]);
    for (const path of ['/admin', '/admin/tokens'])
      expect(routes(path), path).toEqual([false, false]);
    expect(routes('/unknown', 'no-cors')).toEqual([false, false]);
  });

  it('answers a slow page from the network alone, and only an app path from the shell', () => {
    const [app, other] = nativeWebServiceWorkerConfig('/export', {
      url: '/?app-shell-build=x',
    }).runtimeCaching;
    expect(app.urlPattern).toBe(isNativeAppNavigation);
    expect(app.options.networkTimeoutSeconds).toBeGreaterThan(0);
    expect(other.urlPattern).toBe(isOtherNativeNavigation);
    expect(other.handler).toBe('NetworkOnly');
    expect(other.options.networkTimeoutSeconds).toBeUndefined();
    expect(Object.keys(other.options.plugins[0])).toEqual(['handlerDidError']);
  });

  it("serves the host's 404 answer without asking the precache to hold it", () => {
    expect(NOT_FOUND_FILE).toBe('404.html');
    const problems = nativeWebPrecacheProblems({
      precacheEntries: [],
      appShellFallbackLookups: [],
      expectedShellUrl: '',
      integrityOnDisk: new Map(),
      shellReferences: [],
      exportedFiles: [APP_SHELL_FILE, NOT_FOUND_FILE, 'stray.js'],
      precachedScripts: [],
      precachedHashes: new Set(),
      shellScripts: [],
      starterOutlines: [],
      starterImages: [],
      lazySamples: [],
      precacheBytes: 0,
    });
    const missing = problems.find((problem) => problem.startsWith('Exported files missing'));
    expect(missing).toBe('Exported files missing from the precache: stray.js');
  });
});

describe("the web export's restart", () => {
  it('reloads the app root as shipping does even when storage refuses', () => {
    const refusingStorage = {
      getItem() {
        throw new Error('Storage is disabled');
      },
      setItem() {
        throw new Error('Storage is disabled');
      },
      removeItem() {
        throw new Error('Storage is disabled');
      },
    };
    const assigned = [];
    globalThis.sessionStorage = refusingStorage;
    globalThis.location = { assign: (url) => assigned.push(url) };
    try {
      expect(reloadApp()).toBe(true);
      expect(assigned).toEqual(['/']);
    } finally {
      delete globalThis.sessionStorage;
    }
  });
});
