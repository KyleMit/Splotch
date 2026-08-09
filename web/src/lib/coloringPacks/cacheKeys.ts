import type { ColoringPackManifest } from './manifest';

export const COLORING_PACK_CACHE_PREFIX = 'coloring-packs-v1-';

export function coloringPackCacheName(manifest: Pick<ColoringPackManifest, 'appVersion'>): string {
  return `${COLORING_PACK_CACHE_PREFIX}${manifest.appVersion}`;
}

export function coloringPackMarkerPath(
  manifest: Pick<ColoringPackManifest, 'appVersion'>,
  bookId: string
): string {
  return `/coloring/.installed/${manifest.appVersion}/${bookId}`;
}
