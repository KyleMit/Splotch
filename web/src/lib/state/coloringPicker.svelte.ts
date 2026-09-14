import { availableColoringBooks } from './coloringPacks.svelte';
import { type Book, type BookPlatform } from './books';

export interface ColoringPickerBooks {
  // Every installed book, live: what the next open will show.
  readonly installed: Book[];
  // The books this open shows.
  readonly shown: Book[];
  // Whether this open has a book list to go back to, rather than one book.
  readonly listsBooks: boolean;
  holdForOpen(): void;
}

// An open picker never changes what it shows under a finger. It shows the books
// known when it opens, and drills straight into the pages when that is one book
// — the starter book, on a fresh install or before the installed-book scan has
// landed. Books that become known while it is open, by download or by that
// scan, wait for the next open: a book joins in catalog order, so a cover
// landing mid-grid would shift every cover after it, and a second book would
// add a Back button that pushes the title aside.
export function createColoringPickerBooks(platform: BookPlatform): ColoringPickerBooks {
  const installed = $derived(availableColoringBooks(platform));
  let shownBookIds = $state<string[]>([]);
  const shown = $derived(installed.filter((book) => shownBookIds.includes(book.id)));
  const listsBooks = $derived(shownBookIds.length >= 2);

  return {
    get installed() {
      return installed;
    },
    get shown() {
      return shown;
    },
    get listsBooks() {
      return listsBooks;
    },
    holdForOpen() {
      shownBookIds = installed.map((book) => book.id);
    },
  };
}
