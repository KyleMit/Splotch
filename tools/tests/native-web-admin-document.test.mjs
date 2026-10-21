// @vitest-environment happy-dom
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_SESSION_ATTRIBUTE,
  ADMIN_SESSION_KEY,
  ADMIN_VARIANT_ATTRIBUTE,
} from '../../experiments/native-architecture/src/pageDocument/admin/adminContract.ts';
import {
  ADMIN_LOGIN_PATH,
  ADMIN_STATS_PATH,
  ADMIN_TOKENS_PATH,
  createAdminApi,
} from '../../experiments/native-architecture/src/pageDocument/admin/adminApi.ts';
import { createAdminSessionStore } from '../../experiments/native-architecture/src/pageDocument/admin/adminSession.ts';
import {
  SESSION_ENDED,
  removalQuestion,
  useAdminConsole,
} from '../../experiments/native-architecture/src/pageDocument/admin/useAdminConsole.ts';
import { UNLINKED_DOCUMENT_PATHS } from '../../experiments/native-architecture/src/information/unlinkedDocuments.ts';
import { BOOT_THEME_ATTRIBUTE } from '../../experiments/native-architecture/src/platform/bootTheme.ts';
import {
  ADMIN_DOCUMENT_FILE,
  ADMIN_ROBOTS_META,
  adminDocumentHtml,
} from '../migration/prerender-native-web-admin.mjs';
import { pageOnlyChunks, writtenPageDocuments } from '../migration/prerender-native-web-pages.mjs';
import { STARTUP_SCRIPTS_ELEMENT_ID } from '../migration/prerender-native-web.mjs';
import { isNativeAppNavigation, isOtherNativeNavigation } from '../migration/build-native-web.mjs';
import { ADMIN_DOCUMENT_SOURCES } from '../../experiments/native-architecture/scripts/admin-document-styles.mjs';
import { GRANTS, RECORDED_STATS, STATS, USED } from './native-admin-stats-fixture.mjs';

vi.mock('react-strict-dom/postcss-plugin', () => ({ default: (options) => ({ options }) }));

const SESSION = 'a'.repeat(64);
const SNAPSHOT = {
  ok: true,
  tokens: ['alpha'],
  invites: [{ token: 'alpha', url: 'https://splotch.test/?ai_access_token=alpha' }],
  persistent: true,
};

function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

const answer = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe("the admin console's session", () => {
  it('keeps the bearer session under its one key until it is cleared', () => {
    const storage = memoryStorage();
    const sessions = createAdminSessionStore(() => storage);
    expect(sessions.read()).toBeNull();
    sessions.write(SESSION);
    expect(storage.items.get(ADMIN_SESSION_KEY)).toBe(SESSION);
    expect(sessions.read()).toBe(SESSION);
    sessions.clear();
    expect(storage.items.has(ADMIN_SESSION_KEY)).toBe(false);
  });

  it('works on without storage that throws or is missing', () => {
    const blocked = () => {
      throw new Error('SecurityError');
    };
    for (const sessions of [
      createAdminSessionStore(blocked),
      createAdminSessionStore(() => null),
    ]) {
      expect(sessions.read()).toBeNull();
      expect(() => sessions.write(SESSION)).not.toThrow();
      expect(() => sessions.clear()).not.toThrow();
    }
  });
});

