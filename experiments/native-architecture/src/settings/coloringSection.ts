import { OFFLINE_BOOKS } from '../offlineLibrary/books.generated';
import type { LibrarySnapshot } from '../offlineLibrary/snapshot';

// The shipping Settings › Coloring copy (settings/ColoringSection.svelte);
// rsd-native-coloring-picker.test.mjs reads each string from that source.
export const COLORING_SECTION_COPY = {
  coloringBook: 'Coloring book',
  coloringBookHelp: 'Show coloring pages and download new books automatically',
  metered: 'Download over mobile data',
  meteredHelp: "Allows automatic picture downloads when Wi-Fi isn't available",
  storage: 'Downloaded pictures',
  remove: 'Remove downloaded pictures',
  removing: 'Removing…',
  removeFailed: 'Downloaded pictures could not be removed. Try again.',
  everyBookReady: 'Every coloring book is ready offline',
  storageUnavailable: 'Storage details are unavailable while coloring books are off',
} as const;

const BYTES_PER_MEGABYTE = 1_000_000;

function megabytes(bytes: number) {
  return `${(bytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`;
}

function downloadingLine(state: LibrarySnapshot) {
  if (state.status !== 'downloading') return null;
  const book = OFFLINE_BOOKS.find((entry) => entry.id === state.activeBook);
  return book ? `Downloading ${book.label} in the background` : null;
}

// The Downloaded pictures card's status lines: how many of the extra books are on the device and
// their size, then the book downloading now or that every book is ready. Before the library has
// taken its inventory there is nothing to count.
export function coloringStorageLines(
  state: LibrarySnapshot,
  coloringBookEnabled: boolean
): readonly string[] {
  if (!state.inventoried)
    return coloringBookEnabled ? [] : [COLORING_SECTION_COPY.storageUnavailable];
  const downloaded = state.installed.length;
  const bytes = state.installed.reduce((total, pack) => total + pack.bytes, 0);
  const status =
    downloadingLine(state) ??
    (downloaded === OFFLINE_BOOKS.length ? COLORING_SECTION_COPY.everyBookReady : null);
  return [
    `${downloaded} of ${OFFLINE_BOOKS.length} extra books · ${megabytes(bytes)}`,
    ...(status ? [status] : []),
  ];
}
