// No environment docblock despite this being pure text parsing: importing
// settings.svelte.ts for the clamp constants runs that module's load-time
// localStorage reads, so the file has to stay on the happy-dom default
// (.claude/rules/testing.md). Spelling the node opt-out annotation out here,
// even to say it is absent, applies it — vitest reads that annotation from any
// leading comment, sentence or not.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bootLiteral,
  bootScript,
  bootStringLiteral,
  runBootScript,
  sourceFile,
} from './appHtmlBootTestHarness';
import {
  AI_SLOT_ATTRIBUTE,
  BRUSH_ATTRIBUTE,
  CONTROL_OFF_ATTRIBUTES,
  DRAWER_OPEN_ATTRIBUTE,
  NO_ACTIONS_ATTRIBUTE,
  SINGLE_BRUSH_ATTRIBUTE,
} from './lib/actionButtonLayout';
import { DRAWING_ROUTE } from './lib/boot/appSurfaceRoute';
import { PORTRAIT_QUERY } from './lib/breakpoints';
import { STORAGE_KEYS } from './lib/storage';
import { FREE_GENERATION_LIMIT } from './lib/freeGenerations';
import { RESOLVED_THEMES } from './lib/theme';
import {
  ACTION_BUTTON_SCALE_DEFAULT,
  ACTION_BUTTON_SCALE_MAX,
  ACTION_BUTTON_SCALE_MIN,
  TOOL_DRAWER_CONTROLS,
} from './lib/state/settings.svelte';
import { BRUSH_TYPES, OPTIONAL_BRUSH_TYPES } from './lib/state/tool.svelte';

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

const webBackHandlerSource = sourceFile('./lib/boot/webBackHandler.ts');
const svelteKitConstantsSource = sourceFile(
  '../../node_modules/@sveltejs/kit/src/runtime/client/constants.js'
);

const settingsSource = sourceFile('./lib/state/settings.svelte.ts');
const registryKeys = new Set(Object.values(STORAGE_KEYS));

it('keeps the pre-hydration Back state key aligned with the web handler', () => {
  const match = webBackHandlerSource.match(/WEB_BACK_PAGE_STATE_KEY\s*=\s*['"]([^'"]+)['"]/u);
  expect(match, 'webBackHandler exports its page-state key').not.toBeNull();
  expect(bootScript).toContain(`pageState.${match![1]}`);
});

it("reads page state from SvelteKit's current history envelope", () => {
  const match = svelteKitConstantsSource.match(/STATES_KEY\s*=\s*['"]([^'"]+)['"]/u);
  expect(match, 'SvelteKit exports its history page-state key').not.toBeNull();
  expect(bootScript).toContain(`history.state['${match![1]}']`);
});

