import {
  FilterMode,
  MipmapMode,
  Skia,
  type SkImage,
  type SkPicture,
} from '@shopify/react-native-skia';
import type { LiveStroke } from './contactCohort';
import type { LiveInkSource } from './liveInk';
import { extendsStrokes, type Stroke } from './model';
import { samePaperProjection, type PaperProjection, type PaperSize } from './paperSpace';
import { paperRasterBounds } from './pictureExport';
import { createInkLayer, type InkLayer } from './skiaInkLayer';
import type { InkPaintContext } from './skiaInkPainter';
import { orderedOps } from './inkOps';
import { perfTimed } from './perfProbe';

type Size = Readonly<{ width: number; height: number }>;
export type SceneInput = Readonly<{
  strokes: readonly Stroke[];
  size: Size;
  pixels: Size;
  // The appearance and paper the ink is drawn for: a change replays every op.
  key: string;
  context: InkPaintContext;
}>;

function sameLayer(a: SceneInput, b: SceneInput) {
  return (
    a.key === b.key &&
    a.size.width === b.size.width &&
    a.size.height === b.size.height &&
    a.pixels.width === b.pixels.width &&
    a.pixels.height === b.pixels.height &&
    a.context.bookFill === b.context.bookFill &&
    a.context.theme === b.context.theme &&
    a.context.pageId === b.context.pageId &&
    samePaperProjection(a.context.projection, b.context.projection)
  );
}

const recordScene = perfTimed('sceneRecord', (layer: InkLayer) => layer.scene());

const releasePicture = perfTimed('pictureRelease', (picture: SkPicture) => picture.dispose());

const paintLive = perfTimed('liveFlush', (layer: InkLayer, source: LiveInkSource) => {
  const steps = source.flush();
  layer.paint(steps);
  return steps;
});

// The paper region of the layer's own pixels, resampled onto a capture's grid as a base64 PNG.
function captureLayer(layer: InkLayer, projection: PaperProjection, grid: PaperSize): string {
  const image = layer.snapshot();
  const target = Skia.Surface.Make(grid.width, grid.height);
  try {
    if (!target) throw new Error('The picture could not be prepared.');
    const bounds = paperRasterBounds(projection, grid);
    const { view } = layer;
    target
      .getCanvas()
      .drawImageRectOptions(
        image,
        Skia.XYWHRect(
          view.left + bounds.x * view.scale,
          view.top + bounds.y * view.scale,
          bounds.width * view.scale,
          bounds.height * view.scale
        ),
        Skia.XYWHRect(0, 0, grid.width, grid.height),
        FilterMode.Linear,
        MipmapMode.None,
        Skia.Paint()
      );
    target.flush();
    const encoded = target.makeImageSnapshot();
    const base64 = encoded.encodeToBase64();
    encoded.dispose();
    return base64;
  } finally {
    image.dispose();
    target?.dispose();
  }
}

// The drawing's ink as one layer (skiaInkLayer.ts) and what it holds: the committed strokes it
// was built from, then the live strokes painted since, op by op. A commit of exactly those live
// strokes adopts the pixels already on the layer; any other change replays the drawing's ops and
// then the live cohort's recorded ops, so ink drawn before and after a rebuild is the same.
export function createInkScene() {
  let layer: InkLayer | null = null;
  let input: SceneInput | null = null;
  let base: readonly Stroke[] = [];
  let pending: LiveStroke[] = [];
  const painted = new Map<LiveStroke, number>();
  let shown = false;
  let picture: SkPicture | null = null;

  function rebuild(next: SceneInput, live: readonly LiveStroke[]) {
    const previous = layer;
    layer = null;
    previous?.dispose();
    const built = createInkLayer(next.size, next.pixels, next.context);
    try {
      built.paint(orderedOps(next.strokes));
      built.paint(orderedOps(live));
    } catch (error) {
      built.dispose();
      throw error;
    }
    layer = built;
    input = next;
    base = next.strokes;
    pending = [...live];
    painted.clear();
    for (const stroke of live) painted.set(stroke, stroke.ops.length);
    shown = false;
  }

  // The committed strokes are the layer's base followed by live strokes it painted in full, in
  // the order it painted them.
  function adopts(strokes: readonly Stroke[]) {
    if (!extendsStrokes(base, strokes)) return false;
    const added = strokes.length - base.length;
    if (added > pending.length) return false;
    for (let index = 0; index < added; index++) {
      const live = pending[index];
      if (
        !live.finished() ||
        live.snapshot() !== strokes[base.length + index] ||
        painted.get(live) !== live.ops.length
      )
        return false;
    }
    for (const stroke of pending.splice(0, added)) painted.delete(stroke);
    base = strokes;
    return true;
  }

  return {
    sync(next: SceneInput, live: readonly LiveStroke[]) {
      if (
        !layer ||
        !input ||
        !sameLayer(input, next) ||
        (next.strokes !== base && !adopts(next.strokes))
      )
        rebuild(next, live);
      else input = next;
      if (layer && pending.length === 0 && live.length === 0) layer.trim();
    },
    // Paints every sample the cohort took since the last flush. Ops are recorded even without a
    // layer, and a later rebuild replays them.
    flush(source: LiveInkSource) {
      if (!layer) {
        source.flush();
        return;
      }
      const steps = paintLive(layer, source);
      for (const step of steps) {
        if (!painted.has(step.stroke)) pending.push(step.stroke);
        painted.set(step.stroke, step.op + 1);
      }
      if (steps.length > 0) shown = false;
    },
    // Live strokes that finished and were not committed after all: a dropped cohort.
    orphaned(strokes: readonly Stroke[]) {
      return (
        pending.some((stroke) => stroke.finished()) &&
        !pending.every((stroke) => !stroke.finished() || strokes.includes(stroke.snapshot()))
      );
    },
    rebuild,
    // Hands `show` a new picture when ink changed since the last one, then releases the one
    // before, and with it the tile images only it still drew. The view keeps its own reference to
    // the picture it holds (skiaViewPicture.ts).
    present(show: (next: SkPicture) => void): boolean {
      if (!layer || shown) return false;
      const next = recordScene(layer);
      try {
        show(next);
      } catch (error) {
        next.dispose();
        throw error;
      }
      shown = true;
      if (picture) releasePicture(picture);
      picture = next;
      return true;
    },
    ready: () => layer !== null,
    base: () => base,
    idle: () => pending.length === 0,
    context: () => input?.context ?? null,
    snapshot: (): SkImage | null => layer?.snapshot() ?? null,
    // The committed ink on a capture's pixel grid.
    capture(projection: PaperProjection, grid: PaperSize): string {
      if (!layer || pending.length > 0) throw new Error('This picture is still being prepared.');
      return captureLayer(layer, projection, grid);
    },
    dispose() {
      picture?.dispose();
      picture = null;
      layer?.dispose();
      layer = null;
      input = null;
      pending = [];
      painted.clear();
    },
  };
}

export type InkScene = ReturnType<typeof createInkScene>;
