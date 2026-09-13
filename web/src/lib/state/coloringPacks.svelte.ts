import { STARTER_COLORING_BOOK_ID, booksForPlatform, type Book, type BookPlatform } from './books';
import { settleColoringScan } from './coloringScan.svelte';

interface ColoringPackState {
  installedBookIds: string[];
  downloadingBookId: string | null;
  downloadedBytes: number;
  totalBookCount: number;
  initialized: boolean;
}

export const coloringPackState: ColoringPackState = $state({
  installedBookIds: [STARTER_COLORING_BOOK_ID],
  downloadingBookId: null,
  downloadedBytes: 0,
  totalBookCount: 1,
  initialized: false,
});

export function availableColoringBooks(platform: BookPlatform): Book[] {
  return booksForPlatform(platform).filter((book) =>
    coloringPackState.installedBookIds.includes(book.id)
  );
}

export function setInstalledColoringBooks(bookIds: string[]) {
  coloringPackState.installedBookIds = [
    STARTER_COLORING_BOOK_ID,
    ...bookIds.filter((id) => id !== STARTER_COLORING_BOOK_ID),
  ];
  coloringPackState.initialized = true;
  settleColoringScan();
}

// What a scan would publish for a device with no pack storage at all, known
// without the manifest: the starter book alone, out of the platform's catalog.
export function setNoDownloadedColoringBooks(platform: BookPlatform) {
  setInstalledColoringBooks([]);
  coloringPackState.totalBookCount = booksForPlatform(platform).length;
  coloringPackState.downloadedBytes = 0;
}

export function markColoringBookInstalled(bookId: string) {
  if (!coloringPackState.installedBookIds.includes(bookId)) {
    coloringPackState.installedBookIds = [...coloringPackState.installedBookIds, bookId];
  }
}

export function resetDownloadedColoringBooks() {
  coloringPackState.installedBookIds = [STARTER_COLORING_BOOK_ID];
  coloringPackState.downloadedBytes = 0;
  coloringPackState.downloadingBookId = null;
}
