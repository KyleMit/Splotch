import type { ResolvedColoringPackBookManifest, ResolvedColoringPackManifest } from './manifest';

// Every web pack cache, current or from an earlier store layout, shares this
// family prefix so a scan can adopt or remove it.
export const COLORING_PACK_CACHE_FAMILY_PREFIX = 'coloring-packs-';

export const COLORING_PACK_MARKER_PREFIX = '/coloring/.installed/';

// Deliberately not scoped by app version: the web version moves on every
// deploy (ADR-0030), and markers are validated against the manifest's file
// digests instead, so unchanged books survive a deploy.
export function coloringPackCacheName(
  manifest: Pick<ResolvedColoringPackManifest, 'resolution'>
): string {
  return `${COLORING_PACK_CACHE_FAMILY_PREFIX}v2-${manifest.resolution}`;
}

export function coloringPackMarkerPath(bookId: string): string {
  return `${COLORING_PACK_MARKER_PREFIX}${bookId}`;
}

export function coloringPackMarkerValue(book: ResolvedColoringPackBookManifest): string {
  return JSON.stringify({
    id: book.id,
    bytes: book.bytes,
    files: book.files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
  });
}
