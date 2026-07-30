// @vitest-environment node
import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STYLE_NAMES, styleThumbPath } from './styles';

const staticDirectory = new URL('../../../static/', import.meta.url);
const stylesDirectory = new URL('styles/', staticDirectory);

describe('style thumbnails', () => {
  it.each(STYLE_NAMES)('%s has a thumbnail at its generated URL', (style) => {
    expect(existsSync(new URL(`.${styleThumbPath(style)}`, staticDirectory))).toBe(true);
  });

  it('contains exactly one thumbnail for every style', () => {
    const thumbnailBasenames = readdirSync(stylesDirectory)
      .filter((filename) => filename.endsWith('.webp'))
      .map((filename) => filename.slice(0, -'.webp'.length))
      .sort();

    expect(thumbnailBasenames).toEqual(STYLE_NAMES.map((style) => style.toLowerCase()).sort());
  });
});
