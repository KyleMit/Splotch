import { BlendMode, ImageFormat, Skia, TileMode } from '@shopify/react-native-skia';
import { loadPaperGrain, PAPER_GRAIN_CUBIC } from '../drawing/paperGrain';
import type { PaperTheme } from '../drawing/theme';
import { BARE_GLASS_THEMES, GLASS_FROST } from './bareGlassTheme';
import { glassPanePng } from './glassPanePng';
import { paneImagePlace, type PaneRaster } from './glassPaneRaster';

const PNG_PREFIX = 'data:image/png;base64,';
const PNG_QUALITY = 100;
const MASK_RGB = [255, 255, 255] as const;
const [MITCHELL_B, MITCHELL_C] = PAPER_GRAIN_CUBIC;
type PaneOrigin = Readonly<{ x: number; y: number }>;

// One static image carries shipping's frost, window-phase grain and unstrengthened feather mask.
// Skia runs only when the pane's layout or theme changes, never as ink moves beneath it.
export async function glassPaneImage(
  raster: PaneRaster,
  theme: PaperTheme,
  origin: PaneOrigin
): Promise<string | null> {
  const texture = await loadPaperGrain();
  if (!texture) return null;
  const { box, columns, rows } = raster;
  const width = Math.ceil(box.width);
  const height = Math.ceil(box.height);
  const surface = Skia.Surface.Make(width, height);
  const paint = Skia.Paint();
  const mask = Skia.Image.MakeImageFromEncoded(
    Skia.Data.fromBase64(glassPanePng(raster, MASK_RGB).slice(PNG_PREFIX.length))
  );
  try {
    if (!surface || !mask) return null;
    const canvas = surface.getCanvas();
    canvas.scale(width / box.width, height / box.height);
    const tint = BARE_GLASS_THEMES[theme].glassTintRgb.split(' ').join(',');
    paint.setColor(Skia.Color(`rgb(${tint})`));
    paint.setAlphaf(parseFloat(GLASS_FROST.glassStrip) / 100);
    canvas.drawPaint(paint);
    paint.setAlphaf(1);
    paint.setShader(
      texture.makeShaderCubic(
        TileMode.Repeat,
        TileMode.Repeat,
        MITCHELL_B,
        MITCHELL_C,
        Skia.Matrix().translate(-origin.x, -origin.y)
      )
    );
    canvas.drawPaint(paint);
    paint.setShader(null);
    paint.setBlendMode(BlendMode.DstIn);
    const place = paneImagePlace(raster);
    canvas.drawImageRectCubic(
      mask,
      Skia.XYWHRect(0, 0, columns, rows),
      Skia.XYWHRect(place.left, place.top, place.width, place.height),
      MITCHELL_B,
      MITCHELL_C,
      paint
    );
    surface.flush();
    const image = surface.makeImageSnapshot();
    try {
      return PNG_PREFIX + image.encodeToBase64(ImageFormat.PNG, PNG_QUALITY);
    } finally {
      image.dispose();
    }
  } finally {
    mask?.dispose();
    paint.dispose();
    surface?.dispose();
  }
}
