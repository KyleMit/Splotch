// No environment docblock despite this being pure text parsing: importing
// settings.svelte.ts for the clamp constants runs that module's load-time
// localStorage reads, so the file has to stay on the happy-dom default
// (.claude/rules/testing.md). Spelling the node opt-out annotation out here,
// even to say it is absent, applies it — vitest reads that annotation from any
// leading comment, sentence or not.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BRUSH_ATTRIBUTE,
  CONTROL_OFF_ATTRIBUTES,
  DRAWER_OPEN_ATTRIBUTE,
} from './lib/actionButtonLayout';
import { DRAWING_ROUTE } from './lib/boot/appSurfaceRoute';
import { STORAGE_KEYS } from './lib/storage';
import { RESOLVED_THEMES, THEME_COLORS } from './lib/theme';
import {
  ACTION_BUTTON_SCALE_DEFAULT,
  ACTION_BUTTON_SCALE_MAX,
  ACTION_BUTTON_SCALE_MIN,
} from './lib/state/settings.svelte';
import { BRUSH_TYPES } from './lib/state/tool.svelte';

// app.html's pre-hydration boot IIFE is vanilla JS in a template file, so it
// can't import anything — it re-types every localStorage key, every boolean
// default, and the scale clamp as literals. This is the mechanical guard on
// that duplication: rename a key or flip a default and the stamp silently
// seeds the wrong first-paint attribute, with no type error and no failing
// test.
//
// The registry, clamp bounds and attribute vocabulary are imported directly.
// Boolean defaults are parsed as text because BOOL_SETTINGS itself is
// module-private.

// The path stays a parameter: Vite rewrites a `new URL('./literal',
// import.meta.url)` into the served asset's http URL, which readFileSync
// rejects (precedent: lib/design/trimGeometry.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const html = sourceFile('./app.html');

const bootScript = (() => {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  expect(match, 'app.html has an inline boot <script>').not.toBeNull();
  return match![1];
})();

const settingsSource = sourceFile('./lib/state/settings.svelte.ts');
const registryKeys = new Set(Object.values(STORAGE_KEYS));

// BOOL_SETTINGS entries are `propName: [STORAGE_KEYS.someKey, default]`; re-key
// them by the key's string literal, which is the only handle the boot script has.
const boolDefaults: Map<string, boolean> = new Map(
  [...settingsSource.matchAll(/\[STORAGE_KEYS\.(\w+), (true|false)\]/g)].flatMap((m) => {
    const key = STORAGE_KEYS[m[1] as keyof typeof STORAGE_KEYS];
    return key ? [[key, m[2] === 'true'] as const] : [];
  })
);

function bootLiteral(pattern: RegExp): number {
  const match = bootScript.match(pattern);
  expect(match, `app.html's boot script matches ${pattern}`).not.toBeNull();
  return Number(match![1]);
}

function bootStringLiteral(pattern: RegExp): string {
  const match = bootScript.match(pattern);
  expect(match, `app.html's boot script matches ${pattern}`).not.toBeNull();
  return match![1];
}

describe("app.html's prerendered head mirrors the theme module", () => {
  it('seeds theme-color with THEME_COLORS.light', () => {
    const match = html.match(/<meta name="theme-color" content="([^"]*)" \/>/);
    expect(match, 'app.html has a theme-color meta').not.toBeNull();
    expect(match![1]).toBe(THEME_COLORS.light);
  });
});

