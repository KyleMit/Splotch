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
  type SkPath,
  type SkShader,
} from '@shopify/react-native-skia';
import {
  CANONICAL_PAPER_SIZE,
  paperBounds,
  type PaperProjection,
  type PaperBounds,
  paperView,
  semanticWidth,
  textureScale,
  type PaperReference,
  type PaperSize,
} from './paperSpace';
import { rainbow, rainbowLine } from './brushes';
import { bookFillPlacement } from './bookFill';
import {
  CRAYON_BANDS,
  CRAYON_COLOR_MIX,
  crayonPasses,
  crayonPassSeed,
  crayonPhase,
} from './crayon';
import { crayonTileUri, type CrayonTileResources } from './crayonTiles';
import { COLORING_FILLS, type PageId } from './pages';
import { isFarmPageId } from './bundledBooks';
import { isOfflinePageId } from '../offlineLibrary/identity';
import { paintAppearance, paletteHex, type PaletteLabel } from './palette';
import { smoothStroke, type Point, type Stroke } from './model';
import { opCount, opRange, rangeShape, type OpShape } from './inkOps';

export type InkPaintContext = Readonly<{
  paper: PaperReference;
  projection: PaperProjection;
  theme: 'light' | 'dark';
  pageId: PageId;
  tiles: CrayonTileResources;
  bookFill: SkImage | null;
}>;

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

function drawShape(
  canvas: SkCanvas,
  points: readonly Point[],
  width: number,
  paint: SkPaint,
  lead?: Point
) {
  const first = points[0];
  if (!first) return;
  if (points.length === 1) {
    const dot = paint.copy();
    dot.setStyle(PaintStyle.Fill);
    canvas.drawCircle(first.x, first.y, width / 2, dot);
    return;
  }
  const { start, segments } = smoothStroke(points, lead);
  const builder = Skia.PathBuilder.Make().moveTo(start.x, start.y);
  for (const segment of segments) builder.quadTo(segment.cx, segment.cy, segment.x, segment.y);
  canvas.drawPath(builder.detach(), paint);
}

// Page art contain-fitted and centered on the paper, as PageOutline places it.
function fitMatrix(paper: PaperBounds, art: PaperSize) {
  const { scale, left, top } = paperView(paper.width, paper.height, art);
  const matrix = Skia.Matrix();
  matrix.translate(left + paper.x, top + paper.y);
  matrix.scale(scale, scale);
  return matrix;
}

function sameFields<Input extends Readonly<Record<string, unknown>>>(a: Input, b: Input) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}

// Every Magic stroke in a scene paints with one context, so a paint asks for the shader the last
// one built until the page, theme, fill image or paper bounds change. Building one records the
// whole fill, which a live stroke would otherwise repeat on every input packet. The shader is a
// function of its flat input alone (an image by identity), so a cached one paints the same pixels.
function createLastShader<Input extends Readonly<Record<string, unknown>>>(
  build: (input: Input) => SkShader
) {
  let last: Readonly<{ input: Input; shader: SkShader }> | null = null;
  return (input: Input) => {
    if (last && sameFields(last.input, input)) return last.shader;
    const shader = build(input);
    last = { input, shader };
    return shader;
  };
}

type InkTheme = InkPaintContext['theme'];
type FillPageId = keyof typeof COLORING_FILLS;
type FillRegion = Readonly<{ path: SkPath; colors: Readonly<Record<InkTheme, PaletteLabel>> }>;

// Region outlines are constants, so each page's are parsed once for the life of the process.
const fillRegionPaths = new Map<FillPageId, readonly FillRegion[]>();

function fillRegions(pageId: FillPageId): readonly FillRegion[] {
  const parsed = fillRegionPaths.get(pageId);
  if (parsed) return parsed;
  const regions = COLORING_FILLS[pageId].regions.flatMap((region) => {
    const path = Skia.Path.MakeFromSVGString(region.path);
    return path ? [{ path, colors: region.colors }] : [];
  });
  fillRegionPaths.set(pageId, regions);
  return regions;
}

