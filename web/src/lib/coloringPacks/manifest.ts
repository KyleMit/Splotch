import { COLORING_PACK_RESOLUTIONS, type ColoringPackResolution } from './resolution.ts';

/** @public Build-time manifest generator entry used from the Vite config graph. */
export const COLORING_PACK_FORMAT_VERSION = 3;

interface ColoringPackFile {
  path: string;
  downloadPath?: string;
  bytes: number;
  sha256: string;
}

interface ResolvedColoringPackFile extends ColoringPackFile {
  downloadPath: string;
}

interface ColoringPackVariantManifest {
  bytes: number;
  files: ColoringPackFile[];
}

interface ColoringPackBookManifest {
  id: string;
  variants: Record<ColoringPackResolution, ColoringPackVariantManifest>;
}

export interface ColoringPackManifest {
  formatVersion: typeof COLORING_PACK_FORMAT_VERSION;
  appVersion: string;
  starterBookId: string;
  books: ColoringPackBookManifest[];
}

export interface ResolvedColoringPackBookManifest extends Omit<
  ColoringPackVariantManifest,
  'files'
> {
  id: string;
  files: ResolvedColoringPackFile[];
}

export interface ResolvedColoringPackManifest {
  appVersion: string;
  resolution: ColoringPackResolution;
  starterBookId: string;
  books: ResolvedColoringPackBookManifest[];
}

export function coloringPackManifestPath(appVersion: string): string {
  return `/coloring/manifest-${appVersion}.json`;
}

export function resolveColoringPackManifest(
  manifest: ColoringPackManifest,
  resolution: ColoringPackResolution
): ResolvedColoringPackManifest {
  return {
    appVersion: manifest.appVersion,
    resolution,
    starterBookId: manifest.starterBookId,
    books: manifest.books.map((book) => {
      const variant = book.variants[resolution];
      return {
        id: book.id,
        bytes: variant.bytes,
        files: variant.files.map((file) => ({
          ...file,
          downloadPath: file.downloadPath ?? file.path,
        })),
      };
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCanonicalColoringAssetPath(path: string, bookId: string): boolean {
  const prefix = `/coloring/${bookId}/`;
  if (!path.startsWith(prefix) || path.includes('..')) return false;
  const filename = path.slice(prefix.length);
  return path.endsWith('.webp') || /^[^/]+(?:\.dark)?\.overlay\.svg$/.test(filename);
}

function validDownloadPath(
  path: string,
  downloadPath: string,
  bookId: string,
  resolution: ColoringPackResolution
): boolean {
  if (resolution === 'full' || path.endsWith('.svg')) return downloadPath === path;
  const compactMatch = /^\/coloring\/max-\d+px\/([^/]+)\/.+\.webp$/.exec(downloadPath);
  return downloadPath === path || compactMatch?.[1] === bookId;
}

function validVariant(
  value: unknown,
  bookId: string,
  resolution: ColoringPackResolution
): value is ColoringPackVariantManifest {
  if (!isRecord(value) || !Number.isSafeInteger(value.bytes) || (value.bytes as number) <= 0) {
    return false;
  }
  if (!Array.isArray(value.files)) return false;
  const paths = new Set<string>();
  const totalBytes = value.files.reduce((sum: number, file: unknown) => {
    if (
      !isRecord(file) ||
      typeof file.path !== 'string' ||
      !isCanonicalColoringAssetPath(file.path, bookId) ||
      paths.has(file.path) ||
      (file.downloadPath !== undefined &&
        (typeof file.downloadPath !== 'string' || file.downloadPath.includes('..'))) ||
      !Number.isSafeInteger(file.bytes) ||
      (file.bytes as number) <= 0 ||
      typeof file.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      return Number.NaN;
    }
    const downloadPath = file.downloadPath ?? file.path;
    if (!validDownloadPath(file.path, downloadPath, bookId, resolution)) return Number.NaN;
    paths.add(file.path);
    return sum + (file.bytes as number);
  }, 0);
  return value.files.length > 0 && totalBytes === value.bytes;
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
    const variants = isRecord(book) ? book.variants : undefined;
    if (
      !isRecord(book) ||
      typeof book.id !== 'string' ||
      !/^[a-z0-9-]+$/.test(book.id) ||
      !isRecord(variants) ||
      Object.keys(variants).length !== COLORING_PACK_RESOLUTIONS.length
    ) {
      return false;
    }
    const variantsValid = COLORING_PACK_RESOLUTIONS.every((resolution) =>
      validVariant(variants[resolution], book.id as string, resolution)
    );
    if (!variantsValid) return false;
    const [firstResolution, ...otherResolutions] = COLORING_PACK_RESOLUTIONS;
    const firstFiles = new Map(
      (variants[firstResolution] as ColoringPackVariantManifest).files.map((file) => [
        file.path,
        file,
      ])
    );
    return otherResolutions.every((resolution) => {
      const files = (variants as Record<string, ColoringPackVariantManifest>)[resolution].files;
      return (
        files.length === firstFiles.size &&
        files.every((file) => {
          const first = firstFiles.get(file.path);
          if (!first) return false;
          return (
            !file.path.endsWith('.svg') ||
            (file.bytes === first.bytes &&
              file.sha256 === first.sha256 &&
              (file.downloadPath ?? file.path) === (first.downloadPath ?? first.path))
          );
        })
      );
    });
  });
  const ids = value.books.map((book) => (isRecord(book) ? book.id : undefined));
  if (!validBooks || new Set(ids).size !== ids.length || !ids.includes(value.starterBookId)) {
    throw new Error('Invalid coloring-pack manifest books');
  }
  return value as unknown as ColoringPackManifest;
}
