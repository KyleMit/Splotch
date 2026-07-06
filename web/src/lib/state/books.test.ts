import { describe, expect, it } from 'vitest';
import { BOOKS, bookAssetPaths, pageImage, thumbPath } from './books';

describe('thumbPath', () => {
  it('inserts -thumb before the .webp extension', () => {
    expect(thumbPath('/coloring/farm/cover.webp')).toBe('/coloring/farm/cover-thumb.webp');
    expect(thumbPath('/coloring/farm/cat-tall.webp')).toBe('/coloring/farm/cat-tall-thumb.webp');
  });
});

describe('bookAssetPaths', () => {
  const farm = BOOKS.find((book) => book.id === 'farm')!;

  it('lists the full-res cover and both orientations of every page', () => {
    const paths = bookAssetPaths(farm);
    expect(paths).toContain(farm.cover);
    for (const page of farm.pages) {
      expect(paths).toContain(pageImage(page, 'portrait'));
      expect(paths).toContain(pageImage(page, 'landscape'));
    }
  });

  it('pairs every full-res asset with its thumbnail twin', () => {
    const paths = bookAssetPaths(farm);
    const fullRes = paths.filter((p) => !p.endsWith('-thumb.webp'));
    expect(fullRes.length).toBeGreaterThan(0);
    for (const src of fullRes) {
      expect(paths).toContain(thumbPath(src));
    }
    // full-res + thumbs, nothing else
    expect(paths.length).toBe(fullRes.length * 2);
  });
});
