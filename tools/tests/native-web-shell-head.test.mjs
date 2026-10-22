// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  bootAppSurfaceHeadTag,
  bootThemeHeadTags,
  withShippingTitle,
} from '../migration/build-native-web.mjs';
import { bootAppearance } from '../../experiments/native-architecture/src/platform/bootAppearance.web.ts';
import { BOOT_THEME_ATTRIBUTE } from '../../experiments/native-architecture/src/platform/bootTheme.ts';
import { SOUND_SETTINGS_KEY } from '../../experiments/native-architecture/src/platform/soundSettings.web.ts';
import { DRAWING_THEMES } from '../../experiments/native-architecture/src/drawing/theme.ts';
import { HOME_CARD } from '../../web/src/lib/components/page/socialCard.ts';
import { installAppSurface } from '../../experiments/native-architecture/src/platform/appSurface.web.ts';
import { APP_SURFACE_ATTRIBUTE } from '../../experiments/native-architecture/src/platform/appSurfacePolicy.ts';
import { installAppSurface as installNativeAppSurface } from '../../experiments/native-architecture/src/platform/appSurface.ts';
import { AppSurfaceRoot } from '../../experiments/native-architecture/src/platform/AppSurfaceRoot.tsx';

vi.mock('react-native', () => ({
  StyleSheet: { create: (styles) => styles },
  View: ({ children, ...props }) => createElement('div', props, children),
}));

const nativeWake = vi.hoisted(() => ({
  activate: vi.fn(async () => {}),
  deactivate: vi.fn(async () => {}),
}));
vi.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: nativeWake.activate,
  deactivateKeepAwake: nativeWake.deactivate,
}));

const [styleTag, scriptTag] = bootThemeHeadTags();
const script = /^<script>(.*)<\/script>$/.exec(scriptTag)[1];
const style = /^<style>(.*)<\/style>$/.exec(styleTag)[1];

// Runs the boot script against a saved settings record the way the document's head does.
function boot(saved) {
  const stamps = {};
  runInNewContext(script, {
    localStorage: { getItem: (key) => (key === SOUND_SETTINGS_KEY ? saved : null) },
    document: {
      documentElement: {
        setAttribute: (name, value) => {
          stamps[name] = value;
        },
      },
    },
  });
  return stamps;
}

afterEach(() => document.documentElement.removeAttribute(BOOT_THEME_ATTRIBUTE));

describe('the native drawing wake lock', () => {
  it('acquires on the first lift and releases when drawing leaves the foreground', async () => {
    nativeWake.activate.mockClear();
    nativeWake.deactivate.mockClear();
    const element = document.createElement('div');
    document.body.append(element);
    const root = createRoot(element);
    const render = (active) =>
      act(async () => root.render(createElement(AppSurfaceRoot, { active }, 'Drawing')));
    const touch = (type) =>
      act(async () => element.firstChild.dispatchEvent(new Event(type, { bubbles: true })));
    try {
      await render(true);
      await touch('touchstart');
      expect(nativeWake.activate).not.toHaveBeenCalled();
      await touch('touchend');
      await vi.waitFor(() => expect(nativeWake.activate).toHaveBeenCalledOnce());
      await touch('touchend');
      expect(nativeWake.activate).toHaveBeenCalledOnce();
      const [[tag]] = nativeWake.activate.mock.calls;
      await render(false);
      expect(nativeWake.deactivate).toHaveBeenCalledExactlyOnceWith(tag);
      await touch('touchend');
      expect(nativeWake.activate).toHaveBeenCalledOnce();
      await render(true);
      expect(nativeWake.activate).toHaveBeenCalledOnce();
      await touch('touchend');
      await vi.waitFor(() => expect(nativeWake.activate).toHaveBeenCalledTimes(2));
    } finally {
      await act(async () => root.unmount());
      element.remove();
    }
    expect(nativeWake.deactivate).toHaveBeenCalledTimes(2);
  });
  it('releases an acquisition that settles after its drawing owner unmounts', async () => {
    let acquired;
    nativeWake.activate.mockClear().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acquired = resolve;
        })
    );
    nativeWake.deactivate.mockClear();
    const stop = installNativeAppSurface();
    await vi.waitFor(() => expect(nativeWake.activate).toHaveBeenCalledOnce());
    const [[tag]] = nativeWake.activate.mock.calls;
    stop();
    expect(nativeWake.deactivate).not.toHaveBeenCalled();
    acquired();
    await vi.waitFor(() => expect(nativeWake.deactivate).toHaveBeenCalledExactlyOnceWith(tag));
  });

  it('does not acquire a lock after its owner unmounts before the module loads', async () => {
    nativeWake.activate.mockClear();
    nativeWake.deactivate.mockClear();
    const stop = installNativeAppSurface();
    stop();
    await vi.dynamicImportSettled();
    expect(nativeWake.activate).not.toHaveBeenCalled();
    expect(nativeWake.deactivate).not.toHaveBeenCalled();
  });

  it('releases only its own lock when another drawing mount is active', async () => {
    nativeWake.activate.mockClear();
    nativeWake.deactivate.mockClear();
    const first = installNativeAppSurface();
    const second = installNativeAppSurface();
    await vi.waitFor(() => expect(nativeWake.activate).toHaveBeenCalledTimes(2));
    const tags = nativeWake.activate.mock.calls.map(([tag]) => tag);
    expect(new Set(tags).size).toBe(2);
    first();
    expect(nativeWake.deactivate.mock.calls).toEqual([[tags[0]]]);
    second();
    expect(nativeWake.deactivate.mock.calls).toEqual(tags.map((tag) => [tag]));
  });
});

