import { Asset } from 'expo-asset';
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

// Added faces load on first use, like stylesheet @font-face rules, so text the
// subset's unicode-range never covers never downloads it.
export function loadShippingFont() {
  for (const { subset, unicodeRange } of SHIPPING_FONT_SUBSETS) {
    const asset = Asset.fromModule(SUBSET_FILES[subset]);
    document.fonts.add(
      new FontFace(SHIPPING_FONT_FAMILY, `url(${asset.uri}) format('woff2')`, {
        weight: SHIPPING_FONT_WEIGHT_RANGE,
        display: SHIPPING_FONT_DISPLAY,
        unicodeRange,
      })
    );
  }
}
