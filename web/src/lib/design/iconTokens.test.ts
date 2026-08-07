// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { iconTokenEntries, toIconCssVarName } from './iconTokens';
import { themes, toCssVarName } from './tokens';

describe('toIconCssVarName', () => {
  it('composes both kebab and camel segments', () => {
    expect(toIconCssVarName('appearance', 'night')).toBe('--icon-appearance-night');
    expect(toIconCssVarName('whats-new', 'window')).toBe('--icon-whats-new-window');
    expect(toIconCssVarName('sound', 'coneHighlight')).toBe('--icon-sound-cone-highlight');
  });
});

describe('the --icon- namespace', () => {
  it('emits a well-formed custom property for every part', () => {
    for (const { cssVar } of iconTokenEntries()) {
      expect(cssVar).toMatch(/^--icon-[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  // --icon-ink and --icon-muted are semantic ThemeTokens that already live in
  // this prefix, so the mechanical naming scheme has to be checked against them
  // rather than assumed clear of them.
  it('never collides with a semantic token', () => {
    const semantic = new Set(Object.keys(themes.light).map(toCssVarName));
    for (const { cssVar } of iconTokenEntries()) {
      expect(semantic.has(cssVar), `${cssVar} shadows a ThemeTokens entry`).toBe(false);
    }
  });

  it('gives every part a distinct name', () => {
    const names = iconTokenEntries().map(({ cssVar }) => cssVar);
    expect(new Set(names).size).toBe(names.length);
  });

  it('themes every part — a part whose two values match is a plain fill', () => {
    const unthemed = iconTokenEntries().filter(({ light, dark }) => light === dark);
    expect(unthemed).toEqual([]);
  });
});
