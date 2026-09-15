import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tick } from 'svelte';
import { themes } from '$lib/design/tokens';
import { THEME_COLORS } from '../theme';
import * as themeModule from '../theme';
import { createAppearance, type AppearanceState } from './appearance.svelte';
import { createColors } from './colors.svelte';
import { createSettings, type SettingsState } from './settings.svelte';
import { createTool } from './tool.svelte';

// secureStorage reaches for IndexedDB/WebCrypto on the web path; settings.svelte
// (imported transitively via appearance) only needs its function bindings, so
// stub them out — none are called at import time.
vi.mock('../secureStorage', () => ({
  saveApiKey: vi.fn(async () => {}),
  loadApiKey: vi.fn(async () => null),
  clearApiKey: vi.fn(async () => {}),
}));

const THEME_COLOR_DARK = themes.dark.appBg;

// One controllable prefers-color-scheme query, recording every subscription so
// the test can prove exactly one listener is registered per install.
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

let installed: AppearanceState | null = null;

// Builds the settings → appearance pair on the query installMatchMedia() left in
// place and installs it, the way the module singleton does at load.
async function freshAppearance(): Promise<{
  settings: SettingsState;
  appearance: AppearanceState;
}> {
  const settings = createSettings(createTool());
  const appearance = createAppearance(settings, createColors());
  appearance.install();
  installed = appearance;
  await tick();
  return { settings, appearance };
}

function themeColorContent() {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
}

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = `<meta name="theme-color" content="${THEME_COLORS.light}" />`;
});

afterEach(() => {
  installed?.dispose();
  installed = null;
});

describe('single prefers-color-scheme source', () => {
  it('does not rerun theme synchronization when the active swatch changes', async () => {
    installMatchMedia();
    const settings = createSettings(createTool());
    const colors = createColors();
    const syncInk = vi.spyOn(colors, 'syncInkToTheme');
    const writeMeta = vi.spyOn(themeModule, 'updateThemeColorMeta');
    installed = createAppearance(settings, colors);
    installed.install();
    await tick();
    expect(syncInk).toHaveBeenCalledTimes(1);
    expect(writeMeta).toHaveBeenCalledTimes(1);

    colors.selectPaletteColor('#ff0000');
    await tick();
    expect(colors.activeSwatch).toBe('#ff0000');
    expect.soft(writeMeta).toHaveBeenCalledTimes(1);
    expect.soft(syncInk).toHaveBeenCalledTimes(1);
  });

  it('opens exactly one media-query subscription per install', async () => {
    const matchMedia = installMatchMedia();
    const { appearance } = await freshAppearance();
    appearance.install();

    const darkQueries = matchMedia.mock.calls.filter(([q]) => q === '(prefers-color-scheme: dark)');
    expect(darkQueries).toHaveLength(1);
    expect(query.addEventListener).toHaveBeenCalledTimes(1);
    expect(query.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('one OS change event updates BOTH resolvedTheme() and the theme-color meta', async () => {
    installMatchMedia();
    const { appearance } = await freshAppearance();

    // Default setting is 'system' with the OS reporting light.
    expect(appearance.resolvedTheme()).toBe('light');
    expect(themeColorContent()).toBe(THEME_COLORS.light);

    emitSystemChange(true);
    await tick();

    expect(appearance.resolvedTheme()).toBe('dark');
    expect(themeColorContent()).toBe(THEME_COLOR_DARK);

    emitSystemChange(false);
    await tick();

    expect(appearance.resolvedTheme()).toBe('light');
    expect(themeColorContent()).toBe(THEME_COLORS.light);
  });

  it('an explicit setting change repaints the meta from the same reactive source', async () => {
    installMatchMedia();
    const { settings, appearance } = await freshAppearance();

    settings.setTheme('dark');
    await tick();
    expect(appearance.resolvedTheme()).toBe('dark');
    expect(themeColorContent()).toBe(THEME_COLOR_DARK);

    settings.setTheme('light');
    await tick();
    expect(appearance.resolvedTheme()).toBe('light');
    expect(themeColorContent()).toBe(THEME_COLORS.light);
  });

  it('seeds systemDark from the query at install so a dark OS resolves before any event', async () => {
    installMatchMedia();
    query.matches = true;
    const { appearance } = await freshAppearance();

    expect(appearance.resolvedTheme()).toBe('dark');
    expect(themeColorContent()).toBe(THEME_COLOR_DARK);
  });

  it('stops following the OS and the setting once disposed', async () => {
    installMatchMedia();
    const { settings, appearance } = await freshAppearance();

    appearance.dispose();
    expect(query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    settings.setTheme('dark');
    await tick();
    expect(themeColorContent()).toBe(THEME_COLORS.light);
  });
});

describe('setResolvedTheme', () => {
  it('requesting the appearance the dark OS already renders restores system', async () => {
    installMatchMedia();
    query.matches = true;
    const { settings, appearance } = await freshAppearance();

    appearance.setResolvedTheme('dark');
    await tick();

    expect(settings.theme).toBe('system');
  });

  it('requesting the appearance opposite a dark OS pins an explicit choice', async () => {
    installMatchMedia();
    query.matches = true;
    const { settings, appearance } = await freshAppearance();

    appearance.setResolvedTheme('light');
    await tick();

    expect(settings.theme).toBe('light');
  });

  it('requesting the appearance opposite a light OS pins an explicit choice', async () => {
    installMatchMedia();
    query.matches = false;
    const { settings, appearance } = await freshAppearance();

    appearance.setResolvedTheme('dark');
    await tick();

    expect(settings.theme).toBe('dark');
  });

  it('requesting the appearance the light OS already renders restores system', async () => {
    installMatchMedia();
    query.matches = false;
    const { settings, appearance } = await freshAppearance();

    appearance.setResolvedTheme('light');
    await tick();

    expect(settings.theme).toBe('system');
  });
});
