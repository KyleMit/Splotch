import { Skia, type SkImage } from '@shopify/react-native-skia';
import handmadePaper from '../../assets/paper/handmade-paper.webp';
import { nativeAssetUri } from '../platform/nativeAsset';

// Mitchell cubic resampling preserves the grain when a texel spans several screen pixels.
export const PAPER_GRAIN_CUBIC = [1 / 3, 1 / 3] as const;

let grain: Promise<SkImage | null> | null = null;

// A failed asset load is forgotten so the next composition retries it.
export function loadPaperGrain(): Promise<SkImage | null> {
  if (grain) return grain;
  const loading = Skia.Data.fromURI(nativeAssetUri(handmadePaper))
    .then((bytes) => Skia.Image.MakeImageFromEncoded(bytes))
    .catch(() => null)
    .then((image) => {
      if (!image && grain === loading) grain = null;
      return image;
    });
  grain = loading;
  return loading;
}
