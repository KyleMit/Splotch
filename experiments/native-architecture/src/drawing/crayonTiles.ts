import { CRAYON_BANDS } from './crayon';
import { crayonTilePixels } from './crayonGrain';
import { crayonTilePng } from './crayonTilePng';
import { PALETTE_COLORS, paintAppearance, type PaintColor } from './palette';
import type { Stroke } from './model';

const TILE_CACHE_LIMIT = (PALETTE_COLORS.length + 1) * CRAYON_BANDS.length;
const tileCache = new Map<string, string>();
export function crayonTileUri(hex: string, bandIndex: number): string {
  const band = CRAYON_BANDS[bandIndex];
  if (!band || !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Invalid Crayon tile request');
  const key = `${hex.toLowerCase()}:${bandIndex}`;
  const cached = tileCache.get(key);
  if (cached) {
    tileCache.delete(key);
    tileCache.set(key, cached);
    return cached;
  }
  const uri = crayonTilePng(crayonTilePixels(hex, band.coverage));
  tileCache.set(key, uri);
  while (tileCache.size > TILE_CACHE_LIMIT) {
    const oldest = tileCache.keys().next().value;
    if (oldest !== undefined) tileCache.delete(oldest);
  }
  return uri;
}
export type CrayonTileResources = Readonly<{
  byKey: ReadonlyMap<string, string>;
  uris: readonly string[];
}>;

// The cross-scene LRU can evict tiles still required by an active artwork.
export function createCrayonTileResources() {
  let retained: ReadonlyMap<string, string> = new Map();
  return (
    strokes: readonly Stroke[],
    theme: 'light' | 'dark',
    selected?: PaintColor,
    inherited?: CrayonTileResources | null
  ): CrayonTileResources => {
    const colors = new Set<string>();
    for (const stroke of strokes)
      if (stroke.brush === 'crayon')
        colors.add(paintAppearance(stroke.color, theme).hex.toLowerCase());
    if (selected) colors.add(paintAppearance(selected, theme).hex.toLowerCase());
    const byKey = new Map<string, string>();
    for (const hex of colors) {
      for (const [index] of CRAYON_BANDS.entries()) {
        const key = `${hex}:${index}`;
        byKey.set(key, retained.get(key) ?? inherited?.byKey.get(key) ?? crayonTileUri(hex, index));
      }
    }
    retained = byKey;
    return { byKey, uris: [...byKey.values()] };
  };
}

export function crayonResourceUri(resources: CrayonTileResources, hex: string, bandIndex: number) {
  const uri = resources.byKey.get(`${hex.toLowerCase()}:${bandIndex}`);
  if (!uri) throw new Error('Crayon tile is missing from the artwork resources');
  return uri;
}
