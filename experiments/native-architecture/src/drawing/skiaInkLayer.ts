import {
  BlendMode,
  ClipOp,
  FilterMode,
  MipmapMode,
  Skia,
  type SkCanvas,
  type SkImage,
  type SkPaint,
  type SkPicture,
  type SkRect,
  type SkSurface,
} from '@shopify/react-native-skia';
import { CRAYON_COLOR_MIX, createCrayonPassTracker } from './crayon';
import type { Stroke } from './model';
import { paperProjectionView, semanticWidth, textureScale } from './paperSpace';
import {
  crayonPassBands,
  paintCrayonShape,
  paintPlainShape,
  plainOpPaint,
  type CrayonBands,
  type InkPaintContext,
} from './skiaInkPainter';
import { opRange, rangeShape, type InkStep, type OpRange, type OpShape } from './inkOps';

// Live ink uploads only the tiles a frame changed (the view draws a raster per tile), so a frame
// costs its new ink, not the paper. Smaller tiles upload less per frame and record more draws.
export const INK_TILE_PX = 256;
// Antialiasing reaches past an op's geometric bounds; dirty boxes cover it.
const AA_PAD_PX = 2;

type Size = Readonly<{ width: number; height: number }>;
// Device pixels, [x0, x1) × [y0, y1).
type Box = Readonly<{ x0: number; y0: number; x1: number; y1: number }>;
type CrayonStroke = Extract<Stroke, { brush: 'crayon' }>;

