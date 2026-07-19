export interface CrayonPoint {
  x: number;
  y: number;
}

export interface CrayonPolygon {
  points: CrayonPoint[];
}

export interface CrayonStrokeGeometry {
  radius: number;
  spacing: number;
  pending: CrayonPoint[];
  inputPoint: CrayonPoint;
  distanceToNext: number;
  startOffset: CrayonPoint | null;
  passStarted: boolean;
}

export const CRAYON_TILE_SIZE = 256;
const CRAYON_ALPHA_VALLEY = 0.05;
const CRAYON_ALPHA_PEAK = 0.97;
const CRAYON_ALPHA_GAMMA = 0.55;
const CAP_STEPS = 10;
const EPSILON = 0.001;

const tintedTiles = new Map<string, HTMLCanvasElement>();
const patternsByContext = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

function wrapped(value: number, period: number): number {
  const remainder = value % period;
  return remainder < 0 ? remainder + period : remainder;
}

function hash2d(x: number, y: number, seed: number): number {
  let value = Math.imul(x ^ seed, 0x27d4eb2d) ^ Math.imul(y + seed, 0x165667b1);
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return (value >>> 0) / 0xffffffff;
}

function fade(value: number): number {
  return value * value * (3 - 2 * value);
}

function valueNoise(x: number, y: number, cells: number, seed: number): number {
  const gx = (x / CRAYON_TILE_SIZE) * cells;
  const gy = (y / CRAYON_TILE_SIZE) * cells;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = fade(gx - x0);
  const ty = fade(gy - y0);
  const h00 = hash2d(wrapped(x0, cells), wrapped(y0, cells), seed);
  const h10 = hash2d(wrapped(x0 + 1, cells), wrapped(y0, cells), seed);
  const h01 = hash2d(wrapped(x0, cells), wrapped(y0 + 1, cells), seed);
  const h11 = hash2d(wrapped(x0 + 1, cells), wrapped(y0 + 1, cells), seed);
  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return top + (bottom - top) * ty;
}

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

export function crayonDepositAlphaAt(x: number, y: number): number {
  const warpX = (valueNoise(x, y, 4, 0x45d9) - 0.5) * 3;
  const warpY = (valueNoise(x, y, 4, 0x9e37) - 0.5) * 3;
  const wx = x + warpX;
  const wy = y + warpY;
  const height =
    valueNoise(wx, wy, 128, 0x51ed) * 0.48 +
    valueNoise(wx, wy, 64, 0xa341) * 0.28 +
    valueNoise(wx, wy, 32, 0xc801) * 0.14 +
    valueNoise(wx, wy, 16, 0xad90) * 0.07 +
    valueNoise(wx, wy, 8, 0x7e95) * 0.03;
  const tooth = Math.pow(smoothstep(0.3, 0.7, height), CRAYON_ALPHA_GAMMA);
  return CRAYON_ALPHA_VALLEY + (CRAYON_ALPHA_PEAK - CRAYON_ALPHA_VALLEY) * tooth;
}

function colorChannels(color: string): [number, number, number] {
  const sample = document.createElement('canvas');
  sample.width = 1;
  sample.height = 1;
  const context = sample.getContext('2d')!;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const data = context.getImageData(0, 0, 1, 1).data;
  return [data[0], data[1], data[2]];
}

function buildTintedTile(color: string): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = CRAYON_TILE_SIZE;
  tile.height = CRAYON_TILE_SIZE;
  const context = tile.getContext('2d')!;
  const image = context.createImageData(CRAYON_TILE_SIZE, CRAYON_TILE_SIZE);
  const [red, green, blue] = colorChannels(color);
  for (let y = 0; y < CRAYON_TILE_SIZE; y++) {
    for (let x = 0; x < CRAYON_TILE_SIZE; x++) {
      const index = (y * CRAYON_TILE_SIZE + x) * 4;
      image.data[index] = red;
      image.data[index + 1] = green;
      image.data[index + 2] = blue;
      image.data[index + 3] = Math.round(crayonDepositAlphaAt(x, y) * 255);
    }
  }
  context.putImageData(image, 0, 0);
  return tile;
}

