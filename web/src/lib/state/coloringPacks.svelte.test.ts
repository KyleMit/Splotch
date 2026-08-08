import { afterEach, describe, expect, it } from 'vitest';
import {
  availableColoringBooks,
  markColoringBookInstalled,
  resetDownloadedColoringBooks,
  setInstalledColoringBooks,
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