describe("the admin console's API client", () => {
  it('signs in with the key as JSON and reads back the session', async () => {
    const request = vi.fn(async () => answer(200, { ok: true, session: SESSION }));
    expect(await createAdminApi(request).signIn('the-key')).toEqual({
      kind: 'signedIn',
      session: SESSION,
    });
    expect(request).toHaveBeenCalledWith(ADMIN_LOGIN_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'the-key' }),
    });
  });

  it('shows a refused sign-in in the words the API sent', async () => {
    const api = createAdminApi(async () =>
      answer(403, { ok: false, error: 'Incorrect access key.' })
    );
    expect(await api.signIn('wrong')).toEqual({
      kind: 'refused',
      message: 'Incorrect access key.',
    });
  });

  it('lists, adds and removes with the bearer session, same origin', async () => {
    const request = vi.fn(async (_path, { method }) =>
      answer(200, method === 'GET' ? SNAPSHOT : { ...SNAPSHOT, changed: method === 'POST' })
    );
    const api = createAdminApi(request);
    expect(await api.list(SESSION)).toEqual({
      kind: 'listed',
      snapshot: { invites: SNAPSHOT.invites, persistent: true },
    });
    expect((await api.add(SESSION, 'alpha')).changed).toBe(true);
    expect((await api.remove(SESSION, 'alpha')).changed).toBe(false);
    const authorization = `Bearer ${SESSION}`;
    expect(request.mock.calls).toEqual([
      [ADMIN_TOKENS_PATH, { method: 'GET', headers: { Authorization: authorization } }],
      ...['POST', 'DELETE'].map((method) => [
        ADMIN_TOKENS_PATH,
        {
          method,
          headers: { Authorization: authorization, 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'alpha' }),
        },
      ]),
    ]);
  });

  it('reports a 401 from any tokens call as an unauthorized session', async () => {
    const api = createAdminApi(async () => answer(401, { ok: false, error: 'Unauthorized' }));
    for (const call of [
      () => api.list(SESSION),
      () => api.add(SESSION, 'x'),
      () => api.remove(SESSION, 'x'),
    ])
      expect(await call()).toEqual({ kind: 'unauthorized' });
  });

  it('refuses a list it cannot read', async () => {
    const api = createAdminApi(async () => answer(200, { ok: true, invites: 'nope' }));
    await expect(api.list(SESSION)).rejects.toThrow('a shape the console does not read');
  });

  it("reads each code's tally and the grant figures with the bearer session", async () => {
    const request = vi.fn(async () => answer(200, STATS));
    const result = await createAdminApi(request).stats(SESSION);
    expect(request).toHaveBeenCalledExactlyOnceWith(ADMIN_STATS_PATH, {
      method: 'GET',
      headers: { Authorization: `Bearer ${SESSION}` },
    });
    expect(result.kind).toBe('read');
    expect([...result.stats.usage]).toEqual([
      ['alpha', { count: 3, lastUsed: USED.lastUsed }],
      ['beta', null],
    ]);
    expect(result.stats.freeGrantStats).toMatchObject({
      dailyProviderStarts: 4,
      recent: [{ installation: 'cccccccc', successful: 2, lastFailureKind: 'safety' }],
    });
  });

  it("reads the function's own recorded answer: no tallies, the in-memory grant figures", async () => {
    const result = await createAdminApi(async () => answer(200, RECORDED_STATS)).stats(SESSION);
    expect(result.stats.usage).toBeNull();
    expect(result.stats.freeGrantStats).toMatchObject({ persistent: false, recent: [] });
  });

  it('reports a 401 on the stats read as an unauthorized session', async () => {
    const api = createAdminApi(async () => answer(401, { ok: false, error: 'Unauthorized' }));
    expect(await api.stats(SESSION)).toEqual({ kind: 'unauthorized' });
  });

  it('refuses figures it cannot read', async () => {
    for (const body of [
      { ...STATS, codes: [{ token: 'alpha', usage: { count: 'three' } }] },
      { ...STATS, freeGrantStats: { ...GRANTS, sampledFailures: -1 } },
      { ...STATS, usageAvailable: 'yes' },
    ]) {
      const api = createAdminApi(async () => answer(200, body));
      await expect(api.stats(SESSION)).rejects.toThrow('a shape the console does not read');
    }
  });
});

