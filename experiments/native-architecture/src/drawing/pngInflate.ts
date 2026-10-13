import type { PngWork } from './pngWork';

const WINDOW_BYTES = 32768;
const ADLER_MODULUS = 65521;
const MAX_CODE_BITS = 15;
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const DYNAMIC_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

type Tree = {
  counts: Uint16Array;
  first: Uint16Array;
  offsets: Uint16Array;
  symbols: Uint16Array;
  max: number;
};
function invalid(): never {
  throw new Error('Picture capture returned invalid compressed PNG data.');
}

function tree(lengths: Uint8Array, kind: 'codes' | 'literal' | 'distance'): Tree {
  const counts = new Uint16Array(MAX_CODE_BITS + 1);
  let max = 0,
    populated = 0;
  for (const length of lengths) {
    if (length > MAX_CODE_BITS) invalid();
    if (length) {
      counts[length]++;
      populated++;
      max = Math.max(max, length);
    }
  }
  if (!populated && kind !== 'distance') invalid();
  let left = 1;
  for (let bits = 1; bits <= MAX_CODE_BITS; bits++) {
    left = left * 2 - counts[bits];
    if (left < 0) invalid();
  }
  if (left && populated && !(kind !== 'codes' && populated === 1 && max === 1)) invalid();
  const first = new Uint16Array(MAX_CODE_BITS + 1),
    offsets = new Uint16Array(MAX_CODE_BITS + 1);
  let code = 0,
    offset = 0;
  for (let bits = 1; bits <= MAX_CODE_BITS; bits++) {
    code = (code + counts[bits - 1]) * 2;
    first[bits] = code;
    offsets[bits] = offset;
    offset += counts[bits];
  }
  const symbols = new Uint16Array(populated),
    next = offsets.slice();
  lengths.forEach((length, symbol) => {
    if (length) symbols[next[length]++] = symbol;
  });
  return { counts, first, offsets, symbols, max };
}

function dynamicTrees(
  bits: (count: number) => number,
  symbol: (tree: Tree) => number,
  work: PngWork
) {
  const literalCount = bits(5) + 257,
    distanceCount = bits(5) + 1,
    codeCount = bits(4) + 4;
  if (literalCount > 286) invalid();
  work.charge(literalCount + distanceCount + 19 + (MAX_CODE_BITS + 1) * 3);
  const codeLengths = new Uint8Array(19);
  for (let index = 0; index < codeCount; index++) codeLengths[DYNAMIC_ORDER[index]] = bits(3);
  const codes = tree(codeLengths, 'codes');
  const lengths = new Uint8Array(literalCount + distanceCount);
  let index = 0;
  while (index < lengths.length) {
    const value = symbol(codes);
    if (value < 16) lengths[index++] = value;
    else {
      if (value === 16 && !index) invalid();
      const repeat = value === 16 ? bits(2) + 3 : value === 17 ? bits(3) + 3 : bits(7) + 11;
      const previous = value === 16 ? lengths[index - 1] : 0;
      if (index + repeat > lengths.length) invalid();
      lengths.fill(previous, index, index + repeat);
      index += repeat;
      work.charge(repeat);
    }
  }
  if (!lengths[256]) invalid();
  return [
    tree(lengths.subarray(0, literalCount), 'literal'),
    tree(lengths.subarray(literalCount), 'distance'),
  ];
}
function fixedTrees() {
  const lengths = new Uint8Array(288);
  lengths.fill(8, 0, 144);
  lengths.fill(9, 144, 256);
  lengths.fill(7, 256, 280);
  lengths.fill(8, 280);
  return [tree(lengths, 'literal'), tree(new Uint8Array(32).fill(5), 'distance')];
}

const FIXED_TREES = fixedTrees();

export async function inflatePng(
  read: () => number | null,
  expectedBytes: number,
  emit: (byte: number) => void,
  work: PngWork
) {
  function byte() {
    const value = read();
    if (value === null) invalid();
    work.charge();
    return value;
  }
  const cmf = byte(),
    flg = byte();
  if ((cmf & 15) !== 8 || cmf >>> 4 > 7 || ((cmf << 8) | flg) % 31 || flg & 32) invalid();
  const windowLimit = 1 << ((cmf >>> 4) + 8);
  const window = new Uint8Array(WINDOW_BYTES);
  let held = 0,
    bitsHeld = 0,
    produced = 0,
    adlerA = 1,
    adlerB = 0;
  function bits(count: number) {
    while (bitsHeld < count) {
      held |= byte() << bitsHeld;
      bitsHeld += 8;
    }
    const value = held & ((1 << count) - 1);
    held >>>= count;
    bitsHeld -= count;
    work.charge(count);
    return value;
  }
  function symbol(t: Tree) {
    let code = 0;
    for (let length = 1; length <= t.max; length++) {
      code = code * 2 + bits(1);
      const index = code - t.first[length];
      if (index >= 0 && index < t.counts[length]) return t.symbols[t.offsets[length] + index];
    }
    return invalid();
  }
  function output(value: number) {
    if (produced >= expectedBytes) invalid();
    window[produced % WINDOW_BYTES] = value;
    produced++;
    adlerA = (adlerA + value) % ADLER_MODULUS;
    adlerB = (adlerB + adlerA) % ADLER_MODULUS;
    work.charge();
    emit(value);
  }
  let final = false;
  while (!final) {
    final = bits(1) === 1;
    const kind = bits(2);
    if (kind === 0) {
      held = 0;
      bitsHeld = 0;
      const length = byte() | (byte() << 8),
        complement = byte() | (byte() << 8);
      if ((length ^ complement) !== 65535) invalid();
      for (let index = 0; index < length; index++) {
        output(byte());
        if (work.due()) await work.pause();
      }
    } else if (kind === 1 || kind === 2) {
      if (kind === 2) await work.pause();
      const [literal, distance] = kind === 1 ? FIXED_TREES : dynamicTrees(bits, symbol, work);
      for (;;) {
        const value = symbol(literal);
        if (value < 256) output(value);
        else if (value === 256) break;
        else {
          if (value > 285) invalid();
          const lengthIndex = value - 257;
          const length = LENGTH_BASE[lengthIndex] + bits(LENGTH_EXTRA[lengthIndex]);
          const distanceIndex = symbol(distance);
          if (distanceIndex > 29) invalid();
          const offset = DISTANCE_BASE[distanceIndex] + bits(DISTANCE_EXTRA[distanceIndex]);
          if (offset > produced || offset > windowLimit) invalid();
          for (let index = 0; index < length; index++) {
            output(window[(produced - offset) % WINDOW_BYTES]);
            if (work.due()) await work.pause();
          }
        }
        if (work.due()) await work.pause();
      }
    } else invalid();
    if (work.due()) await work.pause();
  }
  held = 0;
  bitsHeld = 0;
  const adler = (byte() * 0x1000000 + (byte() << 16) + (byte() << 8) + byte()) >>> 0;
  if (produced !== expectedBytes || adler !== ((adlerB << 16) | adlerA) >>> 0 || read() !== null)
    invalid();
  work.check();
}
