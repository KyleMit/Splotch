import { BUNDLED_FARM_OUTLINE_FILES } from './bundledFarm/outlineFiles';
import { createLazyExport, useLazyValue, type LazyExport } from '../lazyExport';
import { readBundledText } from '../platform/bundledText.native';
import { parseOverlay } from './overlayOutline';
import type { FarmPageId } from './bundledBooks';
import type { BundledOutlineVariant, BundledPageOutlines } from './bundledBookAssets';

async function loadVariant(file: number | string, name: string): Promise<BundledOutlineVariant> {
  return parseOverlay(await readBundledText(file), name);
}

// A page's line art ships as its overlay SVGs: files the app package compresses, not strings in the
// JavaScript bundle, which the apps keep uncompressed. A page reads and parses its four on first
// use, offline; the web export loads the same art as per-page chunks (bundledOutlines.web.ts).
async function loadPage(pageId: FarmPageId): Promise<BundledPageOutlines> {
  const { landscape, portrait } = BUNDLED_FARM_OUTLINE_FILES[pageId];
  const [wideLight, wideDark, tallLight, tallDark] = await Promise.all([
    loadVariant(landscape.light, `${pageId} wide light`),
    loadVariant(landscape.dark, `${pageId} wide dark`),
    loadVariant(portrait.light, `${pageId} tall light`),
    loadVariant(portrait.dark, `${pageId} tall dark`),
  ]);
  return {
    landscape: { light: wideLight, dark: wideDark },
    portrait: { light: tallLight, dark: tallDark },
  };
}

const lazyPage = (pageId: FarmPageId) => createLazyExport(() => loadPage(pageId));
const PAGE_OUTLINES = {
  'farm/cat': lazyPage('farm/cat'),
  'farm/cow': lazyPage('farm/cow'),
  'farm/dog': lazyPage('farm/dog'),
  'farm/duck': lazyPage('farm/duck'),
  'farm/horse': lazyPage('farm/horse'),
  'farm/pig': lazyPage('farm/pig'),
} satisfies Record<FarmPageId, LazyExport<BundledPageOutlines>>;

const wholePage = (outlines: BundledPageOutlines) => outlines;

export function useBundledPageOutlines(pageId: FarmPageId | null): BundledPageOutlines | undefined {
  return useLazyValue(
    pageId === null ? null : PAGE_OUTLINES[pageId],
    wholePage,
    'Coloring page line art'
  );
}
