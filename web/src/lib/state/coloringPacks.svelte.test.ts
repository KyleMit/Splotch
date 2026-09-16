import { beforeEach, describe, expect, it } from 'vitest';
import { booksForPlatform } from './books';
import { createColoringPacks, type ColoringPacksState } from './coloringPacks.svelte';

let packs: ColoringPacksState;

beforeEach(() => {
  packs = createColoringPacks();
});

describe('available coloring books', () => {
  it('refuses writes through the installed-book getter', () => {
    expect(() => {
      Object.assign(packs.installedBookIds, { 0: 'dinosaur' });
    }).toThrow(TypeError);
    expect(packs.installedBookIds).toEqual(['farm']);
  });

  it('starts with only the complete starter book', () => {
    expect(packs.availableColoringBooks('web').map((book) => book.id)).toEqual(['farm']);
  });

  it('publishes each additional book only when its install completes', () => {
    packs.setInstalledColoringBooks(['dinosaur']);
    expect(packs.availableColoringBooks('web').map((book) => book.id)).toEqual([
      'farm',
      'dinosaur',
    ]);
    packs.markColoringBookInstalled('creatures', 1);
    expect(packs.availableColoringBooks('web').map((book) => book.id)).toEqual([
      'farm',
      'dinosaur',
      'creatures',
    ]);
  });

  it('counts an installed book once and adds its bytes to the downloaded total', () => {
    packs.markColoringBookInstalled('dinosaur', 3);
    packs.markColoringBookInstalled('dinosaur', 3);

    expect(packs.installedBookIds).toEqual(['farm', 'dinosaur']);
    expect(packs.downloadedBytes).toBe(6);
  });

  it('publishes the book in flight only for the length of its download', () => {
    packs.startBookDownload('dinosaur');
    expect(packs.downloadingBookId).toBe('dinosaur');

    packs.endBookDownload();
    expect(packs.downloadingBookId).toBeNull();
  });
});

describe('a device with no pack storage', () => {
  it('settles on the starter book out of the whole catalog without a scan', () => {
    packs.markColoringBookInstalled('dinosaur', 5);

    packs.setNoDownloadedColoringBooks('web');

    expect(packs.availableColoringBooks('web').map((book) => book.id)).toEqual(['farm']);
    expect(packs.totalBookCount).toBe(booksForPlatform('web').length);
    expect(packs.downloadedBytes).toBe(0);
    expect(packs.initialized).toBe(true);
  });
});
