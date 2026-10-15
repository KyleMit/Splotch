import { afterEach, describe, expect, it } from 'vitest';
import { isAppShellNavigation } from '../../web/src/lib/pwa/appShellRoute.ts';
import {
  DRAWING_PATHS,
  isDrawingPath,
  currentAppPage,
} from '../../experiments/native-architecture/src/platform/appPath.web.ts';
import { APP_PAGE_PATHS } from '../../experiments/native-architecture/src/information/appPages.ts';
import {
  isNativeAppNavigation,
  APP_SHELL_FILE,
  NOT_FOUND_FILE,
} from '../migration/build-native-web.mjs';
import { nativeWebPrecacheProblems } from '../migration/check-native-web-precache.mjs';
import {
  FRESH_START_PARAM,
  reloadApp,
  takeFreshStart,
} from '../../experiments/native-architecture/src/platform/appRestart.web.ts';
import { AI_ACCESS_TOKEN_PARAM } from '../../web/src/lib/inviteLink.ts';
import { CACHE_BUST_VERSION_PARAM } from '../../web/src/lib/pwa/versionEndpoint.ts';

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

  it('routes every bundled parent page online and offline without treating unknown paths as pages', () => {
    for (const [page, path] of Object.entries(APP_PAGE_PATHS)) {
      globalThis.location = { pathname: path };
      expect(currentAppPage()).toBe(page);
      expect(
        isNativeAppNavigation({
          request: { mode: 'navigate' },
          url: new URL(path, 'https://splotch.art'),
        })
      ).toBe(true);
    }
    globalThis.location = { pathname: '/unknown' };
    expect(currentAppPage()).toBe('notFound');
    expect(
      isNativeAppNavigation({
        request: { mode: 'navigate' },
        url: new URL('https://splotch.art/unknown'),
      })
    ).toBe(false);
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
  // A browser that refuses session storage outright, which the fresh mark must not depend on.
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
  function browserAt(href) {
    const assigned = [];
    const replaced = [];
    globalThis.sessionStorage = refusingStorage;
    globalThis.history = {
      state: { guard: true },
      replaceState: (state, _title, url) => replaced.push({ state, url }),
    };
    globalThis.location = { href, assign: (url) => assigned.push(url) };
    return { assigned, replaced };
  }
  afterEach(() => {
    delete globalThis.sessionStorage;
    delete globalThis.history;
  });

  // Negative control: a mark kept in session storage is lost here, and the reload reads the
  // stored picture back.
  it("reloads the app root as shipping's Start over does, marked fresh in its URL", () => {
    const browser = browserAt('https://splotch.test/');
    expect(reloadApp()).toBe(true);
    expect(browser.assigned).toEqual([`/?${FRESH_START_PARAM}=1`]);
    browserAt(`https://splotch.test${browser.assigned[0]}`);
    expect(takeFreshStart()).toBe(true);
  });

  it('takes the mark out of the address once, keeping an invite and the history state', () => {
    const browser = browserAt(
      `https://splotch.test/?${FRESH_START_PARAM}=1&${AI_ACCESS_TOKEN_PARAM}=abc#top`
    );
    expect(takeFreshStart()).toBe(true);
    expect(browser.replaced).toEqual([
      { state: { guard: true }, url: `/?${AI_ACCESS_TOKEN_PARAM}=abc#top` },
    ]);
    browserAt(`https://splotch.test/?${AI_ACCESS_TOKEN_PARAM}=abc`);
    expect(takeFreshStart()).toBe(false);
  });

  it('never meets the drawing route, the worker route, invites or the cache bust', () => {
    expect(FRESH_START_PARAM).not.toBe(AI_ACCESS_TOKEN_PARAM);
    expect(FRESH_START_PARAM).not.toBe(CACHE_BUST_VERSION_PARAM);
    const url = new URL(`/?${FRESH_START_PARAM}=1`, 'https://splotch.test');
    expect(isAppShellNavigation({ request: { mode: 'navigate' }, url })).toBe(true);
    globalThis.location = { pathname: url.pathname };
    expect(isDrawingPath()).toBe(true);
  });
});