// BOOL_SETTINGS entries are `propName: [STORAGE_KEYS.someKey, default]`; re-key
// them by the key's string literal, which is the only handle the boot script has.
const boolDefaults: Map<string, boolean> = new Map(
  [...settingsSource.matchAll(/\[STORAGE_KEYS\.(\w+), (true|false)\]/g)].flatMap((m) => {
    const key = STORAGE_KEYS[m[1] as keyof typeof STORAGE_KEYS];
    return key ? [[key, m[2] === 'true'] as const] : [];
  })
);

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
    if (key === STORAGE_KEYS.lastNetworkOnline) continue;
    it(`${key} falls back to its BOOL_SETTINGS default`, () => {
      expect(boolDefaults.get(key)).toBe(fallback);
    });
  }

  it('defaults unknown connectivity to online', () => {
    expect(bootBoolDefaults).toContainEqual([STORAGE_KEYS.lastNetworkOnline, true]);
  });

  // The Tool Drawer switch hides its own tools without touching their flags, so
  // the boot script gates exactly TOOL_DRAWER_CONTROLS' keys behind it. One
  // gated key too few paints a tool the hydrated panel then hides; one too many
  // hides the camera or the coloring books the switch is meant to leave alone.
  it('gates exactly the drawer-owned controls behind the Tool Drawer switch', () => {
    const storageKeyByProp = new Map(
      [...settingsSource.matchAll(/(\w+): \[STORAGE_KEYS\.(\w+),/g)].map((m) => [
        m[1],
        STORAGE_KEYS[m[2] as keyof typeof STORAGE_KEYS],
      ])
    );
    expect(bootStringLiteral(/var drawer = on\('(splotch-[\w-]+)', true\)/)).toBe(
      STORAGE_KEYS.toolDrawer
    );

    const gatedKeys = [...bootScript.matchAll(/= drawer && on\('(splotch-[\w-]+)'/g)].map(
      (m) => m[1]
    );
    expect(new Set(gatedKeys)).toEqual(
      new Set(TOOL_DRAWER_CONTROLS.map((control) => storageKeyByProp.get(control)))
    );
  });

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

  it('seeds the single-brush and empty-panel presentation attributes', () => {
    expect(bootScript).toContain(`setAttribute('${SINGLE_BRUSH_ATTRIBUTE}'`);
    expect(bootScript).toContain(`toggleAttribute('${NO_ACTIONS_ATTRIBUTE}'`);
    expect(bootScript).toContain(`toggleAttribute('${AI_SLOT_ATTRIBUTE}'`);
  });

  it('paints an AI-only drawer disabled while its grant is checked', () => {
    localStorage.clear();
    document.documentElement.removeAttribute(NO_ACTIONS_ATTRIBUTE);
    for (const key of [
      STORAGE_KEYS.crayonEnabled,
      STORAGE_KEYS.magicBrushEnabled,
      STORAGE_KEYS.eraserEnabled,
      STORAGE_KEYS.strokeWidthControl,
      STORAGE_KEYS.coloringBookEnabled,
      STORAGE_KEYS.screenshotEnabled,
      STORAGE_KEYS.undoButtonEnabled,
    ]) {
      localStorage.setItem(key, 'false');
    }
    localStorage.setItem(STORAGE_KEYS.aiImageEnabled, 'true');

    runBootScript();

    expect(document.documentElement.hasAttribute(NO_ACTIONS_ATTRIBUTE)).toBe(false);
    expect(document.documentElement.hasAttribute(AI_SLOT_ATTRIBUTE)).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--action-btn-count')).toBe('1');
  });

  it.each([
    { cached: null, present: true, count: '6' },
    { cached: 'true', present: true, count: '6' },
    { cached: 'false', present: false, count: '' },
  ])(
    'seeds the AI button from its last known network state ($cached)',
    ({ cached, present, count }) => {
      localStorage.clear();
      document.documentElement.removeAttribute(AI_SLOT_ATTRIBUTE);
      document.documentElement.style.removeProperty('--action-btn-count');
      localStorage.setItem(STORAGE_KEYS.aiImageEnabled, 'true');
      if (cached !== null) localStorage.setItem(STORAGE_KEYS.lastNetworkOnline, cached);

      runBootScript();

      expect(document.documentElement.hasAttribute(AI_SLOT_ATTRIBUTE)).toBe(present);
      expect(document.documentElement.style.getPropertyValue('--action-btn-count')).toBe(count);
    }
  );

  it.each([
    { cached: null, shown: true, count: '"10"' },
    { cached: '7', shown: true, count: '"7"' },
    { cached: '0', shown: true, count: '"0"' },
    { cached: 'unavailable', shown: false, count: '' },
    { cached: 'invalid', shown: true, count: '"10"' },
  ])('seeds the free-count badge from $cached before hydration', ({ cached, shown, count }) => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-ai-free-count');
    document.documentElement.style.removeProperty('--ai-free-count');
    localStorage.setItem(STORAGE_KEYS.aiImageEnabled, 'true');
    if (cached !== null) localStorage.setItem(STORAGE_KEYS.freeGenerationBadgeHint, cached);

    runBootScript();

    expect(document.documentElement.hasAttribute('data-ai-free-count')).toBe(shown);
    expect(document.documentElement.style.getPropertyValue('--ai-free-count')).toBe(count);
  });

  it('uses the shared count limit and storage key for the boot badge', () => {
    expect(bootScript).toContain(`localStorage.getItem('${STORAGE_KEYS.freeGenerationBadgeHint}')`);
    expect(bootLiteral(/badgeRaw === null \? (\d+) : Number\(badgeRaw\)/)).toBe(
      FREE_GENERATION_LIMIT
    );
    expect(bootLiteral(/badgeCount > (\d+)/)).toBe(FREE_GENERATION_LIMIT);
  });

  it('omits the AI button before paint when the browser reports offline', () => {
    const onLineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
      localStorage.clear();
      document.documentElement.removeAttribute(AI_SLOT_ATTRIBUTE);
      document.documentElement.style.removeProperty('--action-btn-count');
      localStorage.setItem(STORAGE_KEYS.aiImageEnabled, 'true');
      localStorage.setItem(STORAGE_KEYS.lastNetworkOnline, 'true');

      runBootScript();

      expect(document.documentElement.hasAttribute(AI_SLOT_ATTRIBUTE)).toBe(false);
      expect(document.documentElement.style.getPropertyValue('--action-btn-count')).toBe('');
    } finally {
      if (onLineDescriptor) Object.defineProperty(navigator, 'onLine', onLineDescriptor);
      else Reflect.deleteProperty(navigator, 'onLine');
    }
  });

  it('counts and names every optional brush for the single-brush presentation', () => {
    const countExpression = bootStringLiteral(/var optionalBrushCount = ([^;]+);/);
    const countedBrushes = [...countExpression.matchAll(/\b(\w+)\b/g)].map((match) => match[1]);
    expect(countedBrushes).toEqual(OPTIONAL_BRUSH_TYPES);

    const singleBrushExpression = bootStringLiteral(
      /setAttribute\('data-single-brush', ([^;]+)\);/
    );
    const namedBrushes = [...singleBrushExpression.matchAll(/'(\w+)'/g)].map((match) => match[1]);
    expect(namedBrushes).toEqual(OPTIONAL_BRUSH_TYPES);
  });

  it('stamps data-theme for every resolved theme', () => {
    const bootThemes = [...bootScript.matchAll(/theme === '(\w+)'/g)].map((m) => m[1]);
    expect(new Set(bootThemes)).toEqual(new Set(RESOLVED_THEMES));
  });

  it('stamps data-orientation from the query layout.svelte.ts subscribes to', () => {
    expect(
      bootStringLiteral(/'data-orientation',\s*window\.matchMedia\('([^']*)'\)\.matches/)
    ).toBe(PORTRAIT_QUERY);
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

describe('toolbar before first paint', () => {
  it.each(['bare', 'buttons', 'invalid'])('validates the stored %s preference', (preference) => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-toolbar');
    localStorage.setItem(STORAGE_KEYS.toolbarStyle, preference);
    runBootScript();
    expect(document.documentElement.getAttribute('data-toolbar')).toBe(
      preference === 'bare' ? 'bare' : 'buttons'
    );
  });
});
