import type { ResolvedColoringPackManifest } from './manifest';

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