function recordPageFill({
  pageId,
  theme,
  ...size
}: PaperBounds & Readonly<{ pageId: FillPageId; theme: InkTheme }>) {
  const fill = COLORING_FILLS[pageId];
  const recorder = Skia.PictureRecorder();
  const bounds = Skia.XYWHRect(size.x, size.y, size.width, size.height);
  const fillCanvas = recorder.beginRecording(bounds);
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(paletteHex(fill.background[theme])));
  fillCanvas.drawRect(bounds, paint);
  fillCanvas.concat(fitMatrix(size, CANONICAL_PAPER_SIZE));
  for (const region of fillRegions(pageId)) {
    const regionPaint = Skia.Paint();
    regionPaint.setAntiAlias(true);
    regionPaint.setColor(Skia.Color(paletteHex(region.colors[theme])));
    fillCanvas.drawPath(region.path, regionPaint);
  }
  return recorder
    .finishRecordingAsPicture()
    .makeShader(TileMode.Decal, TileMode.Decal, FilterMode.Linear, undefined, bounds);
}

// The fill over the whole paper, letterbox bands included (bookFillPlacement), in image
// pixels rather than frame units: a compact fill is smaller than its art frame.
function recordBookFill({ image, ...size }: PaperBounds & Readonly<{ image: SkImage }>) {
  const pixels = { width: image.width(), height: image.height() };
  const placement = bookFillPlacement(size, pixels);
  const recorder = Skia.PictureRecorder();
  const bounds = Skia.XYWHRect(size.x, size.y, size.width, size.height);
  const canvas = recorder.beginRecording(bounds);
  canvas.translate(size.x, size.y);
  const draw = (
    source: readonly [number, number, number, number],
    target: readonly [number, number, number, number]
  ) =>
    canvas.drawImageRectOptions(
      image,
      Skia.XYWHRect(...source),
      Skia.XYWHRect(...target),
      FilterMode.Linear,
      MipmapMode.None
    );
  for (const edge of placement.edges)
    draw([edge.sx, edge.sy, edge.sw, edge.sh], [edge.dx, edge.dy, edge.dw, edge.dh]);
  draw(
    [0, 0, pixels.width, pixels.height],
    [placement.x, placement.y, placement.width, placement.height]
  );
  return recorder
    .finishRecordingAsPicture()
    .makeShader(TileMode.Decal, TileMode.Decal, FilterMode.Linear, undefined, bounds);
}

const pageFillShader = createLastShader(recordPageFill);
const bookFillShader = createLastShader(recordBookFill);

