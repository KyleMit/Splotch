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

const NO_STROKES: readonly Stroke[] = [];

function addCrayonHexes(colors: Set<string>, strokes: readonly Stroke[], theme: 'light' | 'dark') {
  for (const stroke of strokes)
    if (stroke.brush === 'crayon')
      colors.add(paintAppearance(stroke.color, theme).hex.toLowerCase());
}

function holdsExactly(resources: CrayonTileResources, colors: ReadonlySet<string>) {
  if (resources.byKey.size !== colors.size * CRAYON_BANDS.length) return false;
  for (const hex of colors) if (!resources.byKey.has(`${hex}:0`)) return false;
  return true;
}

// The cross-scene LRU can evict tiles still required by an active artwork. A tile is a function of
// its pigment and band alone, so while the pigments needed stay the same the owner answers with the
// resources it last built: a live stroke's packets keep one identity, and so does every scene memo
// keyed on it. The committed list is scanned once per list; the drafts on every call.
export function createCrayonTileResources() {
  let retained: CrayonTileResources = { byKey: new Map(), uris: [] };
  let committed: Readonly<{
    strokes: readonly Stroke[];
    theme: 'light' | 'dark';
    colors: ReadonlySet<string>;
  }> | null = null;
  return (
    strokes: readonly Stroke[],
    theme: 'light' | 'dark',
    selected?: PaintColor,
    inherited?: CrayonTileResources | null,
    drafts: readonly Stroke[] = NO_STROKES
  ): CrayonTileResources => {
    if (committed?.strokes !== strokes || committed.theme !== theme) {
      const scanned = new Set<string>();
      addCrayonHexes(scanned, strokes, theme);
      committed = { strokes, theme, colors: scanned };
    }
    const colors = new Set(committed.colors);
    addCrayonHexes(colors, drafts, theme);
    if (selected) colors.add(paintAppearance(selected, theme).hex.toLowerCase());
    if (holdsExactly(retained, colors)) return retained;
    const byKey = new Map<string, string>();
    for (const hex of colors) {
      for (const [index] of CRAYON_BANDS.entries()) {
        const key = `${hex}:${index}`;
        byKey.set(
          key,
          retained.byKey.get(key) ?? inherited?.byKey.get(key) ?? crayonTileUri(hex, index)
        );
      }
    }
    retained = { byKey, uris: [...byKey.values()] };
    return retained;
  };
}

export function crayonResourceUri(resources: CrayonTileResources, hex: string, bandIndex: number) {
  const uri = resources.byKey.get(`${hex.toLowerCase()}:${bandIndex}`);
  if (!uri) throw new Error('Crayon tile is missing from the artwork resources');
  return uri;
}
