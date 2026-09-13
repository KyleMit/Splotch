import { STARTER_COLORING_BOOK_ID, booksForPlatform, type Book, type BookPlatform } from './books';

interface ColoringPackState {
  installedBookIds: string[];
  downloadingBookId: string | null;
  downloadedBytes: number;
  totalBookCount: number;
  initialized: boolean;
  // True once this boot's installed-book list changes only when a download
  // finishes or the books are removed: a scan published it, there was no pack
  // storage to scan, or the run that would have scanned ended without one. The
  // coloring picker reads it to decide whether an open that beat the scan
  // takes the scan's answer when it lands.
  scanSettled: boolean;
}

export const coloringPackState: ColoringPackState = $state({
  installedBookIds: [STARTER_COLORING_BOOK_ID],
  downloadingBookId: null,
  downloadedBytes: 0,
  totalBookCount: 1,
  initialized: false,
  scanSettled: false,
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
  coloringPackState.scanSettled = true;
}

// What a scan would publish for a device with no pack storage at all, known
// without the manifest: the starter book alone, out of the platform's catalog.
export function setNoDownloadedColoringBooks(platform: BookPlatform) {
  setInstalledColoringBooks([]);
  coloringPackState.totalBookCount = booksForPlatform(platform).length;
  coloringPackState.downloadedBytes = 0;
}

export function settleColoringPackScan() {
  coloringPackState.scanSettled = true;
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
