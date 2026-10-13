import { catOutlines } from './bundledFarm/cat';
import { cowOutlines } from './bundledFarm/cow';
import { dogOutlines } from './bundledFarm/dog';
import { duckOutlines } from './bundledFarm/duck';
import { horseOutlines } from './bundledFarm/horse';
import { pigOutlines } from './bundledFarm/pig';
import type { FarmPageId } from './bundledBooks';
import type { BundledPageOutlines } from './bundledBookAssets';

export const BUNDLED_BOOK_OUTLINES = {
  'farm/cat': catOutlines,
  'farm/cow': cowOutlines,
  'farm/dog': dogOutlines,
  'farm/duck': duckOutlines,
  'farm/horse': horseOutlines,
  'farm/pig': pigOutlines,
} satisfies Record<FarmPageId, BundledPageOutlines>;

// The native apps carry every page's line art in their one bundle, so it is ready on the first
// render; the web export loads each page's on first use (bundledOutlines.web.ts).
export function useBundledPageOutlines(pageId: FarmPageId | null): BundledPageOutlines | undefined {
  return pageId === null ? undefined : BUNDLED_BOOK_OUTLINES[pageId];
}
