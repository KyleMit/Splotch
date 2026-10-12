// @vitest-environment node
import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DARK_STYLE_SUFFIXES, STYLE_NAMES, styleSuffixesFor, styleThumbPath } from './styles';
import { PAPER_COLORS } from '../theme';

const staticDirectory = new URL('../../../static/', import.meta.url);
const stylesDirectory = new URL('styles/', staticDirectory);

// Every theme the app resolves to needs its own forked cover set; deriving the
// list from PAPER_COLORS means adding a theme fails here rather than silently
// shipping one theme's art to both.
const THEMES = Object.keys(PAPER_COLORS) as (keyof typeof PAPER_COLORS)[];

describe('style thumbnails', () => {
  it.each(THEMES.flatMap((theme) => STYLE_NAMES.map((style) => [style, theme] as const)))(
    '%s has a %s thumbnail at its generated URL',
    (style, theme) => {
      expect(existsSync(new URL(`.${styleThumbPath(style, theme)}`, staticDirectory))).toBe(true);
    }
  );

  it('contains exactly one thumbnail per style per theme', () => {
    const thumbnailBasenames = readdirSync(stylesDirectory)
      .filter((filename) => filename.endsWith('.webp'))
      .map((filename) => filename.slice(0, -'.webp'.length))
      .sort();

    expect(thumbnailBasenames).toEqual(
      THEMES.flatMap((theme) =>
        STYLE_NAMES.map((style) => `${style.toLowerCase()}.${theme}`)
      ).sort()
    );
  });
});

describe('styleSuffixesFor', () => {
  it.each(THEMES)('gives every style a suffix in %s', (theme) => {
    const suffixes = styleSuffixesFor(theme);

    for (const style of STYLE_NAMES) expect(suffixes[style]).toBeTruthy();
  });

  it('overrides exactly the styles with a dark-specific medium', () => {
    const light = styleSuffixesFor('light');
    const dark = styleSuffixesFor('dark');

    const changed = STYLE_NAMES.filter((style) => dark[style] !== light[style]);

    expect(changed.sort()).toEqual(Object.keys(DARK_STYLE_SUFFIXES).sort());
  });

  it('does not mutate the light set when building the dark one', () => {
    const before = { ...styleSuffixesFor('light') };

    styleSuffixesFor('dark');

    expect(styleSuffixesFor('light')).toEqual(before);
  });
});
