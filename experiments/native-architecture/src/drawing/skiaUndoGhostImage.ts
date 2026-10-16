import {
  BlendMode,
  PaintStyle,
  StrokeCap,
  StrokeJoin,
  Skia,
  type SkCanvas,
  type SkImage,
} from '@shopify/react-native-skia';
import { smoothStroke, type Stroke } from './model';
import { paperSize, paperView, semanticWidth } from './paperSpace';
import { paintStroke, type InkPaintContext } from './skiaInkPainter';
import { UNDO_GHOST_AA_PAD_PX, type GhostBounds } from './undoGhostGeometry';

function footprint(
  canvas: SkCanvas,
  strokes: readonly Stroke[],
  context: InkPaintContext,
  scale: number
) {
  for (const stroke of strokes) {
    const first = stroke.points[0];
    if (!first) continue;
    const width = semanticWidth(stroke.width, context.paper) + (2 * UNDO_GHOST_AA_PAD_PX) / scale;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color('#000'));
    if (stroke.points.length === 1) canvas.drawCircle(first.x, first.y, width / 2, paint);
    else {
      paint.setStyle(PaintStyle.Stroke);
      paint.setStrokeWidth(width);
      paint.setStrokeCap(StrokeCap.Round);
      paint.setStrokeJoin(StrokeJoin.Round);
      const { start, segments } = smoothStroke(stroke.points);
      const builder = Skia.PathBuilder.Make().moveTo(start.x, start.y);
      for (const segment of segments) builder.quadTo(segment.cx, segment.cy, segment.x, segment.y);
      canvas.drawPath(builder.detach(), paint);
    }
  }
}

export function makeSkiaUndoGhost({
  before,
  after,
  removed,
  context,
  bounds,
  size,
  density,
}: {
  before: SkImage;
  after: SkImage | null;
  removed: readonly Stroke[];
  context: InkPaintContext;
  bounds: GhostBounds;
  size: { width: number; height: number };
  density: number;
}) {
  const pixelBounds = {
    left: Math.floor(bounds.left * density),
    top: Math.floor(bounds.top * density),
    width: Math.ceil(bounds.width * density),
    height: Math.ceil(bounds.height * density),
  };
  const surface = Skia.Surface.Make(pixelBounds.width, pixelBounds.height);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  const view = paperView(size.width * density, size.height * density, paperSize(context.paper));
  const readsRaster = removed.some(
    (stroke) => stroke.brush === 'crayon' || stroke.brush === 'magic'
  );
  canvas.save();
  canvas.translate(view.left - pixelBounds.left, view.top - pixelBounds.top);
  canvas.scale(view.scale, view.scale);
  if (!readsRaster) for (const stroke of removed) paintStroke(canvas, stroke, context);
  else footprint(canvas, removed, context, view.scale);
  canvas.restore();
  if (readsRaster) {
    const paint = Skia.Paint();
    paint.setBlendMode(BlendMode.SrcIn);
    canvas.drawImage(before, -pixelBounds.left, -pixelBounds.top, paint);
    if (after) {
      paint.setBlendMode(BlendMode.DstOut);
      canvas.drawImage(after, -pixelBounds.left, -pixelBounds.top, paint);
    }
  }
  surface.flush();
  return surface.makeImageSnapshot();
}