function union(a: Box | null, b: Box): Box {
  if (!a) return b;
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

function rect(box: Box): SkRect {
  return Skia.XYWHRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
}

function blendPaint(blend: BlendMode, alpha = 1) {
  const paint = Skia.Paint();
  paint.setBlendMode(blend);
  paint.setAlphaf(alpha);
  return paint;
}

function makeSurface(pixels: Size) {
  const made = Skia.Surface.Make(pixels.width, pixels.height);
  if (!made) throw new Error('The drawing paper could not be prepared.');
  return made;
}

// The paper's raster and how paper units land on it.
function createPaperRaster(pixels: Size, projection: InkPaintContext['projection']) {
  const surface = makeSurface(pixels);
  const canvas = surface.getCanvas();
  const view = paperProjectionView(projection, pixels);
  // Ops draw in paper units and stamps in device pixels; the canvas switches between them only
  // when a run of one kind ends, not around every op.
  let onPaper = false;
  return {
    surface,
    canvas,
    view,
    paperSpace() {
      if (onPaper) return;
      canvas.save();
      canvas.translate(view.left, view.top);
      canvas.scale(view.scale, view.scale);
      onPaper = true;
    },
    deviceSpace() {
      if (!onPaper) return;
      canvas.restore();
      onPaper = false;
    },
    // An op's device pixels: its points (and lead) padded by its stroke width, which covers the
    // widest band's half width and its round caps, plus antialiasing.
    deviceBox(shape: OpShape, width: number): Box | null {
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      for (const point of shape.lead ? [shape.lead, ...shape.points] : shape.points) {
        left = Math.min(left, point.x);
        top = Math.min(top, point.y);
        right = Math.max(right, point.x);
        bottom = Math.max(bottom, point.y);
      }
      const x0 = Math.floor(view.left + (left - width) * view.scale) - AA_PAD_PX;
      const y0 = Math.floor(view.top + (top - width) * view.scale) - AA_PAD_PX;
      const x1 = Math.ceil(view.left + (right + width) * view.scale) + AA_PAD_PX;
      const y1 = Math.ceil(view.top + (bottom + width) * view.scale) + AA_PAD_PX;
      const box = {
        x0: Math.max(0, x0),
        y0: Math.max(0, y0),
        x1: Math.min(pixels.width, x1),
        y1: Math.min(pixels.height, y1),
      };
      return box.x1 > box.x0 && box.y1 > box.y0 ? box : null;
    },
    // The device box in paper units, a pixel wider on each side: a clip over it covers the box.
    paperRect(box: Box): SkRect {
      return Skia.XYWHRect(
        (box.x0 - 1 - view.left) / view.scale,
        (box.y0 - 1 - view.top) / view.scale,
        (box.x1 - box.x0 + 2) / view.scale,
        (box.y1 - box.y0 + 2) / view.scale
      );
    },
  };
}
type PaperRaster = ReturnType<typeof createPaperRaster>;

type Tile = { box: Box; area: SkRect; src: SkRect; dst: SkRect; image: SkImage | null };

// The raster as the view draws it: one image per tile, re-snapshotted only where ink changed,
// and drawn only where ink has ever been.
function createInkTiles(raster: PaperRaster, size: Size, pixels: Size) {
  const columns = Math.ceil(pixels.width / INK_TILE_PX);
  const rows = Math.ceil(pixels.height / INK_TILE_PX);
  const scale = Math.min(size.width / pixels.width, size.height / pixels.height);
  const offsetX = (size.width - pixels.width * scale) / 2;
  const offsetY = (size.height - pixels.height * scale) / 2;
  const grid = Array.from({ length: columns * rows }, (_, index): Tile => {
    const x0 = (index % columns) * INK_TILE_PX;
    const y0 = Math.floor(index / columns) * INK_TILE_PX;
    const box = {
      x0,
      y0,
      x1: Math.min(pixels.width, x0 + INK_TILE_PX),
      y1: Math.min(pixels.height, y0 + INK_TILE_PX),
    };
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    return {
      box,
      area: rect(box),
      src: Skia.XYWHRect(0, 0, width, height),
      dst: Skia.XYWHRect(offsetX + x0 * scale, offsetY + y0 * scale, width * scale, height * scale),
      image: null,
    };
  });
  const inked = new Set<number>();
  const dirty = new Set<number>();
  const paint = Skia.Paint();
  function tilesIn(box: Box): number[] {
    const found: number[] = [];
    const c1 = Math.floor((box.x1 - 1) / INK_TILE_PX);
    const r1 = Math.floor((box.y1 - 1) / INK_TILE_PX);
    for (let row = Math.floor(box.y0 / INK_TILE_PX); row <= r1; row++)
      for (let column = Math.floor(box.x0 / INK_TILE_PX); column <= c1; column++)
        found.push(row * columns + column);
    return found;
  }
  return {
    grid,
    tilesIn,
    markDirty(box: Box | null) {
      if (!box) return;
      for (const index of tilesIn(box)) {
        dirty.add(index);
        inked.add(index);
      }
    },
    scene(): SkPicture {
      for (const index of dirty) {
        const tile = grid[index];
        tile.image?.dispose();
        tile.image = raster.surface.makeImageSnapshot(tile.area);
      }
      dirty.clear();
      const recorder = Skia.PictureRecorder();
      const target = recorder.beginRecording(Skia.XYWHRect(0, 0, size.width, size.height));
      for (const index of inked) {
        const { image, src, dst } = grid[index];
        if (image)
          target.drawImageRectOptions(image, src, dst, FilterMode.Linear, MipmapMode.None, paint);
      }
      return recorder.finishRecordingAsPicture();
    },
    dispose() {
      for (const tile of grid) tile.image?.dispose();
    },
  };
}
type InkTiles = ReturnType<typeof createInkTiles>;

// The open crayon glaze group (ADR-0065's pass buffer): wax accumulates on the pass buffer at full
// opacity and is glazed onto the ink beneath once, so overlapping chunks of one pass never mix
// with each other. `stamped` tiles have been glazed while the group stayed open; their pre-group
// pixels live on the under copy, and every later stamp restores them first.
type Group = {
  members: Map<Stroke, number>;
  lastFrame: number;
  pending: Box | null;
  ink: Box | null;
  stamped: Set<number>;
};

// A chunk joins the open group when it continues a pass the group holds, or starts a stroke that
// began while the group was being drawn: shipping shares one pass buffer between simultaneous
// crayon contacts. A cohort starts a frame after the last one ends, so a group never spans
// cohorts. A stroke saved without ops glazes each pass on its own, as it always has.
function joins(open: Group, stroke: Stroke, pass: number, frame: number | null) {
  const held = open.members.get(stroke);
  if (held !== undefined) return held === pass && frame !== null;
  return frame !== null && stroke.ops !== undefined && frame <= open.lastFrame + 1;
}

function createGlaze(raster: PaperRaster, tiles: InkTiles, pixels: Size) {
  const darken = blendPaint(BlendMode.Darken);
  const glaze = blendPaint(BlendMode.SrcOver, 1 - CRAYON_COLOR_MIX);
  const copy = blendPaint(BlendMode.Src);
  let pass: { surface: SkSurface; canvas: SkCanvas } | null = null;
  let under: SkSurface | null = null;
  let group: Group | null = null;

  // The pass buffer only ever takes wax in paper units, so its canvas stays there.
  function passBuffer() {
    if (pass) return pass;
    const surface = makeSurface(pixels);
    const canvas = surface.getCanvas();
    canvas.translate(raster.view.left, raster.view.top);
    canvas.scale(raster.view.scale, raster.view.scale);
    pass = { surface, canvas };
    return pass;
  }

  function keepPristine(open: Group, index: number) {
    under ??= makeSurface(pixels);
    const tile = tiles.grid[index];
    const pristine = raster.surface.makeImageSnapshot(tile.area);
    under.getCanvas().drawImage(pristine, tile.box.x0, tile.box.y0, copy);
    pristine.dispose();
    open.stamped.add(index);
  }

  // Glazes the group's wax onto the paper over its pending box: each pixel ends as its pre-group
  // value glazed with the wax the pass buffer holds, however many times it is restamped. A group
  // that stays open keeps the pre-group pixels of every tile it glazes, to restamp them later.
  function stamp(open: Group, keepOpen: boolean) {
    const box = open.pending;
    if (!box || !pass) return;
    open.pending = null;
    raster.deviceSpace();
    const restored: number[] = [];
    for (const index of tiles.tilesIn(box)) {
      if (open.stamped.has(index)) restored.push(index);
      else if (keepOpen) keepPristine(open, index);
    }
    const area = rect(box);
    const { canvas } = raster;
    if (restored.length > 0 && under) {
      const before = under.makeImageSnapshot(area);
      for (const index of restored) {
        canvas.save();
        canvas.clipRect(tiles.grid[index].area, ClipOp.Intersect, false);
        canvas.clipRect(area, ClipOp.Intersect, false);
        canvas.drawImage(before, box.x0, box.y0, copy);
        canvas.restore();
      }
      before.dispose();
    }
    const wax = pass.surface.makeImageSnapshot(area);
    canvas.drawImage(wax, box.x0, box.y0, darken);
    canvas.drawImage(wax, box.x0, box.y0, glaze);
    wax.dispose();
    tiles.markDirty(box);
  }

  function close() {
    const open = group;
    if (!open) return;
    stamp(open, false);
    group = null;
    if (open.ink && pass) {
      pass.canvas.save();
      pass.canvas.clipRect(raster.paperRect(open.ink), ClipOp.Intersect, false);
      pass.canvas.clear(Skia.Color('transparent'));
      pass.canvas.restore();
    }
  }

  function release() {
    group = null;
    pass?.surface.dispose();
    pass = null;
    under?.dispose();
    under = null;
  }

  return {
    close,
    // Deposits one chunk of a pass's wax, closing the open group first unless it joins it.
    deposit(stroke: Stroke, passIndex: number, frame: number | null, paint: () => Box | null) {
      if (group && !joins(group, stroke, passIndex, frame)) close();
      const open = (group ??= {
        members: new Map(),
        lastFrame: frame ?? -1,
        pending: null,
        ink: null,
        stamped: new Set(),
      });
      open.members.set(stroke, passIndex);
      if (frame !== null) open.lastFrame = Math.max(open.lastFrame, frame);
      const box = paint();
      if (box) {
        open.pending = union(open.pending, box);
        open.ink = union(open.ink, box);
      }
      if (!stroke.ops) close();
    },
    canvas: () => passBuffer().canvas,
    // Every op so far is on the paper, the open group's wax included.
    show() {
      if (group) stamp(group, true);
    },
    // Between cohorts no group is open: the pass buffer and the pre-group copy are released.
    trim() {
      close();
      release();
    },
    release,
  };
}

type PassTrack = {
  tracker: ReturnType<typeof createCrayonPassTracker>;
  scanned: number;
  breaks: number[];
  bands: { pass: number; bands: CrayonBands } | null;
};

// A crayon stroke's pass splits as far as its points have been painted, found one point at a
// time by the tracker crayonPasses replays a whole stroke with.
function createPassTracks(texel: number) {
  const tracks = new WeakMap<Stroke, PassTrack>();
  return (stroke: CrayonStroke, width: number, to: number) => {
    let track = tracks.get(stroke);
    if (!track) {
      track = {
        tracker: createCrayonPassTracker(stroke.points[0], width, texel),
        scanned: 1,
        breaks: [],
        bands: null,
      };
      tracks.set(stroke, track);
    }
    for (; track.scanned < to; track.scanned++)
      if (track.tracker.advance(stroke.points[track.scanned])) track.breaks.push(track.scanned);
    return track;
  };
}

function stepFrame(step: InkStep): number | null {
  return step.stroke.ops?.[step.op]?.[1] ?? null;
}

// One drawing's ink on a raster the size of the ink plane's pixels: committed ink and the live
// cohort painted op by op in paint order (ADR-0178). The same ops paint a rebuild, so a replay of
// a drawing's ops reproduces the pixels live drawing left, byte for byte.
export function createInkLayer(size: Size, pixels: Size, context: InkPaintContext) {
  const raster = createPaperRaster(pixels, context.projection);
  const tiles = createInkTiles(raster, size, pixels);
  const glaze = createGlaze(raster, tiles, pixels);
  const passTrack = createPassTracks(textureScale(context.paper));
  const plainPaints = new WeakMap<Stroke, SkPaint>();

  function paintCrayon(stroke: CrayonStroke, range: OpRange, frame: number | null) {
    const width = semanticWidth(stroke.width, context.paper);
    const track = passTrack(stroke, width, range.to);
    const starts = [range.from, ...track.breaks.filter((at) => at > range.from && at < range.to)];
    for (const [index, from] of starts.entries()) {
      const piece = { from, to: starts[index + 1] ?? range.to };
      const pass = track.breaks.filter((at) => at <= piece.from).length;
      glaze.deposit(stroke, pass, frame, () => {
        if (track.bands?.pass !== pass)
          track.bands = { pass, bands: crayonPassBands(stroke, pass, width, context) };
        const shape = rangeShape(stroke.points, piece);
        paintCrayonShape(glaze.canvas(), shape, track.bands.bands);
        return raster.deviceBox(shape, width);
      });
    }
  }

  function paintPlain(stroke: Exclude<Stroke, { brush: 'crayon' }>, range: OpRange) {
    glaze.close();
    const width = semanticWidth(stroke.width, context.paper);
    let paint = plainPaints.get(stroke);
    if (!paint) {
      paint = plainOpPaint(stroke, width, context);
      plainPaints.set(stroke, paint);
    }
    const shape = rangeShape(stroke.points, range);
    raster.paperSpace();
    paintPlainShape(raster.canvas, shape, width, paint);
    tiles.markDirty(raster.deviceBox(shape, width));
  }

  return {
    view: raster.view,
    paint(steps: readonly InkStep[]) {
      try {
        for (const step of steps) {
          const range = opRange(step.stroke, step.op);
          if (step.stroke.brush === 'crayon') paintCrayon(step.stroke, range, stepFrame(step));
          else paintPlain(step.stroke, range);
        }
      } finally {
        raster.deviceSpace();
      }
    },
    trim: glaze.trim,
    // The picture the ink view draws.
    scene(): SkPicture {
      glaze.show();
      return tiles.scene();
    },
    // The whole paper as it stands. It shares pixels until the next paint, which copies them.
    snapshot(): SkImage {
      glaze.show();
      return raster.surface.makeImageSnapshot();
    },
    dispose() {
      glaze.release();
      tiles.dispose();
      raster.surface.dispose();
    },
  };
}

export type InkLayer = ReturnType<typeof createInkLayer>;
