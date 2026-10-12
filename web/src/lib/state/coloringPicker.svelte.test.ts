import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import {
  markColoringBookInstalled,
  resetDownloadedColoringBooks,
  setInstalledColoringBooks,
} from './coloringPacks.svelte';
import { createColoringPickerBooks } from './coloringPicker.svelte';

let stop: (() => void) | undefined;

async function harness() {
  let pickerBooks!: ReturnType<typeof createColoringPickerBooks>;
  stop = $effect.root(() => {
    pickerBooks = createColoringPickerBooks('web');
  });
  await tick();
  return pickerBooks;
}

const ids = (books: readonly { id: string }[]) => books.map((book) => book.id);

beforeEach(resetDownloadedColoringBooks);

afterEach(() => {
  stop?.();
  stop = undefined;
});

describe('an open while only the starter book is known', () => {
  it('refuses writes through both book-list getters', async () => {
    const pickerBooks = await harness();
    pickerBooks.holdForOpen();

    expect(() => {
      Object.assign(pickerBooks.installed, { 0: undefined });
    }).toThrow(TypeError);
    expect(() => {
      Object.assign(pickerBooks.shown, { 0: undefined });
    }).toThrow(TypeError);
    expect(ids(pickerBooks.installed)).toEqual(['farm']);
    expect(ids(pickerBooks.shown)).toEqual(['farm']);
  });

  it('drills into it and keeps books the scan publishes mid-open for the next open', async () => {
    const pickerBooks = await harness();

    pickerBooks.holdForOpen();
    expect(pickerBooks.listsBooks).toBe(false);
    expect(ids(pickerBooks.shown)).toEqual(['farm']);

    setInstalledColoringBooks(['dinosaur', 'creatures']);
    await tick();
    expect(pickerBooks.listsBooks).toBe(false);
    expect(ids(pickerBooks.shown)).toEqual(['farm']);
    expect(ids(pickerBooks.installed)).toEqual(['farm', 'dinosaur', 'creatures']);

    pickerBooks.holdForOpen();
    expect(pickerBooks.listsBooks).toBe(true);
    expect(ids(pickerBooks.shown)).toEqual(['farm', 'dinosaur', 'creatures']);
  });

  it('keeps a download that lands mid-open for the next open', async () => {
    setInstalledColoringBooks([]);
    const pickerBooks = await harness();

    pickerBooks.holdForOpen();
    markColoringBookInstalled('dinosaur', 1);
    await tick();

    expect(pickerBooks.listsBooks).toBe(false);
    expect(ids(pickerBooks.shown)).toEqual(['farm']);
  });
});

describe('an open that lists books', () => {
  it('holds the list while more books land', async () => {
    setInstalledColoringBooks(['dinosaur']);
    const pickerBooks = await harness();

    pickerBooks.holdForOpen();
    markColoringBookInstalled('creatures', 1);
    await tick();

    expect(pickerBooks.listsBooks).toBe(true);
    expect(ids(pickerBooks.shown)).toEqual(['farm', 'dinosaur']);
  });
});
