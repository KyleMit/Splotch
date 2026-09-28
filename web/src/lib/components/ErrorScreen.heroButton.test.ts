// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { brand, scale, themes, toCssVarName } from '../design/tokens';

// The crash screen's "Start over" and the AI error card's "Try again" are the
// same kid-facing recovery button. The card renders the Button primitive's
// size="hero"; ErrorScreen cannot (the crash path renders without tokens), so
// it restates those values with fallbacks. This reads both style blocks back
// off disk, holds the copy to the primitive and each fallback to the token it
// stands in for, and requires every var() in the screen to carry a fallback.

const buttonSource = readFileSync(new URL('./design/Button.svelte', import.meta.url), 'utf8');
const errorScreenSource = readFileSync(new URL('./ErrorScreen.svelte', import.meta.url), 'utf8');

const SHARED_PROPERTIES = ['min-height', 'border-radius', 'font-size', 'font-weight'] as const;

const VAR_WITH_FALLBACK = /var\((--[a-z0-9-]+),\s*([^()]+)\)/g;
const VAR_WITHOUT_FALLBACK = /var\(\s*--[a-z0-9-]+\s*\)/g;

function styleCss(source: string): string {
  const style = source.match(/<style>([\s\S]*)<\/style>/)?.[1] ?? '';
  return style.replace(/\/\*[\s\S]*?\*\//g, '');
}

function ruleBody(source: string, selector: string): string {
  const css = styleCss(source);
  const escaped = selector.replace(/\./g, '\\.');
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `expected a \`${selector}\` rule`).not.toBeNull();
  return match![1];
}

function declaration(body: string, property: string): string {
  const match = body.match(new RegExp(`(?:^|[\\s;])${property}\\s*:\\s*([^;]+);`));
  expect(match, `expected a \`${property}\` declaration`).not.toBeNull();
  return match![1].replace(/\s+/g, ' ').trim();
}

function withoutFallbacks(value: string): string {
  return value.replace(VAR_WITH_FALLBACK, 'var($1)');
}

const hero = ruleBody(buttonSource, '.hero');
const brandHero = ruleBody(buttonSource, '.brand.hero');
const restart = ruleBody(errorScreenSource, '.error-restart');

describe('ErrorScreen restates the hero Button', () => {
  it.each(SHARED_PROPERTIES)('%s', (property) => {
    expect(withoutFallbacks(declaration(restart, property))).toBe(declaration(hero, property));
  });

  it('box-shadow matches the brand hero glow', () => {
    expect(withoutFallbacks(declaration(restart, 'box-shadow'))).toBe(
      declaration(brandHero, 'box-shadow')
    );
  });
});

describe('ErrorScreen fallbacks', () => {
  const tokenValues = new Map<string, string>(
    [...Object.entries(brand), ...Object.entries(scale), ...Object.entries(themes.light)].map(
      ([key, value]) => [toCssVarName(key), value]
    )
  );
  const fallbacks = [...restart.matchAll(VAR_WITH_FALLBACK)].map(([, name, fallback]) => ({
    name,
    fallback: fallback.trim(),
  }));

  it('restates at least one token', () => {
    expect(fallbacks.length).toBeGreaterThan(0);
  });

  // The whole screen renders without tokens.css, so a var() with no fallback
  // is an invalid declaration there, not merely an unguarded one.
  it('gives every var() in the style block a fallback', () => {
    expect(styleCss(errorScreenSource).match(VAR_WITHOUT_FALLBACK) ?? []).toEqual([]);
  });

  it.each(fallbacks)('$name falls back to its light token value', ({ name, fallback }) => {
    expect(fallback).toBe(tokenValues.get(name));
  });
});
