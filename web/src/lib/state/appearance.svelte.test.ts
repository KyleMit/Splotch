import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tick } from 'svelte';
import { themes } from '$lib/design/tokens';

// secureStorage reaches for IndexedDB/WebCrypto on the web path; settings.svelte
// (imported transitively via appearance) only needs its function bindings, so
// stub them out — none are called at import time.
vi.mock('../secureStorage', () => ({
  saveApiKey: vi.fn(async () => {}),
  loadApiKey: vi.fn(async () => null),
  clearApiKey: vi.fn(async () => {}),
  requestPersistentStorage: vi.fn(async () => false),
}));

const THEME_COLOR_LIGHT = '#ffffff';
const THEME_COLOR_DARK = themes.dark.appBg;

// One controllable prefers-color-scheme query, recording every subscription so
// the test can prove exactly one listener is registered across the whole graph.
type ChangeHandler = (e: { matches: boolean }) => void;
const query = vi.hoisted(() => ({
  matches: false,
  handlers: [] as ChangeHandler[],
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

function installMatchMedia() {
  query.matches = false;
  query.handlers = [];
  query.addEventListener = vi.fn((_type: string, cb: ChangeHandler) => query.handlers.push(cb));
  query.removeEventListener = vi.fn();
  const factory = vi.fn((_query: string) => query);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  window.matchMedia = factory as any;
  return factory;
}

function emitSystemChange(matches: boolean) {
  query.matches = matches;
  query.handlers.forEach((cb) => cb({ matches }));
}

async function freshModule() {
  vi.resetModules();
  const settings = await import('./settings.svelte');
  const appearance = await import('./appearance.svelte');
  return { ...settings, ...appearance };
}

function themeColorContent() {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
}

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = `<meta name="theme-color" content="${THEME_COLOR_LIGHT}" />`;
});

describe('single prefers-color-scheme source', () => {
  it('opens exactly one media-query subscription for the whole module graph', async () => {
    const matchMedia = installMatchMedia();
    await freshModule();
    await tick();

    const darkQueries = matchMedia.mock.calls.filter(([q]) => q === '(prefers-color-scheme: dark)');
    expect(darkQueries).toHaveLength(1);
    expect(query.addEventListener).toHaveBeenCalledTimes(1);
    expect(query.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('one OS change event updates BOTH resolvedTheme() and the theme-color meta', async () => {
    installMatchMedia();
    const { resolvedTheme } = await freshModule();
    await tick();

    // Default setting is 'system' with the OS reporting light.
    expect(resolvedTheme()).toBe('light');
    expect(themeColorContent()).toBe(THEME_COLOR_LIGHT);

    emitSystemChange(true);
    await tick();

    expect(resolvedTheme()).toBe('dark');
    expect(themeColorContent()).toBe(THEME_COLOR_DARK);

    emitSystemChange(false);
    await tick();

    expect(resolvedTheme()).toBe('light');
    expect(themeColorContent()).toBe(THEME_COLOR_LIGHT);
  });

  it('an explicit setting change repaints the meta from the same reactive source', async () => {
    installMatchMedia();
    const { resolvedTheme, setTheme } = await freshModule();
    await tick();

    setTheme('dark');
    await tick();
    expect(resolvedTheme()).toBe('dark');
    expect(themeColorContent()).toBe(THEME_COLOR_DARK);

    setTheme('light');
    await tick();
    expect(resolvedTheme()).toBe('light');
    expect(themeColorContent()).toBe(THEME_COLOR_LIGHT);
  });

  it('seeds systemDark from the query at load so a dark OS resolves before any event', async () => {
    installMatchMedia();
    query.matches = true;
    const { resolvedTheme } = await freshModule();
    await tick();

    expect(resolvedTheme()).toBe('dark');
    expect(themeColorContent()).toBe(THEME_COLOR_DARK);
  });
});
