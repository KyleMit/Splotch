import { createHash } from 'node:crypto';
import { constants, deflateSync, inflateSync } from 'node:zlib';

export const CORPUS_VERSION = 'PNG_HOT_PATH_SYNTHETIC_3649_V1';
export const CHANNELS = 4;
export const EMPTY_ALPHA_THRESHOLD = 4;
export const WINDOW_BYTES = 32768;
export const CONTROL_WIDTH = 32;
export const CONTROL_HEIGHT = 32;
export const BENCHMARK_WIDTH = 128;
export const BENCHMARK_HEIGHT = 128;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_POLYNOMIAL = 0xedb88320;
const FILTERS = [0, 1, 2, 3, 4];
const COMPRESSIONS = ['stored', 'fixed', 'dynamic'];
const ALPHA_VALUES = [0, 3, 4, 255];
const CRC_BYTES = 4;
const IHDR_BYTES = 13;
const IDAT_START = PNG_SIGNATURE.length + IHDR_BYTES + 12;
const COLOR_COLUMN_MULTIPLIER = 13;
const COLOR_ROW_MULTIPLIER = 29;
const IDAT_SPLIT_BYTES = 3;
const STORED_COMPRESSION_LEVEL = 0;
const DYNAMIC_COMPRESSION_LEVEL = 9;

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ CRC_POLYNOMIAL : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function pngChunk(type, bytes = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type), bytes]);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(CRC_BYTES);
  length.writeUInt32BE(bytes.length);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function independentPredictor(filter, left, up, diagonal) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  const estimate = left + up - diagonal;
  const candidates = [left, up, diagonal];
  const distances = candidates.map((candidate) => Math.abs(estimate - candidate));
  return candidates[distances.indexOf(Math.min(...distances))];
}

export function generatedRows(width, height, alpha) {
  return Array.from({ length: height }, (_, y) =>
    Buffer.from(
      Array.from({ length: width * CHANNELS }, (_, x) =>
        x % CHANNELS === CHANNELS - 1
          ? alpha === 0
            ? (Math.floor(x / CHANNELS) + y) % EMPTY_ALPHA_THRESHOLD
            : alpha === EMPTY_ALPHA_THRESHOLD
              ? y === height - 1 && x === width * CHANNELS - 1
                ? alpha
                : 0
              : alpha
          : (x * COLOR_COLUMN_MULTIPLIER + y * COLOR_ROW_MULTIPLIER) % 256
      )
    )
  );
}

export function filterRows(rows, filter) {
  const encoded = [];
  let previous = Buffer.alloc(rows[0].length);
  for (const row of rows) {
    encoded.push(filter);
    for (let column = 0; column < row.length; column++) {
      const left = column < CHANNELS ? 0 : row[column - CHANNELS];
      const up = previous[column];
      const diagonal = column < CHANNELS ? 0 : previous[column - CHANNELS];
      const predictor = independentPredictor(filter, left, up, diagonal);
      encoded.push((row[column] - predictor + 256) % 256);
    }
    previous = row;
  }
  return Buffer.from(encoded);
}

export function compressedFixture(raw, compression) {
  const options = {
    stored: { level: STORED_COMPRESSION_LEVEL },
    fixed: { strategy: constants.Z_FIXED },
    dynamic: { level: DYNAMIC_COMPRESSION_LEVEL, strategy: constants.Z_HUFFMAN_ONLY },
  };
  if (!Object.hasOwn(options, compression)) throw new Error('Unknown synthetic compression.');
  const compressed = deflateSync(raw, options[compression]);
  const kind = (compressed[2] >>> 1) & 3;
  const expectedKind = { stored: 0, fixed: 1, dynamic: 2 }[compression];
  if (kind !== expectedKind)
    throw new Error(`Synthetic ${compression} fixture did not produce block kind ${expectedKind}.`);
  if (!inflateSync(compressed).equals(raw)) throw new Error('Independent inflate oracle mismatch.');
  return compressed;
}

export function pngFromCompressed(compressed, grid, chunksAfter = []) {
  const header = Buffer.alloc(IHDR_BYTES);
  header.writeUInt32BE(grid.width, 0);
  header.writeUInt32BE(grid.height, 4);
  header[8] = 8;
  header[9] = 6;
  const split = Math.min(IDAT_SPLIT_BYTES, compressed.length);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', compressed.subarray(0, split)),
    pngChunk('IDAT', compressed.subarray(split)),
    ...chunksAfter,
    pngChunk('IEND'),
  ]);
}

