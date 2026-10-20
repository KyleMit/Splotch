import type { SkImage } from '@shopify/react-native-skia';

// The committed ink as the paper shows it when Clear lets go: the native ink layer's pixels, which
// the snapshot shares with the layer until its next paint, and the pixel rectangle that holds the
// paper. The departing page flies these pixels, as shipping flies its canvas, rather than drawing
// the cleared strokes again (issue 3035).
export type DepartingInk = Readonly<{
  image: SkImage;
  paper: Readonly<{ x: number; y: number; width: number; height: number }>;
}>;