describe("the drawing surface's browser guards", () => {
  it('requests a wake lock after the first lift and releases it with the drawing surface', async () => {
    const sentinel = { released: false, release: vi.fn(async () => {}) };
    const request = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    const stop = installAppSurface();
    try {
      expect(request).not.toHaveBeenCalled();
      document.dispatchEvent(new Event('pointerup'));
      await Promise.resolve();
      expect(request).toHaveBeenCalledExactlyOnceWith('screen');
      document.dispatchEvent(new Event('pointerup'));
      expect(request).toHaveBeenCalledOnce();
    } finally {
      stop();
      delete navigator.wakeLock;
    }
    expect(sentinel.release).toHaveBeenCalledOnce();
  });
  it('locks the drawing before the first paint and leaves information pages selectable', () => {
    const source = /^<script>(.*)<\/script>$/.exec(bootAppSurfaceHeadTag())[1];
    for (const pathname of [
      '/',
      '/index.html',
      '/privacy',
      '/changelog',
      '/feedback',
      '/does-not-exist',
    ]) {
      const stamps = {};
      runInNewContext(source, {
        location: { pathname },
        document: {
          documentElement: {
            setAttribute: (name, value) => {
              stamps[name] = value;
            },
          },
        },
      });
      expect(stamps, pathname).toEqual(
        ['/', '/index.html'].includes(pathname) ? { [APP_SURFACE_ATTRIBUTE]: '' } : {}
      );
    }
  });
  it('prevents a long-press menu only while the drawing surface owns the document', () => {
    const menu = () => document.dispatchEvent(new Event('contextmenu', { cancelable: true }));
    expect(menu()).toBe(true);
    const stop = installAppSurface();
    try {
      expect(document.documentElement.hasAttribute(APP_SURFACE_ATTRIBUTE)).toBe(true);
      expect(menu()).toBe(false);
    } finally {
      stop();
    }
    expect(document.documentElement.hasAttribute(APP_SURFACE_ATTRIBUTE)).toBe(false);
    expect(menu()).toBe(true);
  });
});

describe("the web shell's boot theme", () => {
  it('stamps a saved Light or Dark choice and leaves System to the media query', () => {
    expect(boot(JSON.stringify({ version: 13, appearance: 'dark' }))).toEqual({
      [BOOT_THEME_ATTRIBUTE]: 'dark',
    });
    expect(boot(JSON.stringify({ version: 13, appearance: 'light' }))).toEqual({
      [BOOT_THEME_ATTRIBUTE]: 'light',
    });
    expect(boot(JSON.stringify({ version: 13, appearance: 'system' }))).toEqual({});
    expect(boot(null)).toEqual({});
    expect(boot('{not json')).toEqual({});
  });

  it('paints the paper of the theme it booted in before the bundle runs', () => {
    expect(style).toBe(
      `html{background:${DRAWING_THEMES.light.paper}}` +
        `@media (prefers-color-scheme:dark){html:not([${BOOT_THEME_ATTRIBUTE}=light]){background:${DRAWING_THEMES.dark.paper}}}` +
        `html[${BOOT_THEME_ATTRIBUTE}=dark]{background:${DRAWING_THEMES.dark.paper}}`
    );
  });

  it("hands the stamped choice to the drawing screen's first frame", () => {
    expect(bootAppearance()).toBe('system');
    document.documentElement.setAttribute(BOOT_THEME_ATTRIBUTE, 'dark');
    expect(bootAppearance()).toBe('dark');
    document.documentElement.setAttribute(BOOT_THEME_ATTRIBUTE, 'sepia');
    expect(bootAppearance()).toBe('system');
  });
});

// Shipping's drawing route titles its tab from the home card; the export replaces Expo's app-name
// title with it (#3027). Negative control: a shell left with Expo's title fails here.
describe("the web shell's title", () => {
  it("takes shipping's drawing-page title in place of Expo's app name", () => {
    const shell = withShippingTitle('<head><title>Splotch</title></head>');
    expect(shell).toBe(`<head><title>${HOME_CARD.title}</title></head>`);
    expect(() => withShippingTitle('<head></head>')).toThrow('no <title>');
  });
});

it('scopes touch, selection and callout locks to the app surface', () => {
  const stylesheet = readFileSync(
    join(import.meta.dirname, '../../experiments/native-architecture/src/strict.css'),
    'utf8'
  );
  const selector = `:root[${APP_SURFACE_ATTRIBUTE}] body`;
  const body = stylesheet
    .slice(stylesheet.indexOf(selector) + selector.length)
    .match(/^\s*\{([^}]+)\}/)?.[1];
  const declarations = body
    ?.split(';')
    .map((value) => value.trim())
    .filter(Boolean)
    .sort();
  expect(declarations).toEqual([
    '-webkit-touch-callout: none',
    '-webkit-user-select: none',
    'overflow: hidden',
    'touch-action: none',
    'user-select: none',
  ]);
});
