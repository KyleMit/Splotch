import { STARTER_COLORING_BOOK_ID, booksForPlatform, type Book, type BookPlatform } from './books';
import { readonlyValue } from './readonlyView';

export interface ColoringPacksState {
  readonly installedBookIds: readonly string[];
  readonly downloadingBookId: string | null;
  readonly downloadedBytes: number;
  // The starter book ships with the app, so neither count includes it.
  readonly downloadedBookCount: number;
  readonly downloadableBookCount: number;
  readonly initialized: boolean;
  availableColoringBooks(platform: BookPlatform): Book[];
  setInstalledColoringBooks(bookIds: string[]): void;
  setNoDownloadedColoringBooks(platform: BookPlatform): void;
  // What a store scan found: the catalog's size and the bytes already on disk.
  recordInstalledPacks(totalBookCount: number, downloadedBytes: number): void;
  startBookDownload(bookId: string): void;
  markColoringBookInstalled(bookId: string, bytes: number): void;
  endBookDownload(): void;
  resetDownloadedColoringBooks(): void;
}

export function createColoringPacks(): ColoringPacksState {
  const s = $state<{
    installedBookIds: string[];
    downloadingBookId: string | null;
    downloadedBytes: number;
    totalBookCount: number;
    initialized: boolean;
  }>({
    installedBookIds: [STARTER_COLORING_BOOK_ID],
    downloadingBookId: null,
    downloadedBytes: 0,
    totalBookCount: 1,
    initialized: false,
  });

  function setInstalledColoringBooks(bookIds: string[]) {
    s.installedBookIds = [
      STARTER_COLORING_BOOK_ID,
      ...bookIds.filter((id) => id !== STARTER_COLORING_BOOK_ID),
    ];
    s.initialized = true;
  }

  return {
    get installedBookIds() {
      return readonlyValue(s.installedBookIds);
    },
    get downloadingBookId() {
      return s.downloadingBookId;
    },
    get downloadedBytes() {
      return s.downloadedBytes;
    },
    get downloadedBookCount() {
      return s.installedBookIds.filter((id) => id !== STARTER_COLORING_BOOK_ID).length;
    },
    // Both catalogs the total comes from list the starter book:
    // parseColoringPackManifest rejects a manifest without it, and
    // coloringPacks.svelte.test.ts pins it into every booksForPlatform list.
    get downloadableBookCount() {
      return s.totalBookCount - 1;
    },
    get initialized() {
      return s.initialized;
    },
    availableColoringBooks(platform) {
      return booksForPlatform(platform).filter((book) => s.installedBookIds.includes(book.id));
    },
    setInstalledColoringBooks,
    // What a scan would publish for a device with no pack storage at all, known
    // without the manifest: the starter book alone, out of the platform's catalog.
    setNoDownloadedColoringBooks(platform) {
      setInstalledColoringBooks([]);
      s.totalBookCount = booksForPlatform(platform).length;
      s.downloadedBytes = 0;
    },
    recordInstalledPacks(totalBookCount, downloadedBytes) {
      s.totalBookCount = totalBookCount;
      s.downloadedBytes = downloadedBytes;
    },
    startBookDownload(bookId) {
      s.downloadingBookId = bookId;
    },
    markColoringBookInstalled(bookId, bytes) {
      if (!s.installedBookIds.includes(bookId)) {
        s.installedBookIds = [...s.installedBookIds, bookId];
      }
      s.downloadedBytes += bytes;
    },
    endBookDownload() {
      s.downloadingBookId = null;
    },
    resetDownloadedColoringBooks() {
      s.installedBookIds = [STARTER_COLORING_BOOK_ID];
      s.downloadedBytes = 0;
      s.downloadingBookId = null;
    },
  };
}

export const coloringPacksState = createColoringPacks();

export const {
  availableColoringBooks,
  setInstalledColoringBooks,
  setNoDownloadedColoringBooks,
  markColoringBookInstalled,
  resetDownloadedColoringBooks,
} = coloringPacksState;
