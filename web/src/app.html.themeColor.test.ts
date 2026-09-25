import { describe, expect, it, vi } from 'vitest';
import { bootScript, bootStringLiteral, html, runBootScript } from './appHtmlBootTestHarness';
import { STORAGE_KEYS } from './lib/storage';
import {
  DARK_SCHEME_QUERY,
  RESOLVED_THEMES,
  resolveTheme,
  THEME_COLOR_META_SELECTOR,
  THEME_COLORS,
  THEME_DEFAULT,
  type ThemePreference,
} from './lib/theme';

describe("app.html's prerendered head mirrors the theme module", () => {
  it('seeds theme-color with THEME_COLORS.light', () => {
    const match = html.match(/<meta name="theme-color" content="([^"]*)" \/>/);
    expect(match, 'app.html has a theme-color meta').not.toBeNull();
    expect(match![1]).toBe(THEME_COLORS.light);
  });
});

// Routes other than the drawing page and /design rely on the boot script
// to put browser chrome on the resolved theme, with its own copy of
// THEME_COLORS and of resolveTheme's three-state
// rule. Reading those back out of the source would only prove the hexes match,
// so this runs the shipped script against the shipped tag instead: every
// preference the app can resolve, under both OS preferences.
describe("app.html's boot script paints theme-color like the theme module", () => {
  type OsChangeListener = (event: { matches: boolean }) => void;

  function boot(preference: ThemePreference, systemDark: boolean) {
    localStorage.clear();
    if (preference !== THEME_DEFAULT) localStorage.setItem(STORAGE_KEYS.theme, preference);

    const osListeners: OsChangeListener[] = [];
    window.matchMedia = ((query: string) => ({
      matches: query === DARK_SCHEME_QUERY && systemDark,
      addEventListener: (_type: string, listener: OsChangeListener) => {
        if (query === DARK_SCHEME_QUERY) osListeners.push(listener);
      },
    })) as unknown as typeof window.matchMedia;

    runBootScript();

    return {
      // Read through theme.ts's selector, against a head seeded from app.html's
      // own markup: the tag the app repaints has to be the tag the script found.
      painted: () =>
        document.querySelector(THEME_COLOR_META_SELECTOR)?.getAttribute('content') ?? null,
      osListeners,
      onDrawingSurface: (on: boolean) =>
        document.documentElement.toggleAttribute('data-app-surface', on),
    };
  }

  for (const preference of [...RESOLVED_THEMES, THEME_DEFAULT]) {
    for (const systemDark of [false, true]) {
      it(`${preference} preference with the OS in ${systemDark ? 'dark' : 'light'} mode`, () => {
        expect(boot(preference, systemDark).painted()).toBe(
          THEME_COLORS[resolveTheme(preference, systemDark)]
        );
      });
    }
  }

  it('paints the OS theme when storage refuses every read', () => {
    const refusedRead = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    try {
      expect(boot(THEME_DEFAULT, true).painted()).toBe(THEME_COLORS.dark);
    } finally {
      refusedRead.mockRestore();
    }
  });

  it('follows OS theme changes when storage refuses every read', () => {
    const refusedRead = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    try {
      const session = boot(THEME_DEFAULT, false);
      session.onDrawingSurface(false);
      expect(session.painted()).toBe(THEME_COLORS.light);
      expect(session.osListeners).toHaveLength(1);

      session.osListeners[0]({ matches: true });
      expect(session.painted()).toBe(THEME_COLORS.dark);
      session.osListeners[0]({ matches: false });
      expect(session.painted()).toBe(THEME_COLORS.light);

      session.onDrawingSurface(true);
      session.osListeners[0]({ matches: true });
      expect(session.painted()).toBe(THEME_COLORS.light);
    } finally {
      refusedRead.mockRestore();
    }
  });

  it('subscribes to the OS scheme by the query theme.ts declares', () => {
    expect(bootStringLiteral(/var darkQuery = window\.matchMedia\('([^']*)'\)/)).toBe(
      DARK_SCHEME_QUERY
    );
  });

  it('reaches the tag by the selector theme.ts uses', () => {
    expect(bootScript).toContain(THEME_COLOR_META_SELECTOR);
  });

  it('follows a later OS switch, the way appearance.svelte.ts does for the app', () => {
    const session = boot(THEME_DEFAULT, false);
    session.onDrawingSurface(false);
    expect(session.osListeners.length).toBe(1);

    session.osListeners[0]({ matches: true });
    expect(session.painted()).toBe(THEME_COLORS.dark);
    session.osListeners[0]({ matches: false });
    expect(session.painted()).toBe(THEME_COLORS.light);
  });

  // NotchBand tints this tag with the active drawing color while the drawing
  // surface is up, so an OS switch there must not repaint over it.
  it('leaves the tag alone while the drawing surface owns it', () => {
    const session = boot(THEME_DEFAULT, false);
    session.onDrawingSurface(true);

    session.osListeners[0]({ matches: true });
    expect(session.painted()).toBe(THEME_COLORS.light);
  });

  // An explicit choice doesn't move with the OS, so there is nothing to listen for.
  it('subscribes to the OS preference only in system mode', () => {
    for (const preference of RESOLVED_THEMES) {
      expect(boot(preference, false).osListeners).toEqual([]);
    }
  });
});
