import { STARTER_COLORING_BOOK_ID, booksForPlatform, type Book, type BookPlatform } from './books';

interface ColoringPackState {
  installedBookIds: string[];
  downloadingBookId: string | null;
  downloadedBytes: number;
  totalBookCount: number;
  initialized: boolean;
}

export const coloringPacksState: ColoringPackState = $state({
  installedBookIds: [STARTER_COLORING_BOOK_ID],
  downloadingBookId: null,
  downloadedBytes: 0,
  totalBookCount: 1,
  initialized: false,
});

export function availableColoringBooks(platform: BookPlatform): Book[] {
  return booksForPlatform(platform).filter((book) =>
    coloringPacksState.installedBookIds.includes(book.id)
  );
}

export function setInstalledColoringBooks(bookIds: string[]) {
  coloringPacksState.installedBookIds = [
    STARTER_COLORING_BOOK_ID,
    ...bookIds.filter((id) => id !== STARTER_COLORING_BOOK_ID),
  ];
  coloringPacksState.initialized = true;
}

// What a scan would publish for a device with no pack storage at all, known
// without the manifest: the starter book alone, out of the platform's catalog.
export function setNoDownloadedColoringBooks(platform: BookPlatform) {
  setInstalledColoringBooks([]);
  coloringPacksState.totalBookCount = booksForPlatform(platform).length;
  coloringPacksState.downloadedBytes = 0;
}

export function markColoringBookInstalled(bookId: string) {
  if (!coloringPacksState.installedBookIds.includes(bookId)) {
    coloringPacksState.installedBookIds = [...coloringPacksState.installedBookIds, bookId];
  }
}

export function resetDownloadedColoringBooks() {
  coloringPacksState.installedBookIds = [STARTER_COLORING_BOOK_ID];
  coloringPacksState.downloadedBytes = 0;
  coloringPacksState.downloadingBookId = null;
}
