// No `@vitest-environment node` docblock despite this being pure text parsing:
// importing settings.svelte.ts for the clamp constants runs that module's
// load-time localStorage reads, so the file has to stay on the happy-dom
// default (.claude/rules/testing.md).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRAWING_ROUTE } from './lib/boot/appSurfaceRoute';
import {
  ACTION_BUTTON_SCALE_DEFAULT,
  ACTION_BUTTON_SCALE_MAX,
  ACTION_BUTTON_SCALE_MIN,
} from './lib/state/settings.svelte';

// app.html's pre-hydration boot IIFE is vanilla JS in a template file, so it
// can't import anything — it re-types every localStorage key, every boolean
// default, and the scale clamp as literals, with only a "keep them in sync"
// comment guarding them. This is that guard, made mechanical: rename a key or
// flip a default and the stamp silently seeds the wrong first-paint attribute,
// with no type error and no failing test.
//
// The clamp bounds are imported because settings.svelte.ts exports them; the
// keys and boolean defaults are parsed as text because the `*_KEY` constants
// and BOOL_SETTINGS itself are module-private, so there is nothing importable
// to compare against.

const bootScript = (() => {
  const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  expect(match, 'app.html has an inline boot <script>').not.toBeNull();
  return match![1];
})();

function keyConstants(source: string): Map<string, string> {
  return new Map(
    [...source.matchAll(/\b(\w+_KEY) = '(splotch-[\w-]+)'/g)].map((m) => [m[1], m[2]])
  );
}

const settingsSource = readFileSync(
  new URL('./lib/state/settings.svelte.ts', import.meta.url),
  'utf8'
);
const settingsKeys = keyConstants(settingsSource);

const sourceOfTruthKeys = new Set([
  ...settingsKeys.values(),
  ...keyConstants(
    readFileSync(new URL('./lib/state/tool.svelte.ts', import.meta.url), 'utf8')
  ).values(),
]);

// BOOL_SETTINGS entries are `propName: [SOME_KEY, default]`; re-key them by the
// key's string literal, which is the only handle the boot script has.
const boolDefaults = new Map(
  [...settingsSource.matchAll(/\[(\w+_KEY), (true|false)\]/g)].flatMap((m) => {
    const key = settingsKeys.get(m[1]);
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

describe("app.html's boot script mirrors the state modules", () => {
  const bootKeys = [...new Set([...bootScript.matchAll(/'(splotch-[\w-]+)'/g)].map((m) => m[1]))];
  // `\s*` between the tokens so a prettier reflow of a long `on(...)` call
  // across lines still parses — several sit close to the 100-char printWidth.
  const bootBoolDefaults = [
    ...bootScript.matchAll(/\bon\(\s*'(splotch-[\w-]+)',\s*(true|false)\s*\)/g),
  ].map((m) => [m[1], m[2] === 'true'] as const);

  it('parses keys and boolean defaults out of both sides', () => {
    expect(bootKeys.length).toBeGreaterThan(0);
    expect(sourceOfTruthKeys.size).toBeGreaterThan(0);
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
    it(`${key} is defined by a state module`, () => {
      expect([...sourceOfTruthKeys]).toContain(key);
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
