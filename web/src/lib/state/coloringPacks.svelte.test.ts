import { beforeEach, describe, expect, it } from 'vitest';
import { STARTER_COLORING_BOOK_ID, booksForPlatform } from './books';
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
    expect(packs.downloadedBookCount).toBe(0);
    expect(packs.downloadableBookCount).toBe(booksForPlatform('web').length - 1);
    expect(packs.downloadedBytes).toBe(0);
    expect(packs.initialized).toBe(true);
  });
});

describe('extra coloring book counts', () => {
  it.each(['web', 'mobile'] as const)(
    'has the starter book in the %s catalog it subtracts from',
    (platform) => {
      expect(booksForPlatform(platform).map((book) => book.id)).toContain(STARTER_COLORING_BOOK_ID);
    }
  );

  it('counts neither extra book before a scan reports the catalog', () => {
    expect(packs.downloadedBookCount).toBe(0);
    expect(packs.downloadableBookCount).toBe(0);
  });

  it('leaves the starter book out of both counts', () => {
    packs.setInstalledColoringBooks([STARTER_COLORING_BOOK_ID, 'dinosaur', 'space']);
    packs.recordInstalledPacks(8, 10);

    expect(packs.downloadedBookCount).toBe(2);
    expect(packs.downloadableBookCount).toBe(7);
  });

  it('follows installs and removal', () => {
    packs.recordInstalledPacks(8, 0);
    packs.markColoringBookInstalled('dinosaur', 1);
    packs.markColoringBookInstalled('dinosaur', 1);
    expect(packs.downloadedBookCount).toBe(1);

    packs.resetDownloadedColoringBooks();
    expect(packs.downloadedBookCount).toBe(0);
    expect(packs.downloadableBookCount).toBe(7);
  });
});
