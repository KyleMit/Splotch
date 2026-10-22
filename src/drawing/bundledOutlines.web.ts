import { createLazyExport, useLazyValue, type LazyExport } from '../lazyExport';
import type { FarmPageId } from './bundledBooks';
import type { BundledPageOutlines } from './bundledBookAssets';

// Each page's line art is its own chunk, fetched when that page is first shown, so first paint
// carries none of it; the service worker precaches every chunk for offline use.
const PAGE_OUTLINES = {
  'farm/cat': createLazyExport(() => import('./bundledFarm/cat').then((page) => page.catOutlines)),
  'farm/cow': createLazyExport(() => import('./bundledFarm/cow').then((page) => page.cowOutlines)),
  'farm/dog': createLazyExport(() => import('./bundledFarm/dog').then((page) => page.dogOutlines)),
  'farm/duck': createLazyExport(() =>
    import('./bundledFarm/duck').then((page) => page.duckOutlines)
  ),
  'farm/horse': createLazyExport(() =>
    import('./bundledFarm/horse').then((page) => page.horseOutlines)
  ),
  'farm/pig': createLazyExport(() => import('./bundledFarm/pig').then((page) => page.pigOutlines)),
} satisfies Record<FarmPageId, LazyExport<BundledPageOutlines>>;

const wholePage = (outlines: BundledPageOutlines) => outlines;

export function useBundledPageOutlines(pageId: FarmPageId | null): BundledPageOutlines | undefined {
  return useLazyValue(
    pageId === null ? null : PAGE_OUTLINES[pageId],
    wholePage,
    'Coloring page line art'
  );
}
