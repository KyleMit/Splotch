/** @public Build-time manifest generator entry used from the Vite config graph. */
export const COLORING_PACK_FORMAT_VERSION = 1;

interface ColoringPackFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ColoringPackBookManifest {
  id: string;
  bytes: number;
  files: ColoringPackFile[];
}

export interface ColoringPackManifest {
  formatVersion: typeof COLORING_PACK_FORMAT_VERSION;
  appVersion: string;
  starterBookId: string;
  books: ColoringPackBookManifest[];
}

export function coloringPackManifestPath(appVersion: string): string {
  return `/coloring/manifest-${appVersion}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseColoringPackManifest(
  value: unknown,
  expectedAppVersion: string
): ColoringPackManifest {
  if (
    !isRecord(value) ||
    value.formatVersion !== COLORING_PACK_FORMAT_VERSION ||
    value.appVersion !== expectedAppVersion ||
    typeof value.starterBookId !== 'string' ||
    !Array.isArray(value.books)
  ) {
    throw new Error('Invalid coloring-pack manifest header');
  }

  const validBooks = value.books.every((book) => {
    if (
      !isRecord(book) ||
      typeof book.id !== 'string' ||
      !/^[a-z0-9-]+$/.test(book.id) ||
      !Number.isSafeInteger(book.bytes) ||
      (book.bytes as number) <= 0 ||
      !Array.isArray(book.files)
    ) {
      return false;
    }
    const totalBytes = book.files.reduce((sum: number, file: unknown) => {
      if (
        !isRecord(file) ||
        typeof file.path !== 'string' ||
        !file.path.startsWith(`/coloring/${book.id}/`) ||
        !file.path.endsWith('.webp') ||
        file.path.includes('..') ||
        !Number.isSafeInteger(file.bytes) ||
        (file.bytes as number) <= 0 ||
        typeof file.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(file.sha256)
      ) {
        return Number.NaN;
      }
      return sum + (file.bytes as number);
    }, 0);
    return book.files.length > 0 && totalBytes === book.bytes;
  });
  const ids = value.books.map((book) => (isRecord(book) ? book.id : undefined));
  if (!validBooks || new Set(ids).size !== ids.length || !ids.includes(value.starterBookId)) {
    throw new Error('Invalid coloring-pack manifest books');
  }
  return value as unknown as ColoringPackManifest;
}
