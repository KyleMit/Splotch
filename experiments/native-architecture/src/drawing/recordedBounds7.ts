import { exact7, record7, arrayItem7, isAllocationCursor7 } from './recordedGuards7';
import {
  MAX_CONTACTS_7,
  MAX_GEOMETRY_7,
  MAX_RETAINED_INPUTS_7,
  MAX_RETAINED_OPS_7,
  MAX_SAVED_BYTES_7,
} from './recordedTypes7';

const MAX_JSON_DEPTH_7 = 7;
const MAX_OBJECT_KEYS_7 = 6;
type Counts7 = { contacts: number; inputs: number; ops: number; geometry: number };

function charge7(counts: Counts7, key: keyof Counts7, amount: number, maximum: number) {
  if (amount > maximum - counts[key]) throw new Error(`The v7 ${key} budget is exhausted.`);
  counts[key] += amount;
}
function countMove7(value: unknown, counts: Counts7) {
  if (exact7(value, ['kind']) && value.kind === 'drain') return;
  if (
    !exact7(value, ['kind', 'contact', 'samples']) ||
    !Array.isArray(value.samples) ||
    (value.kind !== 'start' && value.kind !== 'move' && value.kind !== 'end')
  )
    throw new Error('Invalid v7 input shape.');
  charge7(counts, 'geometry', value.samples.length, MAX_GEOMETRY_7);
}
function countOp7(value: unknown, counts: Counts7) {
  if (exact7(value, ['kind']) && value.kind === 'crayonFlush') return;
  if (!record7(value)) throw new Error('Invalid v7 op shape.');
  if (
    (exact7(value, ['kind', 'contact', 'at']) && value.kind === 'dot') ||
    (exact7(value, ['kind', 'contact', 'seed', 'at']) && value.kind === 'crayonDot')
  ) {
    charge7(counts, 'geometry', 1, MAX_GEOMETRY_7);
    return;
  }
  if (
    ((exact7(value, ['kind', 'contact', 'start', 'segments']) && value.kind === 'path') ||
      (exact7(value, ['kind', 'contact', 'seed', 'start', 'segments']) &&
        value.kind === 'crayonPath')) &&
    Array.isArray(value.segments)
  ) {
    charge7(counts, 'geometry', value.segments.length + 1, MAX_GEOMETRY_7);
    return;
  }
  throw new Error('Invalid v7 op shape.');
}
function countCommand7(value: unknown, counts: Counts7, highWater: number) {
  if (
    !exact7(value, ['firstSeed', 'granularity', 'styles', 'moves', 'ops']) ||
    !isAllocationCursor7(value.firstSeed) ||
    value.firstSeed > highWater ||
    !Array.isArray(value.styles) ||
    !value.styles.length ||
    !Array.isArray(value.moves) ||
    !Array.isArray(value.ops)
  )
    throw new Error('Invalid v7 command shape.');
  charge7(counts, 'contacts', value.styles.length, MAX_CONTACTS_7);
  charge7(counts, 'inputs', value.moves.length, MAX_RETAINED_INPUTS_7);
  charge7(counts, 'ops', value.ops.length, MAX_RETAINED_OPS_7);
  for (let i = 0; i < value.moves.length; i++) countMove7(arrayItem7(value.moves, i), counts);
  for (let i = 0; i < value.ops.length; i++) countOp7(arrayItem7(value.ops, i), counts);
}
function countDrawing7(value: unknown) {
  if (
    !exact7(value, ['version', 'paper', 'pageId', 'rainbow', 'seedCursor', 'commands']) ||
    !isAllocationCursor7(value.seedCursor) ||
    !Array.isArray(value.commands) ||
    value.commands.length > MAX_CONTACTS_7
  )
    throw new Error('Invalid v7 drawing shape.');
  const counts: Counts7 = { contacts: 0, inputs: 0, ops: 0, geometry: 0 };
  for (let i = 0; i < value.commands.length; i++)
    countCommand7(arrayItem7(value.commands, i), counts, value.seedCursor);
}
function stringBytes7(value: string, charge: (bytes: number) => void) {
  charge(2);
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (
      code === 34 ||
      code === 92 ||
      code === 8 ||
      code === 9 ||
      code === 10 ||
      code === 12 ||
      code === 13
    )
      charge(2);
    else if (code < 32) charge(6);
    else if (code < 128) charge(1);
    else if (code < 2048) charge(2);
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      i + 1 < value.length &&
      value.charCodeAt(i + 1) >= 0xdc00 &&
      value.charCodeAt(i + 1) <= 0xdfff
    ) {
      charge(4);
      i++;
    } else if (code >= 0xd800 && code <= 0xdfff) charge(6);
    else charge(3);
  }
}
function objectBytes7(
  value: Record<string, unknown>,
  depth: number,
  visit: (v: unknown, d: number) => void,
  charge: (bytes: number) => void
) {
  charge(2);
  let count = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (++count > MAX_OBJECT_KEYS_7) throw new Error('Invalid v7 object size.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value'))
      throw new Error('V7 fields require data values.');
    if (count > 1) charge(1);
    stringBytes7(key, charge);
    charge(1);
    visit(descriptor.value, depth + 1);
  }
}
function wireBytes7(value: unknown) {
  let bytes = 0;
  function charge(amount: number) {
    if (amount > MAX_SAVED_BYTES_7 - bytes)
      throw new Error('The v7 saved byte budget is exhausted.');
    bytes += amount;
  }
  function visit(item: unknown, depth: number) {
    if (depth > MAX_JSON_DEPTH_7) throw new Error('Invalid v7 wire depth.');
    if (typeof item === 'string') return stringBytes7(item, charge);
    if (typeof item === 'number' && Number.isFinite(item))
      return charge(JSON.stringify(item).length);
    if (Array.isArray(item)) {
      if (item.length > MAX_RETAINED_OPS_7) throw new Error('Invalid v7 wire array size.');
      charge(2 + Math.max(0, item.length - 1));
      for (let i = 0; i < item.length; i++) visit(arrayItem7(item, i), depth + 1);
      return;
    }
    if (record7(item)) return objectBytes7(item, depth, visit, charge);
    throw new Error('Invalid v7 wire value.');
  }
  visit(value, 0);
  return bytes;
}
export function admitRecordedBounds7(value: unknown): number {
  countDrawing7(value);
  return wireBytes7(value);
}