export function warmCrayonColor(color: string) {
  if (!tintedTiles.has(color)) tintedTiles.set(color, buildTintedTile(color));
}

export function crayonPatternFor(
  target: CanvasRenderingContext2D,
  color: string
): CanvasPattern | null {
  let contextPatterns = patternsByContext.get(target);
  if (!contextPatterns) {
    contextPatterns = new Map();
    patternsByContext.set(target, contextPatterns);
  }
  const cached = contextPatterns.get(color);
  if (cached) return cached;
  warmCrayonColor(color);
  const pattern = target.createPattern(tintedTiles.get(color)!, 'repeat');
  if (pattern) contextPatterns.set(color, pattern);
  return pattern;
}

function distance(a: CrayonPoint, b: CrayonPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function direction(a: CrayonPoint, b: CrayonPoint): CrayonPoint | null {
  const length = distance(a, b);
  if (length < EPSILON) return null;
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}

function normal(directionValue: CrayonPoint, radius: number): CrayonPoint {
  return { x: -directionValue.y * radius, y: directionValue.x * radius };
}

function joinOffset(
  previousDirection: CrayonPoint,
  nextDirection: CrayonPoint,
  radius: number
): CrayonPoint | null {
  const dot = previousDirection.x * nextDirection.x + previousDirection.y * nextDirection.y;
  if (dot < -0.7) return null;
  const previousNormal = normal(previousDirection, 1);
  const nextNormal = normal(nextDirection, 1);
  const x = previousNormal.x + nextNormal.x;
  const y = previousNormal.y + nextNormal.y;
  const length = Math.hypot(x, y);
  if (length < EPSILON) return null;
  return { x: (x / length) * radius, y: (y / length) * radius };
}

function add(a: CrayonPoint, b: CrayonPoint): CrayonPoint {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: CrayonPoint, b: CrayonPoint): CrayonPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}

function capPoints(
  center: CrayonPoint,
  directionValue: CrayonPoint,
  radius: number,
  atEnd: boolean
): CrayonPoint[] {
  const angle = Math.atan2(directionValue.y, directionValue.x);
  const from = atEnd ? angle + Math.PI / 2 : angle - Math.PI / 2;
  const to = from - Math.PI;
  const points: CrayonPoint[] = [];
  for (let index = 1; index < CAP_STEPS; index++) {
    const capAngle = from + ((to - from) * index) / CAP_STEPS;
    points.push({
      x: center.x + Math.cos(capAngle) * radius,
      y: center.y + Math.sin(capAngle) * radius,
    });
  }
  return points;
}

function segmentPolygon(
  start: CrayonPoint,
  end: CrayonPoint,
  startOffset: CrayonPoint,
  endOffset: CrayonPoint,
  startCap: boolean,
  endCap: boolean
): CrayonPolygon {
  const directionValue = direction(start, end)!;
  const points = [add(start, startOffset), add(end, endOffset)];
  if (endCap)
    points.push(...capPoints(end, directionValue, Math.hypot(endOffset.x, endOffset.y), true));
  points.push(subtract(end, endOffset), subtract(start, startOffset));
  if (startCap)
    points.push(
      ...capPoints(start, directionValue, Math.hypot(startOffset.x, startOffset.y), false)
    );
  return { points };
}

