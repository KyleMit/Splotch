import type { ResolvedColoringPackBookManifest, ResolvedColoringPackManifest } from './manifest';

export const COLORING_PACK_CACHE_PREFIX = 'coloring-packs-v1-';

export function coloringPackCacheName(
  manifest: Pick<ResolvedColoringPackManifest, 'appVersion' | 'resolution'>
): string {
  return `${COLORING_PACK_CACHE_PREFIX}${manifest.appVersion}-${manifest.resolution}`;
}

export function coloringPackMarkerPath(
  manifest: Pick<ResolvedColoringPackManifest, 'appVersion' | 'resolution'>,
  bookId: string
): string {
  return `/coloring/.installed/${manifest.appVersion}/${manifest.resolution}/${bookId}`;
}

export function coloringPackMarkerValue(book: ResolvedColoringPackBookManifest): string {
  return JSON.stringify({
    id: book.id,
    bytes: book.bytes,
    files: book.files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
  });
}
