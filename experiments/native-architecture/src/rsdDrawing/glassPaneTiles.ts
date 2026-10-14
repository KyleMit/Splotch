import {
  FEATHER_REACH_SIGMAS,
  edgeFeather,
  type PaneShape,
  type Rect,
} from '../../../../web/src/lib/glassPaneGeometry';

// Color stops per feathered tile. The feather is a smooth ease, so this many straight pieces stay
// within about one percent of its alpha.
const FEATHER_STOPS = 16;
// Below this alpha a tile shows nothing, and above its complement it is solid.
const ALPHA_EPSILON = 0.002;
// A corner's round feather is centered this many blur sigmas inside a square corner, or this many
// past a rounded corner's arc. Measured against shipping's blurred mask, the radial fade then stays
// within five percent of it; centered on the corner of the solid region it overshoots by a fifth.
const CORNER_DEPTH_SIGMAS = 1.75;
const ROUNDED_CORNER_DEPTH_SIGMAS = 0.75;

// A plain color laid over the ink at `alpha` times the pane's coverage.
export type PaneInk = Readonly<{ rgb: string; alpha: number }>;

type GlassTile = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
  backgroundColor?: string;
  experimental_backgroundImage?: string;
}>;

type Box = Readonly<{ left: number; top: number; right: number; bottom: number }>;

// How a tile's coverage varies: flat; across one axis from a straight shape edge, `inward` pointing
// into the shape; or around a corner whose solid region ends `depth` from its center.
type Fade =
  | Readonly<{ kind: 'solid' }>
  | Readonly<{ kind: 'edge'; axis: 'x' | 'y'; edge: number; inward: 1 | -1 }>
  | Readonly<{ kind: 'corner'; x: number; y: number; depth: number }>;

type Piece = Readonly<{ box: Box; fade: Fade }>;
type Feather = Exclude<Fade, { kind: 'solid' }>;

function boxOf(rect: Rect): Box {
  return {
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
  };
}

function overlap(a: Box, b: Box): Box | null {
  const box = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return box.right > box.left && box.bottom > box.top ? box : null;
}

// What is left of `box` outside `hole`: at most a band above, one below, and one to each side.
function without(box: Box, hole: Box): Box[] {
  const cut = overlap(box, hole);
  if (!cut) return [box];
  const parts: Box[] = [
    { ...box, bottom: cut.top },
    { ...box, top: cut.bottom },
    { left: box.left, top: cut.top, right: cut.left, bottom: cut.bottom },
    { left: cut.right, top: cut.top, right: box.right, bottom: cut.bottom },
  ];
  return parts.filter((part) => part.right > part.left && part.bottom > part.top);
}

// A shape's nine-slice: its solid middle, a straight feather along each side, and a round one at
// each corner.
function slices(rect: Rect, sigma: number) {
  const reach = FEATHER_REACH_SIGMAS * sigma;
  const depth = Math.max(
    CORNER_DEPTH_SIGMAS * sigma,
    (rect.radius ?? 0) + ROUNDED_CORNER_DEPTH_SIGMAS * sigma
  );
  const { left, top, right, bottom } = boxOf(rect);
  const xs = [left - reach, left + depth, right - depth, right + reach];
  const ys = [top - reach, top + depth, bottom - depth, bottom + reach];
  const pieces: Piece[] = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const box = { left: xs[column], top: ys[row], right: xs[column + 1], bottom: ys[row + 1] };
      const fade: Fade =
        row === 1 && column === 1
          ? { kind: 'solid' }
          : column === 1
            ? { kind: 'edge', axis: 'y', edge: row ? bottom : top, inward: row ? -1 : 1 }
            : row === 1
              ? { kind: 'edge', axis: 'x', edge: column ? right : left, inward: column ? -1 : 1 }
              : { kind: 'corner', x: xs[column ? 2 : 1], y: ys[row ? 2 : 1], depth };
      pieces.push({ box, fade });
    }
  }
  return { solid: pieces[4].box, pieces };
}

function color(ink: PaneInk, coverage: number) {
  return `rgb(${ink.rgb} / ${+(ink.alpha * coverage).toFixed(3)})`;
}

