// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FIRST_FRAME_SETTINGS_KEYS,
  FIRST_FRAME_THEMES,
  FIRST_FRAME_VIEWPORTS,
  criticalSheetText,
  firstFrameFeedbackCss,
  paperTextureRule,
  startupScriptList,
  variantKey,
  withFirstFrames,
} from '../migration/prerender-native-web.mjs';
import {
  FIRST_FRAME_VIEWPORT_ATTRIBUTE,
  formatFirstFrameViewport,
  parseFirstFrameViewport,
} from '../../experiments/native-architecture/src/platform/firstFrameViewport.ts';
import { BOOT_THEME_ATTRIBUTE } from '../../experiments/native-architecture/src/platform/bootTheme.ts';
import { ROOT } from '../lib/proc.mjs';

const SRC = join(ROOT, 'experiments/native-architecture/src');
const SCRIPTS = ['/_expo/static/js/web/runtime-1.js', '/_expo/static/js/web/index-2.js'];
const STYLESHEET = '/_expo/static/css/strict-1.css';
const EXPORTED_SHELL = `<!DOCTYPE html><html><head><title>Splotch</title><link rel="preload" href="${STYLESHEET}" as="style">\n<link rel="stylesheet" href="${STYLESHEET}"></head><body><div id="root"></div>${SCRIPTS.map((src) => `<script src="${src}" defer></script>`).join('')}</body></html>`;
const TEXTURE = '/assets/paper/handmade-paper.0123.webp';

// One stand-in frame per variant, naming its own key so a test can see which one was cloned.
function frames() {
  return {
    variants: FIRST_FRAME_VIEWPORTS.flatMap((viewport) =>
      FIRST_FRAME_THEMES.map((theme) => {
        const key = variantKey(viewport, theme);
        return {
          key,
          id: `first-frame-${key}`,
          viewport,
          html: `<div class="css-used" data-frame="${key}" style="background:var(--paper-texture, url(&quot;${TEXTURE}&quot;))"></div>`,
        };
      })
    ),
    sheet: {
      id: 'react-native-stylesheet',
      textContent: [
        '[stylesheet-group="0"]{}',
        'html{-webkit-text-size-adjust:100%;}',
        '.css-used{display:flex;}',
        '.css-unused{display:none;}',
      ].join('\n'),
    },
  };
}

const STYLESHEET_TEXT = '.x1{display:flex}';
const TEXTURE_BYTES = Buffer.from('texture bytes');
const EXPORT_FILES = { [STYLESHEET]: Buffer.from(STYLESHEET_TEXT), [TEXTURE]: TEXTURE_BYTES };
const readExportFile = (href) => EXPORT_FILES[href];
const shell = withFirstFrames(EXPORTED_SHELL, frames(), readExportFile);
const bootScript = /<script>(\(function\(\)\{var painted[\s\S]*?)<\/script>/.exec(shell)[1];

// Lays the shell's body out in this document and runs its boot script there, as the parser does.
function boot({ width, height, path = '/', theme = null, systemDark = false }) {
  // The appended bundle scripts count as loaded; the test reads which ones were appended.
  window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
  window.happyDOM.setURL(`http://localhost${path}`);
  window.happyDOM.setViewport({ width, height });
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query === '(prefers-color-scheme: dark)' && systemDark,
  }));
  if (theme) document.documentElement.setAttribute(BOOT_THEME_ATTRIBUTE, theme);
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(shell)[1];
  globalThis.__EXPO_ROUTER_HYDRATE__ = undefined;
  new Function(bootScript)();
  const root = document.getElementById('root');
  return {
    frame: root.firstElementChild?.getAttribute('data-frame') ?? null,
    viewport: root.getAttribute(FIRST_FRAME_VIEWPORT_ATTRIBUTE),
    hydrate: globalThis.__EXPO_ROUTER_HYDRATE__ ?? false,
    loaded: () =>
      [...document.querySelectorAll('body > script[src]')].map((script) =>
        script.getAttribute('src')
      ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.documentElement.removeAttribute(BOOT_THEME_ATTRIBUTE);
});