function validCase(width, height, filter, compression, alpha) {
  const grid = { width, height };
  const raw = filterRows(generatedRows(width, height, alpha), filter);
  const compressed = compressedFixture(raw, compression);
  const png = pngFromCompressed(compressed, grid);
  return {
    id: `${width}x${height}/filter-${filter}/${compression}/alpha-${alpha}`,
    grid,
    raw,
    compressed,
    png,
    base64: png.toString('base64'),
    expected: { status: 'accepted', empty: alpha < EMPTY_ALPHA_THRESHOLD },
    compression,
    filter,
    fixtureSHA256: sha256(png),
  };
}

export function correctnessCorpus() {
  const cases = [];
  for (const filter of FILTERS)
    for (const compression of COMPRESSIONS)
      for (const alpha of ALPHA_VALUES)
        cases.push(validCase(CONTROL_WIDTH, CONTROL_HEIGHT, filter, compression, alpha));
  // A compressed match after the history wraps exercises the ring read and write indices.
  for (const compression of COMPRESSIONS)
    cases.push(validCase(BENCHMARK_WIDTH, BENCHMARK_HEIGHT, 4, compression, 255));
  return cases;
}

export function benchmarkCorpus() {
  const cases = [];
  for (const filter of FILTERS)
    for (const compression of COMPRESSIONS)
      for (const alpha of [0, 255])
        cases.push(validCase(BENCHMARK_WIDTH, BENCHMARK_HEIGHT, filter, compression, alpha));
  return cases;
}

export function malformedCorpus() {
  const positive = validCase(CONTROL_WIDTH, CONTROL_HEIGHT, 4, 'fixed', 255);
  const make = (id, png, message) => ({
    id,
    grid: positive.grid,
    png,
    base64: png.toString('base64'),
    fixtureSHA256: sha256(png),
    expected: { status: 'rejected', message },
  });
  const badAdler = Buffer.from(positive.compressed);
  badAdler[badAdler.length - 1] ^= 1;
  const badIend = Buffer.from(positive.png);
  badIend[badIend.length - 1] ^= 1;
  const badIdat = Buffer.from(positive.png);
  const firstIdatBytes = badIdat.readUInt32BE(IDAT_START);
  badIdat[IDAT_START + 8 + firstIdatBytes] ^= 1;
  const invalidFilter = Buffer.from(positive.raw);
  invalidFilter[(positive.grid.height - 1) * (positive.grid.width * CHANNELS + 1)] = 5;
  const tooShort = deflateSync(positive.raw.subarray(0, positive.raw.length - 1), {
    level: STORED_COMPRESSION_LEVEL,
  });
  const tooLong = deflateSync(Buffer.concat([positive.raw, Buffer.from([0])]), {
    level: STORED_COMPRESSION_LEVEL,
  });
  return [
    make(
      'bad-adler-after-opaque-ink',
      pngFromCompressed(badAdler, positive.grid),
      'Picture capture returned invalid compressed PNG data.'
    ),
    make('bad-idat-crc', badIdat, 'Picture capture returned an invalid or unsupported PNG.'),
    make(
      'bad-iend-crc-after-opaque-ink',
      badIend,
      'Picture capture returned an invalid or unsupported PNG.'
    ),
    make(
      'png-trailing-byte',
      Buffer.concat([positive.png, Buffer.from([0])]),
      'Picture capture returned an invalid or unsupported PNG.'
    ),
    make(
      'repeated-iend',
      pngFromCompressed(positive.compressed, positive.grid, [pngChunk('IEND')]),
      'Picture capture returned an invalid or unsupported PNG.'
    ),
    make(
      'truncated-iend',
      positive.png.subarray(0, positive.png.length - 1),
      'Picture capture returned an invalid or unsupported PNG.'
    ),
    make(
      'zlib-trailing-byte',
      pngFromCompressed(Buffer.concat([positive.compressed, Buffer.from([0])]), positive.grid),
      'Picture capture returned invalid compressed PNG data.'
    ),
    make(
      'invalid-scanline-filter',
      pngFromCompressed(deflateSync(invalidFilter), positive.grid),
      'PNG scanline has an invalid filter.'
    ),
    make(
      'incomplete-scanline',
      pngFromCompressed(tooShort, positive.grid),
      'Picture capture returned invalid compressed PNG data.'
    ),
    make(
      'excess-scanline',
      pngFromCompressed(tooLong, positive.grid),
      'Picture capture returned invalid compressed PNG data.'
    ),
  ];
}

export async function decoderOutcome(decoder, fixture, isCurrent = () => true) {
  try {
    return {
      status: 'accepted',
      empty: await decoder.decode(fixture.base64, fixture.grid, isCurrent),
    };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { status: 'rejected', message: error.message };
  }
}