describe("app.html's boot script mirrors the state modules", () => {
  const bootKeys = [...new Set([...bootScript.matchAll(/'(splotch-[\w-]+)'/g)].map((m) => m[1]))];
  // `\s*` between the tokens so a prettier reflow of a long `on(...)` call
  // across lines still parses — several sit close to the 100-char printWidth.
  const bootBoolDefaults = [
    ...bootScript.matchAll(/\bon\(\s*'(splotch-[\w-]+)',\s*(true|false)\s*\)/g),
  ].map((m) => [m[1], m[2] === 'true'] as const);

  it('parses keys and boolean defaults out of both sides', () => {
    expect(bootKeys.length).toBeGreaterThan(0);
    expect(registryKeys.size).toBeGreaterThan(0);
    expect(boolDefaults.size).toBeGreaterThan(0);

    // Fail closed: the per-key guards below are generated from what the pair
    // regex matched, so an `on()` call it can't parse would drop that key's
    // default from the suite silently instead of failing.
    const onCalls = [...bootScript.matchAll(/\bon\(/g)].length;
    expect(onCalls).toBeGreaterThan(0);
    expect(bootBoolDefaults.length).toBe(onCalls);
  });

  // Containment, not equality: plenty of persisted keys have no first-paint
  // attribute (splotch-sound-enabled, for one), so the boot script is expected
  // to read a subset.
  for (const key of bootKeys) {
    it(`${key} is defined by the storage registry`, () => {
      expect([...registryKeys]).toContain(key);
    });
  }

  for (const [key, fallback] of bootBoolDefaults) {
    it(`${key} falls back to its BOOL_SETTINGS default`, () => {
      expect(boolDefaults.get(key)).toBe(fallback);
    });
  }

  it('clamps the button scale to ACTION_BUTTON_SCALE_MIN/MAX', () => {
    expect(bootLiteral(/Math\.max\((\d+), Math\.min\(\d+, pct\)\)/)).toBe(ACTION_BUTTON_SCALE_MIN);
    expect(bootLiteral(/Math\.max\(\d+, Math\.min\((\d+), pct\)\)/)).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('defaults the button scale to ACTION_BUTTON_SCALE_DEFAULT', () => {
    expect(bootLiteral(/scaleRaw == null \? (\d+)/)).toBe(ACTION_BUTTON_SCALE_DEFAULT);
    expect(bootLiteral(/isNaN\(pct\)\) pct = (\d+)/)).toBe(ACTION_BUTTON_SCALE_DEFAULT);
    expect(bootLiteral(/pct !== (\d+)/)).toBe(ACTION_BUTTON_SCALE_DEFAULT);
  });

  // 'pen' is the default, which needs no attribute to render; 'eraser' is never
  // persisted (see readBrush in tool.svelte.ts), so neither is ever stamped.
  it('stamps data-brush for every persistable non-default brush', () => {
    const bootBrushes = [...bootScript.matchAll(/brush === '(\w+)'/g)].map((m) => m[1]);
    expect(new Set(bootBrushes)).toEqual(
      new Set(BRUSH_TYPES.filter((b) => b !== 'pen' && b !== 'eraser'))
    );
  });

  // The panel-state vocabulary publishActionPanelState owns: the boot script
  // must seed exactly those names, or a returning user gets a first-paint flash
  // as hydration corrects an attribute the seeded CSS never saw.
  it('seeds exactly the panel-state attributes publishActionPanelState stamps', () => {
    const seeded = new RegExp(
      `toggleAttribute\\('(data-off-[\\w-]+|${DRAWER_OPEN_ATTRIBUTE})'`,
      'g'
    );
    const bootAttributes = [...bootScript.matchAll(seeded)].map((m) => m[1]);
    expect(new Set(bootAttributes)).toEqual(
      new Set([...Object.values(CONTROL_OFF_ATTRIBUTES), DRAWER_OPEN_ATTRIBUTE])
    );
  });

  // The brush values are guarded above; this is the attribute they land on,
  // which the boot script re-types as its own literal.
  it('seeds the brush face under BRUSH_ATTRIBUTE', () => {
    expect(bootStringLiteral(/setAttribute\('([\w-]+)', brush\)/)).toBe(BRUSH_ATTRIBUTE);
  });

  it('stamps data-theme for every resolved theme', () => {
    const bootThemes = [...bootScript.matchAll(/theme === '(\w+)'/g)].map((m) => m[1]);
    expect(new Set(bootThemes)).toEqual(new Set(RESOLVED_THEMES));
  });

  it('seeds data-app-surface for DRAWING_ROUTE', () => {
    expect(
      bootStringLiteral(/toggleAttribute\('data-app-surface', location\.pathname === '([^']*)'\)/)
    ).toBe(DRAWING_ROUTE);
  });

  // Catches the other half of the divergence app.html's literal can't see:
  // DRAWING_ROUTE naming a route whose +page.svelte is no longer the drawing
  // page, e.g. because the drawing page moved to /draw and a landing page
  // took over '/'. Asserting mere existence would still pass in that
  // scenario (routes/+page.svelte still exists — it's just the wrong page
  // now), so this reads the file and requires it to actually own the
  // data-app-surface set/clear effect.
  it('DRAWING_ROUTE resolves to the +page.svelte that owns data-app-surface', () => {
    const routeSegment = DRAWING_ROUTE.replace(/^\/|\/$/g, '');
    const pagePath = new URL(
      `./routes/${routeSegment ? `${routeSegment}/` : ''}+page.svelte`,
      import.meta.url
    );
    expect(existsSync(pagePath), `expected a +page.svelte for route '${DRAWING_ROUTE}'`).toBe(true);

    const pageSource = readFileSync(pagePath, 'utf8');
    expect(
      pageSource,
      `expected the +page.svelte at '${DRAWING_ROUTE}' to set/clear data-app-surface`
    ).toMatch(/setAttribute\('data-app-surface', ''\)/);
    expect(pageSource).toMatch(/removeAttribute\('data-app-surface'\)/);
  });
});
