import { afterEach, describe, expect, it } from 'vitest';
import { isAppShellNavigation } from '../../web/src/lib/pwa/appShellRoute.ts';
import {
  DRAWING_PATHS,
  isDrawingPath,
} from '../../experiments/native-architecture/src/platform/appPath.web.ts';
import { APP_SHELL_FILE, NOT_FOUND_FILE } from '../migration/build-native-web.mjs';
import { nativeWebPrecacheProblems } from '../migration/check-native-web-precache.mjs';
import {
  reloadApp,
  takeFreshStart,
} from '../../experiments/native-architecture/src/platform/appRestart.web.ts';

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
  // Negative control: a reload with no fresh mark reads the stored picture back.
  it("reloads the app root as shipping's Start over does, marking that one load fresh", () => {
    const assigned = [];
    const session = new Map();
    globalThis.location = { assign: (url) => assigned.push(url) };
    globalThis.sessionStorage = {
      getItem: (key) => session.get(key) ?? null,
      setItem: (key, value) => session.set(key, value),
      removeItem: (key) => session.delete(key),
    };
    try {
      expect(takeFreshStart()).toBe(false);
      expect(reloadApp()).toBe(true);
      expect(assigned).toEqual(['/']);
      expect(takeFreshStart()).toBe(true);
      expect(takeFreshStart()).toBe(false);
    } finally {
      delete globalThis.sessionStorage;
    }
  });
});
