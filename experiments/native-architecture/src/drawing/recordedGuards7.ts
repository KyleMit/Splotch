import { MAGIC_RAINBOW_COUNT, MAX_CRAYON_SEED } from './brushes';
import { isPaintColor } from './palette';
import { isStrokeWidthPx } from './strokeWidth';
import { PAPER_WIDTH, PAPER_HEIGHT, readDrawingPaper, type AdoptedPaper } from './paperSpace';
import { MAX_CONTACTS_7, MAX_GEOMETRY_7, type Point7, type Style7, type Input7, type Op7, type Segment7, type InkWidth7, type EraserWidth7, type Granularity7 } from './recordedTypes7';

export function record7(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function exact7(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!record7(value)) return false;
  let count = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (!keys.includes(key) || ++count > keys.length) return false;
  }
  return count === keys.length && keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
  });
}
export function arrayItem7(array: readonly unknown[], index: number): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(array, index);
  if (!descriptor || !Object.hasOwn(descriptor, 'value'))
    throw new Error('V7 arrays require present data entries.');
  return descriptor.value;
}
export function mapArray7<T>(array: readonly unknown[], read: (value: unknown) => T): T[] {
  const result: T[] = [];
  for (let i = 0; i < array.length; i++) result.push(read(arrayItem7(array, i)));
  return result;
}
export function integer7(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
export function isAllocationCursor7(value: unknown): value is number {
  return integer7(value, 1, MAX_CRAYON_SEED + 1);
}
export function rainbow7(value: unknown): number {
  if (!integer7(value, 0, MAGIC_RAINBOW_COUNT - 1)) throw new Error('Invalid v7 rainbow.');
  return value;
}
function coordinate7(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
}
export function point7(value: unknown): Point7 {
  if (!exact7(value, ['x', 'y']) || !coordinate7(value.x, PAPER_WIDTH) ||
      !coordinate7(value.y, PAPER_HEIGHT)) throw new Error('Invalid v7 point.');
  return { x: value.x, y: value.y };
}
function inkWidth7(value: unknown): value is InkWidth7 {
  return isStrokeWidthPx('pen', value);
}
function eraserWidth7(value: unknown): value is EraserWidth7 {
  return isStrokeWidthPx('eraser', value);
}
export function style7(value: unknown): Style7 {
  if (!record7(value)) throw new Error('Invalid v7 style.');
  if ((value.brush === 'pen' || value.brush === 'crayon') &&
      exact7(value, ['brush', 'color', 'width']) && isPaintColor(value.color) &&
      inkWidth7(value.width))
    return { brush: value.brush, color: value.color, width: value.width };
  if (value.brush === 'magic' && exact7(value, ['brush', 'rainbow', 'width']) &&
      inkWidth7(value.width))
    return { brush: value.brush, rainbow: rainbow7(value.rainbow), width: value.width };
  if (value.brush === 'eraser' && exact7(value, ['brush', 'width']) &&
      eraserWidth7(value.width)) return { brush: value.brush, width: value.width };
  throw new Error('Invalid v7 style.');
}
export function input7(value: unknown, contacts: number, remainingGeometry: number): Input7 {
  if (exact7(value, ['kind']) && value.kind === 'drain') return { kind: 'drain' };
  if (!exact7(value, ['kind', 'contact', 'samples']) ||
      !integer7(value.contact, 0, contacts - 1) || !Array.isArray(value.samples) ||
      value.samples.length > Math.min(MAX_GEOMETRY_7, remainingGeometry) ||
      (value.kind !== 'start' && value.kind !== 'move' && value.kind !== 'end'))
    throw new Error('Invalid v7 move group.');
  const samples = mapArray7(value.samples, point7);
  if ((value.kind === 'start' && samples.length !== 1) ||
      (value.kind === 'move' && samples.length === 0) ||
      (value.kind === 'end' && samples.length !== 0)) throw new Error('Invalid v7 move samples.');
  return { kind: value.kind, contact: value.contact, samples };
}
function segment7(value: unknown): Segment7 {
  if (!exact7(value, ['cx', 'cy', 'x', 'y']) || !coordinate7(value.cx, PAPER_WIDTH) ||
      !coordinate7(value.cy, PAPER_HEIGHT) || !coordinate7(value.x, PAPER_WIDTH) ||
      !coordinate7(value.y, PAPER_HEIGHT)) throw new Error('Invalid v7 quadratic segment.');
  return { cx: value.cx, cy: value.cy, x: value.x, y: value.y };
}
export function op7(value: unknown, contacts: number): Op7 {
  if (exact7(value, ['kind']) && value.kind === 'crayonFlush') return { kind: 'crayonFlush' };
  if (!record7(value) || !integer7(value.contact, 0, contacts - 1)) throw new Error('Invalid v7 op.');
  if (value.kind === 'dot' && exact7(value, ['kind', 'contact', 'at']))
    return { kind: value.kind, contact: value.contact, at: point7(value.at) };
  if (value.kind === 'crayonDot' && exact7(value, ['kind', 'contact', 'seed', 'at']) &&
      integer7(value.seed, 1, MAX_CRAYON_SEED))
    return { kind: value.kind, contact: value.contact, seed: value.seed, at: point7(value.at) };
  if ((value.kind === 'path' || value.kind === 'crayonPath') &&
      Array.isArray(value.segments) && value.segments.length > 0 && value.segments.length <= MAX_GEOMETRY_7) {
    const segments = mapArray7(value.segments, segment7);
    const start = point7(value.start);
    if (value.kind === 'path' && exact7(value, ['kind', 'contact', 'start', 'segments']))
      return { kind: value.kind, contact: value.contact, start, segments };
    if (value.kind === 'crayonPath' && exact7(value, ['kind', 'contact', 'seed', 'start', 'segments']) &&
        integer7(value.seed, 1, MAX_CRAYON_SEED))
      return { kind: value.kind, contact: value.contact, seed: value.seed, start, segments };
  }
  throw new Error('Invalid v7 op.');
}

export function recorderConfiguration7(paper: AdoptedPaper, styles: readonly Style7[], granularity: Granularity7, firstSeed: number) {
  if (!isAllocationCursor7(firstSeed))
    throw new Error('Invalid v7 seed cursor.');
  if (!styles.length || styles.length > MAX_CONTACTS_7) throw new Error('Invalid v7 contact count.');
  const reference = readDrawingPaper(paper);
  if (reference.kind !== 'adopted') throw new Error('V7 ink requires adopted paper.');
  if (granularity !== 'per-move' && granularity !== 'per-frame') throw new Error('Invalid v7 granularity.');
  return { paper: reference, styles: mapArray7(styles, style7) };
}

export function recorderReference7(paper: AdoptedPaper, granularity: Granularity7, firstSeed: number): AdoptedPaper {
  if (!isAllocationCursor7(firstSeed))
    throw new Error('Invalid v7 seed cursor.');
  const reference = readDrawingPaper(paper);
  if (reference.kind !== 'adopted') throw new Error('V7 ink requires adopted paper.');
  if (granularity !== 'per-move' && granularity !== 'per-frame') throw new Error('Invalid v7 granularity.');
  return reference;
}
