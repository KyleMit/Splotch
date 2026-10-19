import { useEffect, type ReactNode } from 'react';
import { webAssetUri } from './webAsset';
import vietnamese from '@fontsource-variable/quicksand/files/quicksand-vietnamese-wght-normal.woff2';
import latinExt from '@fontsource-variable/quicksand/files/quicksand-latin-ext-wght-normal.woff2';
import latin from '@fontsource-variable/quicksand/files/quicksand-latin-wght-normal.woff2';
import {
  SHIPPING_FONT_DISPLAY,
  SHIPPING_FONT_FAMILY,
  SHIPPING_FONT_SUBSETS,
  SHIPPING_FONT_WEIGHT_RANGE,
  type ShippingFontSubset,
} from './shippingFontFaces';

const SUBSET_FILES: Record<ShippingFontSubset, typeof latin> = {
  vietnamese,
  'latin-ext': latinExt,
  latin,
};

// Faces are built on first mount, not at import: the build's first-frame prerender
// (prerenderFirstFrame.tsx) imports this module in Node, which has no FontFace.
let faces: FontFace[] | undefined;
function shippingFontFaces() {
  return (faces ??= SHIPPING_FONT_SUBSETS.map(
    ({ subset, unicodeRange }) =>
      new FontFace(
        SHIPPING_FONT_FAMILY,
        `url(${webAssetUri(SUBSET_FILES[subset])}) format('woff2')`,
        { weight: SHIPPING_FONT_WEIGHT_RANGE, display: SHIPPING_FONT_DISPLAY, unicodeRange }
      )
  ));
}

// Added faces load on first use, like stylesheet @font-face rules, so text the subset's
// unicode-range never covers never downloads it; until then text swaps in from the
// fallback, as the shipping app's does, so nothing waits on the font.
export function ShippingFontGate({ children }: { children: ReactNode }) {
  useEffect(() => {
    for (const face of shippingFontFaces()) document.fonts.add(face);
  }, []);
  return children;
}
