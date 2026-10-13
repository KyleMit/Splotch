import type { TextStyle } from 'react-native';
import type * as Regular from '@expo-google-fonts/quicksand/400Regular';
import type * as SemiBold from '@expo-google-fonts/quicksand/600SemiBold';
import type * as Bold from '@expo-google-fonts/quicksand/700Bold';

// Android and iOS have no variable Quicksand, so each static face registers under its
// own family: the face's export name in @expo-google-fonts/quicksand, which the
// type below checks. Only the weights the app draws text in are bundled.
export const NATIVE_FONT_FAMILIES = {
  regular: 'Quicksand_400Regular',
  semibold: 'Quicksand_600SemiBold',
  bold: 'Quicksand_700Bold',
} as const satisfies {
  regular: keyof typeof Regular;
  semibold: keyof typeof SemiBold;
  bold: keyof typeof Bold;
};

export type NativeFontFace = keyof typeof NATIVE_FONT_FAMILIES;
export type NativeFontFamily = (typeof NATIVE_FONT_FAMILIES)[NativeFontFace];

type FontWeight = NonNullable<TextStyle['fontWeight']>;
type NamedFontWeight = Exclude<Extract<FontWeight, string>, `${number}`>;

const NAMED_FONT_WEIGHTS: Record<NamedFontWeight, number> = {
  normal: 400,
  regular: 400,
  bold: 700,
  ultralight: 200,
  thin: 100,
  light: 300,
  medium: 500,
  semibold: 600,
  condensed: 400,
  condensedBold: 700,
  heavy: 800,
  black: 900,
};

// CSS font matching against the bundled faces: a weight up to 500 takes the regular
// face, a heavier one the nearest face at or above it, else the boldest.
const SEMIBOLD_FACE_WEIGHT = 600;
const LIGHTEST_HEAVY_WEIGHT = 500;

function isNamedFontWeight(weight: FontWeight): weight is NamedFontWeight {
  return typeof weight === 'string' && Object.hasOwn(NAMED_FONT_WEIGHTS, weight);
}

function numericFontWeight(weight: TextStyle['fontWeight']) {
  if (weight === undefined) return NAMED_FONT_WEIGHTS.normal;
  return isNamedFontWeight(weight) ? NAMED_FONT_WEIGHTS[weight] : Number(weight);
}

export function nativeFontFace(weight: TextStyle['fontWeight']): NativeFontFace {
  const numeric = numericFontWeight(weight);
  if (numeric <= LIGHTEST_HEAVY_WEIGHT) return 'regular';
  return numeric <= SEMIBOLD_FACE_WEIGHT ? 'semibold' : 'bold';
}

// Android resolves a weight of 700 or more on a registered family to a system bold
// face, so the face carries the weight and the style keeps the normal one.
export function nativeFontStyle(weight: TextStyle['fontWeight']) {
  return {
    fontFamily: NATIVE_FONT_FAMILIES[nativeFontFace(weight)],
    fontWeight: 'normal',
  } as const;
}

// The RSD font tokens on Android and iOS, applied as a theme over the web stack.
export const NATIVE_RSD_FONTS = {
  family: NATIVE_FONT_FAMILIES.regular,
  boldFamily: NATIVE_FONT_FAMILIES.bold,
  boldWeight: 'normal',
} as const;