function stops(ink: PaneInk, length: number, coverageAt: (offset: number) => number) {
  return Array.from({ length: FEATHER_STOPS }, (_, index) => {
    const offset = (length * index) / (FEATHER_STOPS - 1);
    return `${color(ink, coverageAt(offset))} ${+offset.toFixed(2)}px`;
  }).join(', ');
}

// Every coverage the fade takes over the box, at its corners and along the way, bounds it: a
// corner fade's coverage falls with distance from a center the box never straddles.
function extremes(box: Box, fade: Feather, sigma: number) {
  if (fade.kind === 'edge') {
    const [from, to] = fade.axis === 'x' ? [box.left, box.right] : [box.top, box.bottom];
    return [from, to].map((at) => edgeFeather(fade.inward * (at - fade.edge), sigma));
  }
  const dx = [box.left - fade.x, box.right - fade.x].map(Math.abs);
  const dy = [box.top - fade.y, box.bottom - fade.y].map(Math.abs);
  const near = Math.hypot(
    box.left <= fade.x && fade.x <= box.right ? 0 : Math.min(...dx),
    box.top <= fade.y && fade.y <= box.bottom ? 0 : Math.min(...dy)
  );
  const far = Math.hypot(Math.max(...dx), Math.max(...dy));
  return [near, far].map((distance) => edgeFeather(fade.depth - distance, sigma));
}

function tile(box: Box, fade: Fade, sigma: number, ink: PaneInk): GlassTile | null {
  const place = {
    left: box.left,
    top: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
  };
  const solid = { ...place, backgroundColor: color(ink, 1) };
  if (fade.kind === 'solid') return solid;
  const [a, b] = extremes(box, fade, sigma);
  if (Math.max(a, b) < ALPHA_EPSILON) return null;
  if (Math.min(a, b) > 1 - ALPHA_EPSILON) return solid;
  if (fade.kind === 'edge') {
    const [start, length, direction] =
      fade.axis === 'x'
        ? [box.left, place.width, 'to right']
        : [box.top, place.height, 'to bottom'];
    const coverage = (offset: number) =>
      edgeFeather(fade.inward * (start + offset - fade.edge), sigma);
    return {
      ...place,
      experimental_backgroundImage: `linear-gradient(${direction}, ${stops(ink, length, coverage)})`,
    };
  }
  const radius = fade.depth + FEATHER_REACH_SIGMAS * sigma;
  const center = `${+(fade.x - box.left).toFixed(2)}px ${+(fade.y - box.top).toFixed(2)}px`;
  const coverage = (offset: number) => edgeFeather(fade.depth - offset, sigma);
  // A round ellipse rather than `circle <radius>`: React Native's parser takes the token after a
  // lone radius as a second one, swallowing the `at` and centering the fade in the tile.
  return {
    ...place,
    experimental_backgroundImage: `radial-gradient(ellipse ${radius}px ${radius}px at ${center}, ${stops(ink, radius, coverage)})`,
  };
}

// Shipping blurs each pane's shapes together and reads the blur through its feather table, a mask
// a native view cannot draw. Here each shape is nine-sliced into plain gradient views instead, and
// a slice gives way wherever another shape of the same pane is already solid, so a union never
// covers the ink twice there.
export function glassPaneTiles(shape: PaneShape, ink: PaneInk): GlassTile[] {
  const clip = boxOf(shape.clip);
  const shapes = shape.rects.map((rect) => slices(rect, shape.sigma));
  return shapes.flatMap(({ pieces }, index) =>
    pieces.flatMap(({ box, fade }) => {
      const holes = shapes
        .filter((_, other) => (fade.kind === 'solid' ? other < index : other !== index))
        .map(({ solid }) => solid);
      const clipped = overlap(box, clip);
      const parts = holes.reduce<Box[]>(
        (remaining, hole) => remaining.flatMap((part) => without(part, hole)),
        clipped ? [clipped] : []
      );
      return parts.flatMap((part) => tile(part, fade, shape.sigma, ink) ?? []);
    })
  );
}
