import {
  ImageFormat,
  Skia,
  TileMode,
  type SkImage,
  type SkJSIInstance,
} from '@shopify/react-native-skia';
import { loadPaperGrain, PAPER_GRAIN_CUBIC } from './paperGrain';
import type { PictureExport } from './pictureExport';

// Mitchell cubic resampling, Skia's high-quality filter, for the grain each texel spans several
// pixels of and for the captured picture scaled onto the saved grid.
const [MITCHELL_B, MITCHELL_C] = PAPER_GRAIN_CUBIC;
const PNG_QUALITY = 100;

function decode(bytes: Parameters<typeof Skia.Image.MakeImageFromEncoded>[0]): SkImage {
  const image = Skia.Image.MakeImageFromEncoded(bytes);
  if (!image) throw new Error('The picture could not be decoded for saving.');
  return image;
}

function release(...instances: Array<SkJSIInstance<string> | null>) {
  for (const instance of instances) instance?.dispose();
}

// The shipping export compositor's stack (exportCompositor.ts): the paper color, the grain tiled
// one texel per CSS pixel, then the captured ink and line art stretched onto the saved grid.
export async function composePicture(
  layerBase64: string,
  picture: PictureExport,
  includePaperTexture = true
) {
  const layer = decode(Skia.Data.fromBase64(layerBase64));
  const { width, height } = picture.size;
  const surface = Skia.Surface.Make(width, height);
  const paint = Skia.Paint();
  try {
    if (!surface) throw new Error('Picture export is unavailable.');
    const texture = includePaperTexture ? await loadPaperGrain() : null;
    const canvas = surface.getCanvas();
    canvas.drawColor(Skia.Color(picture.paper));
    if (texture) {
      paint.setShader(
        texture.makeShaderCubic(
          TileMode.Repeat,
          TileMode.Repeat,
          MITCHELL_B,
          MITCHELL_C,
          Skia.Matrix().scale(picture.scale, picture.scale)
        )
      );
      canvas.drawPaint(paint);
    }
    canvas.drawImageRectCubic(
      layer,
      Skia.XYWHRect(0, 0, layer.width(), layer.height()),
      Skia.XYWHRect(0, 0, width, height),
      MITCHELL_B,
      MITCHELL_C
    );
    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    try {
      return snapshot.encodeToBase64(ImageFormat.PNG, PNG_QUALITY);
    } finally {
      release(snapshot);
    }
  } finally {
    release(paint, surface, layer);
  }
}
