import type { ResolvedColoringPackBookManifest, ResolvedColoringPackManifest } from './manifest';

// Every web pack cache, current or from an earlier store layout, shares this
// family prefix so a scan can adopt or remove it.
export const COLORING_PACK_CACHE_FAMILY_PREFIX = 'coloring-packs-';

// Any pack cache, even an empty or half-filled one, means a visit got as far as
// downloading. An engine without Cache Storage cannot hold web packs at all.
export async function webColoringPackStorageExists(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  const names = await caches.keys().catch((): string[] => []);
  return names.some((name) => name.startsWith(COLORING_PACK_CACHE_FAMILY_PREFIX));
}

export const COLORING_PACK_MARKER_PREFIX = '/coloring/.installed/';

export const COLORING_PACK_LOCK_NAME = 'splotch-coloring-packs';

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