describe("the admin console's state", () => {
  let container, root, latest;
  function Harness(props) {
    latest = useAdminConsole(props);
    return null;
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });

  async function mount({ stored, request, confirm = () => true }) {
    const storage = memoryStorage(stored ? { [ADMIN_SESSION_KEY]: stored } : {});
    const props = {
      api: createAdminApi(request),
      sessions: createAdminSessionStore(() => storage),
      confirm,
      writeClipboard: async () => {},
    };
    await act(async () => root.render(h(Harness, props)));
    return storage;
  }

  it('opens the console from a stored session without signing in again', async () => {
    const request = vi.fn(async (path) =>
      answer(200, path === ADMIN_STATS_PATH ? STATS : SNAPSHOT)
    );
    await mount({ stored: SESSION, request });
    expect(latest.view).toMatchObject({ mode: 'signedIn', session: SESSION });
    expect(latest.view.figures.stats.usage.get('alpha')).toEqual({
      count: 3,
      lastUsed: USED.lastUsed,
    });
    expect(request.mock.calls.map(([path]) => path).sort()).toEqual(
      [ADMIN_STATS_PATH, ADMIN_TOKENS_PATH].sort()
    );
  });

  it('lists the codes when the figures cannot be read', async () => {
    await mount({
      stored: SESSION,
      request: async (path) =>
        path === ADMIN_STATS_PATH
          ? answer(500, { ok: false, error: 'Something went wrong' })
          : answer(200, SNAPSHOT),
    });
    expect(latest.view).toMatchObject({ mode: 'signedIn', figures: { kind: 'unavailable' } });
  });

  it('keeps the figures it read across a write', async () => {
    await mount({
      stored: SESSION,
      request: async (path, { method }) =>
        path === ADMIN_STATS_PATH
          ? answer(200, STATS)
          : answer(200, method === 'GET' ? SNAPSHOT : { ...SNAPSHOT, changed: true }),
    });
    await act(async () => latest.setDraft('gamma'));
    await act(async () => latest.add(SESSION));
    expect(latest.flash).toEqual({ kind: 'success', text: 'Added “gamma”' });
    expect(latest.view.figures.stats.freeGrantStats.dailyProviderStarts).toBe(4);
  });

  it('forgets a stored session the API answers 401, and asks for the key', async () => {
    const storage = await mount({
      stored: SESSION,
      request: async () => answer(401, { ok: false, error: 'Unauthorized' }),
    });
    expect(latest.view).toEqual({ mode: 'signedOut', error: SESSION_ENDED });
    expect(storage.items.has(ADMIN_SESSION_KEY)).toBe(false);
  });

  it('forgets the session when a write is answered 401', async () => {
    let unauthorized = false;
    const storage = await mount({
      stored: SESSION,
      request: async () =>
        unauthorized ? answer(401, { ok: false, error: 'Unauthorized' }) : answer(200, SNAPSHOT),
    });
    unauthorized = true;
    await act(async () => latest.setDraft('gamma'));
    await act(async () => latest.add(SESSION));
    expect(latest.view).toEqual({ mode: 'signedOut', error: SESSION_ENDED });
    expect(storage.items.has(ADMIN_SESSION_KEY)).toBe(false);
  });

  it('stores the session a sign-in returns, and drops it on sign-out', async () => {
    const storage = await mount({
      request: async (path) =>
        path === ADMIN_LOGIN_PATH
          ? answer(200, { ok: true, session: SESSION })
          : answer(200, SNAPSHOT),
    });
    expect(latest.view).toEqual({ mode: 'signedOut', error: null });
    await act(async () => latest.signIn('the-key'));
    expect(storage.items.get(ADMIN_SESSION_KEY)).toBe(SESSION);
    expect(latest.view.mode).toBe('signedIn');
    await act(async () => latest.signOut());
    expect(storage.items.has(ADMIN_SESSION_KEY)).toBe(false);
    expect(latest.view).toEqual({ mode: 'signedOut', error: null });
  });

  // A list still loading when its session ends; `answers` resolves each request on demand.
  function deferredRequests() {
    const pending = [];
    const request = (path, init) => new Promise((resolve) => pending.push({ path, init, resolve }));
    return { pending, request };
  }

  it('ignores a list that lands after its session was signed out', async () => {
    const { pending, request } = deferredRequests();
    const storage = await mount({ stored: SESSION, request });
    await act(async () => latest.signOut());
    await act(async () => {
      for (const { path, resolve } of pending)
        resolve(answer(200, path === ADMIN_STATS_PATH ? STATS : SNAPSHOT));
    });
    expect(latest.view).toEqual({ mode: 'signedOut', error: null });
    expect(storage.items.has(ADMIN_SESSION_KEY)).toBe(false);
  });

  it('lists the codes without waiting on the figures, and adds them when they land', async () => {
    const { pending, request } = deferredRequests();
    await mount({ stored: SESSION, request });
    const answerTo = (path, body) =>
      act(async () => pending.find((call) => call.path === path).resolve(answer(200, body)));
    await answerTo(ADMIN_TOKENS_PATH, SNAPSHOT);
    expect(latest.view).toMatchObject({ mode: 'signedIn', figures: { kind: 'pending' } });
    await answerTo(ADMIN_STATS_PATH, STATS);
    expect(latest.view.figures.stats.freeGrantStats.dailyProviderStarts).toBe(4);
  });

  it('ignores figures that land after their session was signed out', async () => {
    const { pending, request } = deferredRequests();
    await mount({ stored: SESSION, request });
    const tokens = pending.find((call) => call.path === ADMIN_TOKENS_PATH);
    await act(async () => tokens.resolve(answer(200, SNAPSHOT)));
    await act(async () => latest.signOut());
    const stats = pending.find((call) => call.path === ADMIN_STATS_PATH);
    await act(async () => stats.resolve(answer(200, STATS)));
    expect(latest.view).toEqual({ mode: 'signedOut', error: null });
  });

  it("keeps a new session when the old one's late 401 lands", async () => {
    const lateAnswers = [];
    const lateAnswer = (response) => lateAnswers.forEach((resolve) => resolve(response.clone()));
    const request = async (path, init) => {
      if (init.headers.Authorization === 'Bearer old-session')
        return new Promise((resolve) => lateAnswers.push(resolve));
      return path === ADMIN_LOGIN_PATH
        ? answer(200, { ok: true, session: SESSION })
        : answer(200, SNAPSHOT);
    };
    const storage = await mount({ stored: 'old-session', request });
    await act(async () => latest.signOut());
    await act(async () => latest.signIn('the-key'));
    await act(async () => lateAnswer(answer(401, { ok: false, error: 'Unauthorized' })));
    expect(storage.items.get(ADMIN_SESSION_KEY)).toBe(SESSION);
    expect(latest.view).toMatchObject({ mode: 'signedIn', session: SESSION });
  });

  it('removes a code only once its removal is confirmed', async () => {
    const request = vi.fn(async () => answer(200, { ...SNAPSHOT, changed: true }));
    const confirm = vi.fn(() => false);
    await mount({ stored: SESSION, request, confirm });
    request.mockClear();
    await act(async () => latest.remove(SESSION, 'alpha'));
    expect(confirm).toHaveBeenCalledWith(removalQuestion('alpha'));
    expect(request).not.toHaveBeenCalled();
  });
});

