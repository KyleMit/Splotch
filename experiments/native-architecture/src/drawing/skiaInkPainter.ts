import {
  BlendMode,
  FilterMode,
  MipmapMode,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
  type SkCanvas,
  type SkImage,
  type SkPaint,
  type SkShader,
} from '@shopify/react-native-skia';
import { semanticWidth, textureScale, type PaperReference } from './paperSpace';
import { rainbow, rainbowLine } from './brushes';
import { CRAYON_BANDS, CRAYON_COLOR_MIX, crayonPasses, crayonPhase } from './crayon';
import { crayonResourceUri, type CrayonTileResources } from './crayonTiles';
import { COLORING_FILLS, type PageId } from './pages';
import { isFarmPageId } from './bundledBooks';
import { isOfflinePageId } from '../offlineLibrary/identity';
import { paintAppearance, paletteHex } from './palette';
import { PAPER_HEIGHT, PAPER_WIDTH, strokePath, type Point, type Stroke } from './model';

export type InkPaintContext = Readonly<{
  paper: PaperReference;
  theme: 'light' | 'dark';
  pageId: PageId;
  tiles: CrayonTileResources;
  bookFill: SkImage | null;
}>;

const GLAZE_BLEND = { darken: BlendMode.Darken, lighten: BlendMode.Lighten } as const;

// Crayon tiles per color and band plus one coloring-book fill; enough for a scene's working
// set while repeated custom colors cannot grow it without bound.
export const DECODED_IMAGE_LIMIT = 48;
const decodedImages = new Map<string, SkImage>();

export function decodeDataUriImage(uri: string): SkImage {
  const cached = decodedImages.get(uri);
  if (cached) {
    decodedImages.delete(uri);
    decodedImages.set(uri, cached);
    return cached;
  }
  const comma = uri.indexOf(',');
  if (!uri.startsWith('data:') || comma < 0 || !uri.slice(0, comma).endsWith(';base64'))
    throw new Error('Ink textures must be base64 data URIs.');
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(uri.slice(comma + 1)));
  if (!image) throw new Error('An ink texture could not be decoded.');
  decodedImages.set(uri, image);
  if (decodedImages.size > DECODED_IMAGE_LIMIT) {
    const oldest = decodedImages.keys().next().value;
    if (oldest !== undefined) decodedImages.delete(oldest);
  }
  return image;
}

function strokePaint(width: number): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
  return paint;
}

function shapeBounds(points: readonly Point[], width: number) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return Skia.XYWHRect(
    left - width,
    top - width,
    right - left + width * 2,
    bottom - top + width * 2
  );
}

function drawShape(canvas: SkCanvas, points: readonly Point[], width: number, paint: SkPaint) {
  const first = points[0];
  if (!first) return;
  if (points.length === 1) {
    const dot = paint.copy();
    dot.setStyle(PaintStyle.Fill);
    canvas.drawCircle(first.x, first.y, width / 2, dot);
    return;
  }
  const path = Skia.Path.MakeFromSVGString(strokePath(points));
  if (!path) throw new Error('A stroke path could not be built.');
  canvas.drawPath(path, paint);
}

function fitMatrix(image: SkImage) {
  const scale = Math.min(PAPER_WIDTH / image.width(), PAPER_HEIGHT / image.height());
  const matrix = Skia.Matrix();
  matrix.translate(
    (PAPER_WIDTH - image.width() * scale) / 2,
    (PAPER_HEIGHT - image.height() * scale) / 2
  );
  matrix.scale(scale, scale);
  return matrix;
}