function tapPolygon(center: CrayonPoint, radius: number): CrayonPolygon {
  const points: CrayonPoint[] = [];
  for (let index = 0; index < CAP_STEPS * 2; index++) {
    const angle = (index / (CAP_STEPS * 2)) * Math.PI * 2;
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return { points };
}

export function createCrayonStrokeGeometry(
  start: CrayonPoint,
  radius: number
): CrayonStrokeGeometry {
  return {
    radius,
    spacing: Math.min(4, Math.max(1.5, radius * 0.5)),
    pending: [{ ...start }],
    inputPoint: { ...start },
    distanceToNext: Math.min(4, Math.max(1.5, radius * 0.5)),
    startOffset: null,
    passStarted: false,
  };
}

function drainCompleteSegments(state: CrayonStrokeGeometry): CrayonPolygon[] {
  const polygons: CrayonPolygon[] = [];
  while (state.pending.length >= 3) {
    const [start, end, next] = state.pending;
    const previousDirection = direction(start, end);
    const nextDirection = direction(end, next);
    if (!previousDirection || !nextDirection) {
      state.pending.shift();
      continue;
    }
    const startOffset = state.startOffset ?? normal(previousDirection, state.radius);
    const endOffset = joinOffset(previousDirection, nextDirection, state.radius);
    if (!endOffset) {
      const terminalOffset = normal(previousDirection, state.radius);
      polygons.push(
        segmentPolygon(start, end, startOffset, terminalOffset, !state.passStarted, true)
      );
      state.startOffset = normal(nextDirection, state.radius);
      state.passStarted = false;
    } else {
      polygons.push(segmentPolygon(start, end, startOffset, endOffset, !state.passStarted, false));
      state.startOffset = endOffset;
      state.passStarted = true;
    }
    state.pending.shift();
  }
  return polygons;
}

function appendResampledPoint(state: CrayonStrokeGeometry, target: CrayonPoint) {
  let from = state.inputPoint;
  let remaining = distance(from, target);
  if (remaining < EPSILON) return;
  while (remaining + EPSILON >= state.distanceToNext) {
    const ratio = state.distanceToNext / remaining;
    from = {
      x: from.x + (target.x - from.x) * ratio,
      y: from.y + (target.y - from.y) * ratio,
    };
    state.pending.push(from);
    remaining = distance(from, target);
    state.distanceToNext = state.spacing;
  }
  state.distanceToNext -= remaining;
  state.inputPoint = { ...target };
}

export function extendCrayonStrokeGeometry(
  state: CrayonStrokeGeometry,
  points: CrayonPoint[]
): CrayonPolygon[] {
  const polygons: CrayonPolygon[] = [];
  for (const point of points) {
    appendResampledPoint(state, point);
    polygons.push(...drainCompleteSegments(state));
  }
  return polygons;
}

export function finishCrayonStrokeGeometry(state: CrayonStrokeGeometry): CrayonPolygon[] {
  if (distance(state.pending[state.pending.length - 1], state.inputPoint) >= EPSILON) {
    state.pending.push({ ...state.inputPoint });
  }
  const polygons = drainCompleteSegments(state);
  if (state.pending.length >= 2) {
    const start = state.pending[0];
    const end = state.pending[state.pending.length - 1];
    const directionValue = direction(start, end);
    if (directionValue) {
      const startOffset = state.startOffset ?? normal(directionValue, state.radius);
      const endOffset = normal(directionValue, state.radius);
      polygons.push(segmentPolygon(start, end, startOffset, endOffset, !state.passStarted, true));
      return polygons;
    }
  }
  if (!state.passStarted && polygons.length === 0)
    polygons.push(tapPolygon(state.inputPoint, state.radius));
  return polygons;
}

export function sampleQuadratic(
  start: CrayonPoint,
  control: CrayonPoint,
  end: CrayonPoint,
  maxStep: number
): CrayonPoint[] {
  const approximateLength = distance(start, control) + distance(control, end);
  const steps = Math.max(1, Math.ceil(approximateLength / Math.max(maxStep, 0.5)));
  const points: CrayonPoint[] = [];
  for (let index = 1; index <= steps; index++) {
    const t = index / steps;
    const inverse = 1 - t;
    points.push({
      x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
      y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    });
  }
  return points;
}