function magicShader(stroke: Extract<Stroke, { brush: 'magic' }>, context: InkPaintContext) {
  const size = paperBounds(context.projection);
  if (context.bookFill) return bookFillShader({ ...size, image: context.bookFill });
  const { pageId, theme } = context;
  if (isFarmPageId(pageId) || isOfflinePageId(pageId))
    throw new Error('Magic ink on a coloring book page needs its fill artwork.');
  if (pageId !== 'blank') return pageFillShader({ ...size, pageId, theme });
  const line = rainbowLine(stroke.rainbow, size.width, size.height);
  const stops = rainbow(stroke.rainbow).stops;
  return Skia.Shader.MakeLinearGradient(
    { x: line.x1 + size.x, y: line.y1 + size.y },
    { x: line.x2 + size.x, y: line.y2 + size.y },
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

// The scene's tile set is computed from committed ink and the selected paint; a live stroke's
// paint can fall outside it, and Skia decodes a tile synchronously, so it is made on demand.
function crayonTile(context: InkPaintContext, hex: string, bandIndex: number): SkImage {
  const uri =
    context.tiles.byKey.get(`${hex.toLowerCase()}:${bandIndex}`) ?? crayonTileUri(hex, bandIndex);
  return decodeDataUriImage(uri);
}

export type CrayonBands = readonly Readonly<{ width: number; paint: SkPaint }>[];

// One pass's wax: each density band's stroke paint, filled with the paper-tooth tile at the
// pass's phase.
export function crayonPassBands(
  stroke: Extract<Stroke, { brush: 'crayon' }>,
  pass: number,
  width: number,
  context: InkPaintContext
): CrayonBands {
  const hex = paintAppearance(stroke.color, context.theme).hex;
  const texel = textureScale(context.paper);
  const phase = crayonPhase(crayonPassSeed(stroke, pass));
  return CRAYON_BANDS.map((band, bandIndex) => {
    const bandPaint = strokePaint(width * band.widthScale);
    bandPaint.setShader(tileShader(crayonTile(context, hex, bandIndex), texel, phase));
    return { width: width * band.widthScale, paint: bandPaint };
  });
}

export function paintCrayonShape(canvas: SkCanvas, shape: OpShape, bands: CrayonBands) {
  for (const band of bands) drawShape(canvas, shape.points, band.width, band.paint, shape.lead);
}

// Each pass's bands composite as one group, as the shipping crayon stamps its pass buffer
// (ADR-0065): once darkened against the ink beneath, then once unblended at 1 - CRAYON_COLOR_MIX.
// A bounded layer per pass keeps that grouping, so overlapping bands are not counted twice.
//
// The blend is Darken for every paint, dark-paper white included, as on the web. The backdrop
// here is the transparent ink layer, never the paper, so white over bare paper is still the wax
// itself and white over ink mixes with it; paintAppearance's lighten glaze is not used.
function paintCrayon(
  canvas: SkCanvas,
  stroke: Extract<Stroke, { brush: 'crayon' }>,
  width: number,
  context: InkPaintContext
) {
  const texel = textureScale(context.paper);
  for (const [index, pass] of crayonPasses(stroke, width, texel).entries()) {
    const bands = crayonPassBands(stroke, index, width, context);
    // A continuing pass's curve starts between its lead and first point.
    const bounds = shapeBounds(pass.lead ? [pass.lead, ...pass.points] : pass.points, width);
    for (const [blend, alpha] of [
      [BlendMode.Darken, 1],
      [BlendMode.SrcOver, 1 - CRAYON_COLOR_MIX],
    ] as const) {
      const layer = Skia.Paint();
      layer.setBlendMode(blend);
      layer.setAlphaf(alpha);
      canvas.saveLayer(layer, bounds);
      paintCrayonShape(canvas, pass, bands);
      canvas.restore();
    }
  }
}

// A pen, Magic or eraser op's paint: the stroke's color, the page's Magic fill, or a clear.
export function plainOpPaint(
  stroke: Exclude<Stroke, { brush: 'crayon' }>,
  width: number,
  context: InkPaintContext
): SkPaint {
  const paint = strokePaint(width);
  if (stroke.brush === 'eraser') paint.setBlendMode(BlendMode.Clear);
  else if (stroke.brush === 'magic') paint.setShader(magicShader(stroke, context));
  else paint.setColor(Skia.Color(paintAppearance(stroke.color, context.theme).hex));
  return paint;
}

export function paintPlainShape(canvas: SkCanvas, shape: OpShape, width: number, paint: SkPaint) {
  drawShape(canvas, shape.points, width, paint, shape.lead);
}

// One stroke on its own, op by op. A scene paints its strokes through the ink layer
// (skiaInkLayer.ts), which orders a cohort's ops and glazes Crayon passes onto the ink beneath;
// a Crayon stroke here glazes each whole pass over this canvas.
export function paintStroke(canvas: SkCanvas, stroke: Stroke, context: InkPaintContext) {
  const width = semanticWidth(stroke.width, context.paper);
  if (stroke.brush === 'crayon') {
    paintCrayon(canvas, stroke, width, context);
    return;
  }
  const paint = plainOpPaint(stroke, width, context);
  for (let op = 0; op < opCount(stroke); op++)
    paintPlainShape(canvas, rangeShape(stroke.points, opRange(stroke, op)), width, paint);
}