describe('the admin document', () => {
  const STYLESHEET = '/_expo/static/css/strict-1.css';
  const TEMPLATE = [
    '<!doctype html><html lang="en"><head><title>Splotch</title>',
    `<link rel="preload" href="${STYLESHEET}" as="style">\n<link rel="stylesheet" href="${STYLESHEET}">`,
    '</head><body>',
    '<!-- Use static rendering with Expo Router to support running without JavaScript. -->',
    '<noscript> You need to enable JavaScript to run this app. </noscript>',
    '<div id="root"></div>',
    '<script src="/_expo/static/js/web/index-1.js" defer></script></body></html>',
  ].join('\n');
  const SCRIPTS = ['/_expo/static/js/web/adminApp-1.js'];
  afterEach(() => vi.unstubAllGlobals());
  const document_ = () =>
    adminDocumentHtml(TEMPLATE, {
      title: 'Admin Console · Splotch',
      fontFaceRules: '@font-face{}',
      styleSheet: '.x1{display:flex}',
      variants: ['light', 'dark'].map((theme) => ({ theme, html: `<main>${theme}</main>` })),
      scripts: SCRIPTS,
    });

  it('asks search engines to leave it out, and carries none of the drawing screen', () => {
    const html = document_();
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain(ADMIN_ROBOTS_META);
    expect(head).toContain('<title>Admin Console · Splotch</title>');
    expect(html).not.toContain(STYLESHEET);
    expect(html).not.toContain('index-1.js');
    expect(html).not.toContain('<noscript> You need');
  });

  function boot({ stored, theme, scheme = 'light' }) {
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
    const html = document_();
    document.documentElement.removeAttribute(BOOT_THEME_ATTRIBUTE);
    document.documentElement.removeAttribute(ADMIN_SESSION_ATTRIBUTE);
    if (theme) document.documentElement.setAttribute(BOOT_THEME_ATTRIBUTE, theme);
    localStorage.clear();
    if (stored) localStorage.setItem(ADMIN_SESSION_KEY, stored);
    vi.stubGlobal('matchMedia', (query) => ({
      matches: query === '(prefers-color-scheme: dark)' && scheme === 'dark',
    }));
    document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)[1];
    new Function(/<script>(\(function\(\)\{var painted[\s\S]*?)<\/script>/.exec(html)[1])();
    return document.getElementById('root');
  }

  it('keeps the variant for the saved theme, else the system one, as the root', () => {
    expect(boot({ scheme: 'dark' }).getAttribute(ADMIN_VARIANT_ATTRIBUTE)).toBe('dark');
    expect(boot({ theme: 'light', scheme: 'dark' }).getAttribute(ADMIN_VARIANT_ATTRIBUTE)).toBe(
      'light'
    );
    expect(document.querySelectorAll(`[${ADMIN_VARIANT_ATTRIBUTE}]`)).toHaveLength(1);
  });

  it('marks a stored session before the entry loads, and only then', () => {
    boot({ stored: SESSION });
    expect(document.documentElement.hasAttribute(ADMIN_SESSION_ATTRIBUTE)).toBe(true);
    boot({});
    expect(document.documentElement.hasAttribute(ADMIN_SESSION_ATTRIBUTE)).toBe(false);
  });
});

describe("the worker's view of the admin document", () => {
  let dir;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('is written beside the route table pages and left to the network', () => {
    expect(writtenPageDocuments()).toContainEqual({
      page: 'admin',
      path: UNLINKED_DOCUMENT_PATHS.admin,
      file: ADMIN_DOCUMENT_FILE,
    });
    for (const path of [UNLINKED_DOCUMENT_PATHS.admin, `${UNLINKED_DOCUMENT_PATHS.admin}/x`]) {
      const route = { request: { mode: 'navigate' }, url: new URL(path, 'https://splotch.test') };
      expect([isNativeAppNavigation(route), isOtherNativeNavigation(route)], path).toEqual([
        false,
        false,
      ]);
    }
  });

  it('keeps every chunk only the admin document loads out of the precache', () => {
    dir = mkdtempSync(join(tmpdir(), 'native-web-admin-'));
    const list = (scripts) =>
      `<script type="application/json" id="${STARTUP_SCRIPTS_ELEMENT_ID}">${JSON.stringify(scripts)}</script>`;
    const files = {
      'index.html': list(['/_expo/static/js/web/index-1.js']),
      [ADMIN_DOCUMENT_FILE]: list(['/_expo/static/js/web/adminApp-1.js']),
      '_expo/static/js/web/index-1.js': '',
      '_expo/static/js/web/adminApp-1.js': '',
    };
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), body);
    }
    expect(pageOnlyChunks(dir, 'index.html')).toContain('_expo/static/js/web/adminApp-1.js');
  });
});

// The export's strict.css is inlined into the drawing screen's first paint, so the console's rules
// must stay out of it.
it("leaves the console's style sources out of the export's strict.css", async () => {
  const { default: config } =
    await import('../../experiments/native-architecture/postcss.config.mjs');
  const [{ options }] = config.plugins;
  expect(options.exclude).toContain(ADMIN_DOCUMENT_SOURCES);
});