function magicShader(stroke: Extract<Stroke, { brush: 'magic' }>, context: InkPaintContext) {
  if (context.bookFill)
    return context.bookFill.makeShaderOptions(
      TileMode.Decal,
      TileMode.Decal,
      FilterMode.Linear,
      MipmapMode.None,
      fitMatrix(context.bookFill)
    );
  const { pageId } = context;
  if (isFarmPageId(pageId) || isOfflinePageId(pageId))
    throw new Error('Magic ink on a coloring book page needs its fill artwork.');
  const fill = pageId === 'blank' ? null : COLORING_FILLS[pageId];
  if (fill) {
    const recorder = Skia.PictureRecorder();
    const fillCanvas = recorder.beginRecording(Skia.XYWHRect(0, 0, PAPER_WIDTH, PAPER_HEIGHT));
    const paint = Skia.Paint();
    paint.setColor(Skia.Color(paletteHex(fill.background[context.theme])));
    fillCanvas.drawRect(Skia.XYWHRect(0, 0, PAPER_WIDTH, PAPER_HEIGHT), paint);
    for (const region of fill.regions) {
      const path = Skia.Path.MakeFromSVGString(region.path);
      if (!path) continue;
      const regionPaint = Skia.Paint();
      regionPaint.setAntiAlias(true);
      regionPaint.setColor(Skia.Color(paletteHex(region.colors[context.theme])));
      fillCanvas.drawPath(path, regionPaint);
    }
    return recorder
      .finishRecordingAsPicture()
      .makeShader(
        TileMode.Decal,
        TileMode.Decal,
        FilterMode.Linear,
        undefined,
        Skia.XYWHRect(0, 0, PAPER_WIDTH, PAPER_HEIGHT)
      );
  }
  const line = rainbowLine(stroke.rainbow, PAPER_WIDTH, PAPER_HEIGHT);
  const stops = rainbow(stroke.rainbow).stops;
  return Skia.Shader.MakeLinearGradient(
    { x: line.x1, y: line.y1 },
    { x: line.x2, y: line.y2 },
    stops.map((stop) => Skia.Color(stop.color)),
    stops.map((stop) => stop.offset),
    TileMode.Clamp
  );
}

function tileShader(tile: SkImage, texel: number, phase: Point): SkShader {
  const matrix = Skia.Matrix();
  matrix.scale(texel, texel);
  matrix.translate(phase.x, phase.y);
  return tile.makeShaderOptions(
    TileMode.Repeat,
    TileMode.Repeat,
    FilterMode.Nearest,
    MipmapMode.None,
    matrix
  );
}

// The SVG renderer's CrayonGlaze composites each pass's bands as a group: once blended against
// the ink beneath, then once unblended at 1 - CRAYON_COLOR_MIX. A bounded layer per pass keeps
// that grouping, so overlapping bands are not counted twice.
function paintCrayon(
  canvas: SkCanvas,
  stroke: Extract<Stroke, { brush: 'crayon' }>,
  width: number,
  context: InkPaintContext
) {
  const paint = paintAppearance(stroke.color, context.theme);
  const texel = textureScale(context.paper);
  for (const pass of crayonPasses(stroke, width, texel)) {
    const phase = crayonPhase(pass.seed);
    const bands = CRAYON_BANDS.map((band, bandIndex) => {
      const bandPaint = strokePaint(width * band.widthScale);
      bandPaint.setShader(
        tileShader(
          decodeDataUriImage(crayonResourceUri(context.tiles, paint.hex, bandIndex)),
          texel,
          phase
        )
      );
      return { width: width * band.widthScale, paint: bandPaint };
    });
    const bounds = shapeBounds(pass.points, width);
    for (const [blend, alpha] of [
      [GLAZE_BLEND[paint.glaze], 1],
      [BlendMode.SrcOver, 1 - CRAYON_COLOR_MIX],
    ] as const) {
      const layer = Skia.Paint();
      layer.setBlendMode(blend);
      layer.setAlphaf(alpha);
      canvas.saveLayer(layer, bounds);
      for (const band of bands) drawShape(canvas, pass.points, band.width, band.paint);
      canvas.restore();
    }
  }
}

export function paintStroke(canvas: SkCanvas, stroke: Stroke, context: InkPaintContext) {
  const width = semanticWidth(stroke.width, context.paper);
  if (stroke.brush === 'crayon') {
    paintCrayon(canvas, stroke, width, context);
    return;
  }
  const paint = strokePaint(width);
  if (stroke.brush === 'eraser') paint.setBlendMode(BlendMode.Clear);
  else if (stroke.brush === 'magic') paint.setShader(magicShader(stroke, context));
  else paint.setColor(Skia.Color(paintAppearance(stroke.color, context.theme).hex));
  drawShape(canvas, stroke.points, width, paint);
}
