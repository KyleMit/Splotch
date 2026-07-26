// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACTION_BUTTON_SCALE_DEFAULT,
  ACTION_BUTTON_SCALE_MAX,
  ACTION_BUTTON_SCALE_MIN,
} from './lib/state/settings.svelte';

// app.html's pre-hydration boot IIFE is vanilla JS in a template file, so it
// can't import anything — it re-types every localStorage key and the scale
// clamp as literals, with only a "keep them in sync" comment guarding them.
// This is that guard, made mechanical: rename a key or move the clamp and the
// stamp silently seeds the wrong first-paint attribute, with no type error.
//
// The clamp bounds are imported because settings.svelte.ts exports them; the
// keys are parsed as text because their `*_KEY` constants are module-private
// (as is BOOL_SETTINGS), so there is nothing importable to compare against.

const bootScript = (() => {
  const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  expect(match, 'app.html has an inline boot <script>').not.toBeNull();
  return match![1];
})();

function storageKeys(source: string): string[] {
  return [...source.matchAll(/\b\w+_KEY = '(splotch-[\w-]+)'/g)].map((m) => m[1]);
}

const sourceOfTruthKeys = new Set([
  ...storageKeys(readFileSync(new URL('./lib/state/settings.svelte.ts', import.meta.url), 'utf8')),
  ...storageKeys(readFileSync(new URL('./lib/state/tool.svelte.ts', import.meta.url), 'utf8')),
]);

function bootLiteral(pattern: RegExp): number {
  const match = bootScript.match(pattern);
  expect(match, `app.html's boot script matches ${pattern}`).not.toBeNull();
  return Number(match![1]);
}

describe("app.html's boot script mirrors the state modules", () => {
  const bootKeys = [...new Set([...bootScript.matchAll(/'(splotch-[\w-]+)'/g)].map((m) => m[1]))];

  it('reads at least one splotch-* key (the parse still finds them)', () => {
    expect(bootKeys.length).toBeGreaterThan(0);
    expect(sourceOfTruthKeys.size).toBeGreaterThan(0);
  });

  // Containment, not equality: plenty of persisted keys have no first-paint
  // attribute (splotch-sound-enabled, for one), so the boot script is expected
  // to read a subset.
  for (const key of bootKeys) {
    it(`${key} is defined by a state module`, () => {
      expect([...sourceOfTruthKeys]).toContain(key);
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
});
