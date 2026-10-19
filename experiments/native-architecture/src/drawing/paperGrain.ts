import { Skia, type SkImage } from '@shopify/react-native-skia';
import { Image } from 'react-native';
import handmadePaper from '../../assets/paper/handmade-paper.webp';

// Mitchell cubic resampling preserves the grain when a texel spans several screen pixels.
export const PAPER_GRAIN_CUBIC = [1 / 3, 1 / 3] as const;

// Native assets resolve to an Android drawable name or an iOS file URL, as Skia's image hooks do.
function grainUri(): string {
  if (typeof handmadePaper === 'string') return handmadePaper;
  const source = Image.resolveAssetSource(handmadePaper);
  if (!source) throw new Error('The paper grain asset did not resolve');
  return source.uri;
}

let grain: Promise<SkImage | null> | null = null;

// A failed asset load is forgotten so the next composition retries it.
export function loadPaperGrain(): Promise<SkImage | null> {
  if (grain) return grain;
  const loading = Skia.Data.fromURI(grainUri())
    .then((bytes) => Skia.Image.MakeImageFromEncoded(bytes))
    .catch(() => null)
    .then((image) => {
      if (!image && grain === loading) grain = null;
      return image;
    });
  grain = loading;
  return loading;
}
