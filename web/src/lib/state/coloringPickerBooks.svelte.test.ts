import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import { booksForPlatform } from './books';
import {
  coloringPackState,
  markColoringBookInstalled,
  resetDownloadedColoringBooks,
  setInstalledColoringBooks,
} from './coloringPacks.svelte';
import { createColoringPickerBooks } from './coloringPickerBooks.svelte';

const CATALOG_BOOK_COUNT = booksForPlatform('web').length;

let stop: (() => void) | undefined;

async function harness() {
  let pickerBooks!: ReturnType<typeof createColoringPickerBooks>;
  stop = $effect.root(() => {
    pickerBooks = createColoringPickerBooks('web');
  });
  await tick();
  return pickerBooks;
}

const ids = (books: { id: string }[]) => books.map((book) => book.id);

beforeEach(() => {
  resetDownloadedColoringBooks();
  coloringPackState.scanSettled = false;
  coloringPackState.initialized = false;
});

afterEach(() => {
  stop?.();
  stop = undefined;
});

describe('an open after the installed-book scan', () => {
  it('drills into the only book and keeps a download that lands mid-open for the next open', async () => {
    setInstalledColoringBooks([]);
    const pickerBooks = await harness();

    pickerBooks.holdForOpen();
    expect(pickerBooks.listsBooks).toBe(false);
    expect(ids(pickerBooks.shown)).toEqual(['farm']);

    markColoringBookInstalled('dinosaur');
    await tick();
    expect(ids(pickerBooks.shown)).toEqual(['farm']);
    expect(pickerBooks.listsBooks).toBe(false);
    expect(ids(pickerBooks.installed)).toEqual(['farm', 'dinosaur']);

    pickerBooks.holdForOpen();
    expect(pickerBooks.listsBooks).toBe(true);
    expect(ids(pickerBooks.shown)).toEqual(['farm', 'dinosaur']);
    expect(pickerBooks.reservedSlotCount).toBe(0);
  });

  it('holds the book list and its slot count while more books land', async () => {
    setInstalledColoringBooks(['dinosaur']);
    const pickerBooks = await harness();

    pickerBooks.holdForOpen();
    markColoringBookInstalled('creatures');
    await tick();

    expect(ids(pickerBooks.shown)).toEqual(['farm', 'dinosaur']);
    expect(pickerBooks.slotCount).toBe(2);
  });
});

describe('an open that beats the installed-book scan', () => {
  it('lists the books with a place for every catalog book and takes the scan once', async () => {
    const pickerBooks = await harness();

    pickerBooks.holdForOpen();
    expect(pickerBooks.listsBooks).toBe(true);
    expect(ids(pickerBooks.shown)).toEqual(['farm']);
    expect(pickerBooks.slotCount).toBe(CATALOG_BOOK_COUNT);
    expect(pickerBooks.reservedSlotCount).toBe(CATALOG_BOOK_COUNT - 1);

    setInstalledColoringBooks(['creatures', 'dinosaur']);
    await tick();
    expect(ids(pickerBooks.shown)).toEqual(['farm', 'dinosaur', 'creatures']);
    expect(pickerBooks.slotCount).toBe(CATALOG_BOOK_COUNT);
    expect(pickerBooks.reservedSlotCount).toBe(CATALOG_BOOK_COUNT - 3);

    markColoringBookInstalled('nature');
    await tick();
    expect(ids(pickerBooks.shown)).toEqual(['farm', 'dinosaur', 'creatures']);
  });

  it('keeps the book list when the settled answer is only the starter book', async () => {
    const pickerBooks = await harness();

    pickerBooks.holdForOpen();
    coloringPackState.scanSettled = true;
    await tick();

    expect(pickerBooks.listsBooks).toBe(true);
    expect(ids(pickerBooks.shown)).toEqual(['farm']);
    expect(pickerBooks.slotCount).toBe(CATALOG_BOOK_COUNT);
  });
});
