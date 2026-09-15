import { afterEach, describe, expect, it } from 'vitest';
import { booksForPlatform } from './books';
import {
  availableColoringBooks,
  coloringPacksState,
  markColoringBookInstalled,
  resetDownloadedColoringBooks,
  setInstalledColoringBooks,
  setNoDownloadedColoringBooks,
} from './coloringPacks.svelte';

afterEach(resetDownloadedColoringBooks);

describe('available coloring books', () => {
  it('starts with only the complete starter book', () => {
    expect(availableColoringBooks('web').map((book) => book.id)).toEqual(['farm']);
  });

  it('publishes each additional book only when its install completes', () => {
    setInstalledColoringBooks(['dinosaur']);
    expect(availableColoringBooks('web').map((book) => book.id)).toEqual(['farm', 'dinosaur']);
    markColoringBookInstalled('creatures');
    expect(availableColoringBooks('web').map((book) => book.id)).toEqual([
      'farm',
      'dinosaur',
      'creatures',
    ]);
  });
});

describe('a device with no pack storage', () => {
  it('settles on the starter book out of the whole catalog without a scan', () => {
    coloringPacksState.initialized = false;
    coloringPacksState.downloadedBytes = 5;

    setNoDownloadedColoringBooks('web');

    expect(availableColoringBooks('web').map((book) => book.id)).toEqual(['farm']);
    expect(coloringPacksState.totalBookCount).toBe(booksForPlatform('web').length);
    expect(coloringPacksState.downloadedBytes).toBe(0);
    expect(coloringPacksState.initialized).toBe(true);
  });
});