describe('the prerendered first frame', () => {
  it('clones the variant for the window’s size class, orientation and theme', () => {
    expect(boot({ width: 412, height: 915 })).toMatchObject({
      frame: '0plight',
      viewport: '412x915@2.625',
      hydrate: true,
    });
    expect(boot({ width: 390, height: 844, systemDark: true }).frame).toBe('0pdark');
    expect(boot({ width: 1180, height: 820, theme: 'dark' }).frame).toBe('1ldark');
    expect(boot({ width: 844, height: 390, theme: 'light', systemDark: true }).frame).toBe(
      '0llight'
    );
    expect(boot({ width: 1366, height: 1024 }).frame).toBe('2llight');
  });

  it('leaves the root empty for a visitor with saved choices the frames do not show', () => {
    for (const key of FIRST_FRAME_SETTINGS_KEYS) {
      localStorage.setItem(key, '{}');
      expect(boot({ width: 412, height: 915 })).toMatchObject({ frame: null, hydrate: false });
      localStorage.removeItem(key);
    }
    expect(boot({ width: 412, height: 915 }).frame).toBe('0plight');
  });

  it('leaves the root empty and does not hydrate off the drawing paths', () => {
    expect(boot({ width: 412, height: 915, path: '/privacy' })).toMatchObject({
      frame: null,
      hydrate: false,
    });
  });

  it('loads the bundle in order once the cloned frame’s first contentful paint is reported', () => {
    vi.useFakeTimers();
    const observers = [];
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        constructor(callback) {
          this.callback = callback;
          observers.push(this);
        }
        observe() {}
        disconnect() {}
      }
    );
    const report = (name) =>
      observers[0].callback(
        { getEntriesByName: (wanted) => (wanted === name ? [{ name }] : []) },
        observers[0]
      );
    const { loaded } = boot({ width: 412, height: 915 });
    report('first-paint');
    vi.advanceTimersByTime(0);
    expect(loaded()).toEqual([]);
    report('first-contentful-paint');
    vi.advanceTimersByTime(0);
    expect(loaded()).toEqual(SCRIPTS);
  });

  it('loads the bundle without a reported paint once the fallback passes', () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    const { loaded } = boot({ width: 412, height: 915 });
    vi.advanceTimersByTime(1999);
    expect(loaded()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(loaded()).toEqual(SCRIPTS);
  });

  it('loads the bundle at once when nothing was cloned', () => {
    expect(boot({ width: 412, height: 915, path: '/changelog' }).loaded()).toEqual(SCRIPTS);
  });

  it('moves the exported scripts into the list the boot script loads', () => {
    expect(startupScriptList(shell)).toEqual(SCRIPTS);
    expect(shell).not.toMatch(/<script src="[^"]+" defer>/);
  });

  it('inlines only the style rules its markup uses, with the sheet’s group markers', () => {
    const { variants, sheet } = frames();
    expect(criticalSheetText(sheet.textContent, variants.map(({ html }) => html).join(''))).toBe(
      [
        '[stylesheet-group="0"]{}',
        'html{-webkit-text-size-adjust:100%;}',
        '.css-used{display:flex;}',
      ].join('\n')
    );
    expect(shell).toContain('<style id="react-native-stylesheet">');
  });

  it('inlines the exported style sheet in its place instead of linking it', () => {
    expect(shell).toContain(`<style>${STYLESHEET_TEXT}</style>`);
    expect(shell).not.toContain(STYLESHEET);
  });

  it('carries the paper texture once, as the property the paper reads', () => {
    const rule = `:root{--paper-texture:url("data:image/webp;base64,${TEXTURE_BYTES.toString('base64')}")}`;
    expect(paperTextureRule(frames().variants[0].html, readExportFile)).toBe(rule);
    expect(shell.split(rule)).toHaveLength(2);
    expect(shell).not.toContain('rel="preload" as="image"');
    expect(() =>
      paperTextureRule('<div style="background:url(&quot;/a.webp&quot;)"></div>', readExportFile)
    ).toThrow('The first frame paints no paper texture to inline.');
  });

  it('styles the pre-hydration feedback in the shell itself', () => {
    expect(shell).toContain(firstFrameFeedbackCss());
    expect(firstFrameFeedbackCss()).toContain(
      'html:not([data-controls-live]) #root button:active{scale:'
    );
    expect(firstFrameFeedbackCss()).toContain('@media (prefers-reduced-motion:reduce){');
  });

  it('names each viewport in a form the client reads back', () => {
    for (const viewport of FIRST_FRAME_VIEWPORTS)
      expect(
        parseFirstFrameViewport(formatFirstFrameViewport({ ...viewport, fontScale: 1 }))
      ).toEqual({
        ...viewport,
        fontScale: 1,
      });
    expect(parseFirstFrameViewport(null)).toBeNull();
    expect(parseFirstFrameViewport('412 by 915')).toBeNull();
  });
});

function sources(directory = SRC) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [relative(SRC, path)] : [];
  });
}

describe('the window size the drawing screen reads', () => {
  // React Native Web's own hook reads the live window while hydrating, so a prerendered frame on
  // any other viewport would keep that frame's markup (platform/windowDimensions.web.ts).
  it('comes from platform/windowDimensions on every web path', () => {
    const offenders = sources().filter(
      (path) =>
        path !== 'platform/windowDimensions.ts' &&
        !/\.(native|ios|android)\.tsx?$/.test(path) &&
        /import \{[^}]*\buseWindowDimensions\b[^}]*\} from 'react-native'/.test(
          readFileSync(join(SRC, path), 'utf8')
        )
    );
    expect(offenders).toEqual([]);
  });
});
