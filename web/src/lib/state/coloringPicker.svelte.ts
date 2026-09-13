import { untrack } from 'svelte';
import { booksForPlatform, type Book, type BookPlatform } from './books';
import { availableColoringBooks } from './coloringPacks.svelte';
import { coloringScan, installedBookScanPending } from './coloringScan.svelte';

export interface ColoringPickerBooks {
  // Every installed book, live: what the next open will show.
  readonly installed: Book[];
  // The books this open shows.
  readonly shown: Book[];
  // Grid places this open lays out, one per shown book plus any it reserved.
  readonly slotCount: number;
  readonly reservedSlotCount: number;
  // Whether this open has a book list to go back to, rather than one book.
  readonly listsBooks: boolean;
  holdForOpen(): void;
}

// An open picker never changes what it shows under a finger. Books that finish
// downloading while it is open wait for the next open: a book joins in catalog
// order, so a cover landing mid-grid would shift every cover after it, and the
// first extra book would add a Back button that pushes the title aside. The one
// answer an open still takes is the installed-book scan it beat on a device
// known to hold pack storage — a returning child's books, not a download — and
// that lands without moving anything: the open shows the book list with a place
// reserved for every catalog book, and the scan's covers fill the places after
// the starter book, which comes first in the catalog. An open that beats the
// storage check itself is treated as a first visit, since guessing a returning
// one would leave a real first visit with a grid of empty places.
export function createColoringPickerBooks(platform: BookPlatform): ColoringPickerBooks {
  const catalogBookCount = booksForPlatform(platform).length;
  const installed = $derived(availableColoringBooks(platform));
  let shownBookIds = $state<string[]>([]);
  let takesInstalledScan = $state(false);
  let slotCount = $state(0);
  let listsBooks = $state(false);
  const shown = $derived(installed.filter((book) => shownBookIds.includes(book.id)));

  $effect.pre(() => {
    if (!takesInstalledScan || !coloringScan.settled) return;
    takesInstalledScan = false;
    shownBookIds = untrack(() => installed.map((book) => book.id));
  });

  return {
    get installed() {
      return installed;
    },
    get shown() {
      return shown;
    },
    get slotCount() {
      return slotCount;
    },
    get reservedSlotCount() {
      return Math.max(0, slotCount - shown.length);
    },
    get listsBooks() {
      return listsBooks;
    },
    holdForOpen() {
      takesInstalledScan = installedBookScanPending();
      shownBookIds = installed.map((book) => book.id);
      slotCount = takesInstalledScan ? catalogBookCount : installed.length;
      listsBooks = takesInstalledScan || installed.length >= 2;
    },
  };
}
