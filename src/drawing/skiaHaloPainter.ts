import { PaintStyle, Skia, TileMode, type SkCanvas } from '@shopify/react-native-skia';
import {
  ERASER_FILL_OPACITY,
  ERASER_GLOW_OPACITY,
  ERASER_LINE_OPACITY,
  HALO_GLOW,
  HALO_GLOW_PX,
  HALO_LINE,
  HALO_RAINBOW,
  RAINBOW_BAND_PX,
  RING_GLOW_OPACITY,
  RING_LINE_OPACITY,
  RING_LINE_PX,
  haloPose,
  type HaloKind,
  type ShownHalo,
} from './haloModel';

// Skia's sweep gradient starts at three o'clock; the shipping conic gradient at twelve.
const SWEEP_TO_TWELVE_DEGREES = -90;
// Room past the outermost mark for its antialiased edge inside an opacity layer.
const LAYER_MARGIN_PX = 2;

function circleStroke(canvas: SkCanvas, radius: number, color: string, alpha: number, px: number) {
  'worklet';
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(px);
  paint.setColor(Skia.Color(color));
  paint.setAlphaf(alpha);
  canvas.drawCircle(0, 0, radius, paint);
}

function paintEraser(canvas: SkCanvas, radius: number) {
  'worklet';
  const bubble = Math.max(radius - RING_LINE_PX / 2, 0);
  circleStroke(canvas, radius + HALO_GLOW_PX / 2, HALO_GLOW, ERASER_GLOW_OPACITY, HALO_GLOW_PX);
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setColor(Skia.Color(HALO_GLOW));
  fill.setAlphaf(ERASER_FILL_OPACITY);
  canvas.drawCircle(0, 0, bubble, fill);
  circleStroke(canvas, bubble, HALO_LINE, ERASER_LINE_OPACITY, RING_LINE_PX);
}

function paintRainbowBand(canvas: SkCanvas, radius: number) {
  'worklet';
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(RAINBOW_BAND_PX);
  paint.setShader(
    Skia.Shader.MakeSweepGradient(
      0,
      0,
      HALO_RAINBOW.map((color) => Skia.Color(color)),
      null,
      TileMode.Clamp
    )
  );
  canvas.save();
  canvas.rotate(SWEEP_TO_TWELVE_DEGREES, 0, 0);
  canvas.drawCircle(0, 0, radius + RAINBOW_BAND_PX / 2, paint);
  canvas.restore();
}

function paintRing(canvas: SkCanvas, radius: number) {
  'worklet';
  circleStroke(
    canvas,
    radius + RING_LINE_PX + HALO_GLOW_PX / 2,
    HALO_GLOW,
    RING_GLOW_OPACITY,
    HALO_GLOW_PX
  );
  circleStroke(canvas, radius + RING_LINE_PX / 2, HALO_LINE, RING_LINE_OPACITY, RING_LINE_PX);
}

function paintMarks(canvas: SkCanvas, kind: HaloKind, radius: number) {
  'worklet';
  if (kind === 'eraser') paintEraser(canvas, radius);
  else if (kind === 'magic') paintRainbowBand(canvas, radius);
  else paintRing(canvas, radius);
}

// The same marks PointerHalos.web.tsx draws in SVG, centred on each contact in ink-plane pixels.
// A halo still fading takes one opacity layer, as the SVG group does, so its marks never darken
// where they meet.
export function paintHalos(
  canvas: SkCanvas,
  shown: readonly ShownHalo[],
  now: number,
  reduced: boolean
) {
  'worklet';
  for (const entry of shown) {
    const { scale, opacity } = haloPose(entry, now, reduced);
    if (opacity <= 0) continue;
    const { kind, x, y, size } = entry.halo;
    const radius = size / 2;
    canvas.save();
    canvas.translate(x, y);
    canvas.scale(scale, scale);
    if (opacity < 1) {
      const extent =
        radius + Math.max(RING_LINE_PX + HALO_GLOW_PX, RAINBOW_BAND_PX) + LAYER_MARGIN_PX;
      const layer = Skia.Paint();
      layer.setAlphaf(opacity);
      canvas.saveLayer(layer, Skia.XYWHRect(-extent, -extent, extent * 2, extent * 2));
    }
    paintMarks(canvas, kind, radius);
    if (opacity < 1) canvas.restore();
    canvas.restore();
  }
}
