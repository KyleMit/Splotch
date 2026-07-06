import { describe, expect, it } from 'vitest';
import { BOOKS, bookAssetPaths, pageColorImage, pageImage, thumbPath } from './books';

describe('thumbPath', () => {
  it('inserts -thumb before the .webp extension', () => {
    expect(thumbPath('/coloring/farm/cover.webp')).toBe('/coloring/farm/cover-thumb.webp');
    expect(thumbPath('/coloring/farm/cat-tall.webp')).toBe('/coloring/farm/cat-tall-thumb.webp');
  });
});

describe('bookAssetPaths', () => {
  const farm = BOOKS.find((book) => book.id === 'farm')!;

  it('lists the cover, both orientations of every page, and the colored twins', () => {
    const paths = bookAssetPaths(farm);
    expect(paths).toContain(farm.cover);
    for (const page of farm.pages) {
      expect(paths).toContain(pageImage(page, 'portrait'));
      expect(paths).toContain(pageImage(page, 'landscape'));
      expect(paths).toContain(pageColorImage(page, 'portrait'));
      expect(paths).toContain(pageColorImage(page, 'landscape'));
    }
  });

  it('gives every picker-facing line-art image a thumbnail twin', () => {
    const paths = bookAssetPaths(farm);
    const lineArt = [
      farm.cover,
      ...farm.pages.flatMap((page) => [pageImage(page, 'portrait'), pageImage(page, 'landscape')]),
    ];
    for (const src of lineArt) {
      expect(paths).toContain(thumbPath(src));
    }
  });

  it('does not thumbnail the colored twins (they never appear in the grid)', () => {
    const paths = bookAssetPaths(farm);
    for (const page of farm.pages) {
      expect(paths).not.toContain(thumbPath(pageColorImage(page, 'portrait')));
      expect(paths).not.toContain(thumbPath(pageColorImage(page, 'landscape')));
    }
    // Exactly the line-art images (cover + 2 orientations/page) get a -thumb.
    const thumbs = paths.filter((p) => p.endsWith('-thumb.webp'));
    expect(thumbs.length).toBe(1 + farm.pages.length * 2);
  });
});
