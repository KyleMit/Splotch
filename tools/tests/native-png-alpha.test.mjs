import { afterEach, describe, expect, it, vi } from 'vitest';
import { deflateSync, constants } from 'node:zlib';
import { createPngAlphaDecoder } from '../../experiments/native-architecture/src/drawing/pngAlpha.ts';
import { inflatePng } from '../../experiments/native-architecture/src/drawing/pngInflate.ts';
import { createPngWork } from '../../experiments/native-architecture/src/drawing/pngWork.ts';

const grid = { width: 2, height: 2 };
function crc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type), bytes]);
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  checksum.writeUInt32BE(crc(body));
  return Buffer.concat([length, body, checksum]);
}
function filtered(rows, filter) {
  const output = [];
  let previous = new Uint8Array(rows[0].length);
  for (const row of rows) {
    output.push(filter);
    for (let index = 0; index < row.length; index++) {
      const left = index >= 4 ? row[index - 4] : 0,
        up = previous[index],
        diagonal = index >= 4 ? previous[index - 4] : 0;
      const p = left + up - diagonal;
      const candidates = [left, up, diagonal];
      const distances = candidates.map((value) => Math.abs(p - value));
      const nearest = candidates[distances.indexOf(Math.min(...distances))];
      const predicted = [0, left, up, Math.floor((left + up) / 2), nearest][filter];
      output.push((row[index] - predicted) & 255);
    }
    previous = row;
  }
  return Buffer.from(output);
}
function fixture({
  rows = [
    [12, 90, 255, 0, 12, 90, 255, 3],
    [90, 1, 5, 0, 99, 88, 77, 0],
  ],
  filter = 0,
  format = {},
  compression = {},
  before = [],
  after = [],
  split = false,
  raw,
  compressed,
} = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(format.width ?? rows[0].length / 4, 0);
  header.writeUInt32BE(format.height ?? rows.length, 4);
  header[8] = format.depth ?? 8;
  header[9] = format.type ?? 6;
  header[10] = format.compression ?? 0;
  header[11] = format.filter ?? 0;
  header[12] = format.interlace ?? 0;
  const zlib = compressed ?? deflateSync(raw ?? filtered(rows, filter), compression);
  const image = split
    ? [chunk('IDAT', zlib.subarray(0, 3)), chunk('IDAT', zlib.subarray(3))]
    : [chunk('IDAT', zlib)];
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    ...before,
    ...image,
    ...after,
    chunk('IEND'),
  ]);
}
function decode(bytes, expected = grid, current = () => true) {
  return createPngAlphaDecoder().decode(bytes.toString('base64'), expected, current);
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('bounded production PNG alpha observation', () => {
  it.each([0, 1, 2, 3, 4])(
    'reconstructs independent filter %i and subthreshold alpha',
    async (filter) => {
      await expect(decode(fixture({ filter, split: true }))).resolves.toBe(true);
    }
  );
  it.each([4, 255])('observes alpha %i including partial edges', async (alpha) => {
    await expect(
      decode(
        fixture({
          rows: [
            [255, 128, 64, 0, 7, 8, 9, 3],
            [0, 0, 0, 0, 0, 0, 0, alpha],
          ],
        })
      )
    ).resolves.toBe(false);
  });
  it.each([{ level: 0 }, { strategy: constants.Z_FIXED }, { level: 9 }])(
    'decodes independently compressed streams %j',
    async (compression) => {
      await expect(decode(fixture({ compression }))).resolves.toBe(true);
    }
  );
  it('exercises a genuine dynamic block with independent rich-color rows', async () => {
    const rows = Array.from({ length: 32 }, (_, y) =>
      Array.from({ length: 128 }, (_, x) => (x % 4 === 3 ? 0 : (x * 13 + y * 29) % 256))
    );
    const compressed = deflateSync(filtered(rows, 2), {
      level: 9,
      strategy: constants.Z_HUFFMAN_ONLY,
    });
    expect((compressed[2] >>> 1) & 3).toBe(2);
    await expect(
      decode(fixture({ rows, filter: 2, compressed }), { width: 32, height: 32 })
    ).resolves.toBe(true);
  });
  it('accepts producer line wrapping without accepting arbitrary whitespace', async () => {
    const base64 = fixture().toString('base64');
    await expect(
      createPngAlphaDecoder().decode(base64.match(/.{1,64}/g).join('\r\n'), grid, () => true)
    ).resolves.toBe(true);
    await expect(
      createPngAlphaDecoder().decode(base64.slice(0, 8) + ' ' + base64.slice(8), grid, () => true)
    ).rejects.toThrow();
  });
  it.each([{ depth: 16 }, { type: 3 }, { interlace: 1 }, { compression: 1 }, { filter: 1 }])(
    'rejects unsupported format %j',
    async (format) => {
      await expect(decode(fixture({ format }))).rejects.toThrow();
    }
  );
  it.each(['acTL', 'fcTL', 'fdAT', 'tRNS', 'ABCD'])('rejects forbidden chunk %s', async (type) => {
    await expect(decode(fixture({ before: [chunk(type)] }))).rejects.toThrow();
  });
  it('validates ancillary CRC and optional truecolor palette', async () => {
    await expect(
      decode(
        fixture({
          before: [chunk('sRGB', Buffer.from([0])), chunk('PLTE', Buffer.from([1, 2, 3]))],
        })
      )
    ).resolves.toBe(true);
    const invalid = chunk('sRGB', Buffer.from([0]));
    invalid[invalid.length - 1] ^= 1;
    await expect(decode(fixture({ before: [invalid] }))).rejects.toThrow();
  });
  it.each([
    chunk('tEXt'),
    chunk('iCCP'),
    chunk('sRGB', Buffer.from([4])),
    chunk('gAMA', Buffer.alloc(4)),
    chunk('pHYs', Buffer.alloc(8)),
  ])('refuses unsupported or malformed ancillary metadata %#', async (metadata) => {
    await expect(decode(fixture({ before: [metadata] }))).rejects.toThrow();
  });
  it('rejects duplicate, inconsistent and out-of-order supported metadata', async () => {
    await expect(
      decode(
        fixture({ before: [chunk('sRGB', Buffer.from([0])), chunk('sRGB', Buffer.from([0]))] })
      )
    ).rejects.toThrow();
    await expect(decode(fixture({ after: [chunk('sRGB', Buffer.from([0]))] }))).rejects.toThrow();
    await expect(
      decode(
        fixture({
          before: [chunk('sRGB', Buffer.from([0])), chunk('gAMA', Buffer.from([0, 0, 0, 1]))],
        })
      )
    ).rejects.toThrow();
  });
  it('rejects zlib dictionaries and an invalid zlib header checksum', async () => {
    const zlib = deflateSync(
      filtered(
        [
          [0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0],
        ],
        0
      )
    );
    const dictionary = Buffer.from(zlib);
    dictionary[0] = 0x78;
    dictionary[1] = 0x20;
    await expect(decode(fixture({ compressed: dictionary }))).rejects.toThrow();
    const checksum = Buffer.from(zlib);
    checksum[1] ^= 1;
    await expect(decode(fixture({ compressed: checksum }))).rejects.toThrow();
  });
  it('rejects a corrupt terminal CRC after observing opaque ink', async () => {
    const png = fixture({
      rows: [
        [0, 0, 0, 255, 0, 0, 0, 255],
        [0, 0, 0, 255, 0, 0, 0, 255],
      ],
    });
    png[png.length - 1] ^= 1;
    await expect(decode(png)).rejects.toThrow();
  });
  it('refuses truncation, trailing PNG bytes, nonconsecutive IDAT and repeated IEND', async () => {
    const png = fixture();
    await expect(decode(png.subarray(0, png.length - 1))).rejects.toThrow();
    await expect(decode(Buffer.concat([png, Buffer.from([0])]))).rejects.toThrow();
    await expect(decode(fixture({ after: [chunk('tEXt'), chunk('IDAT')] }))).rejects.toThrow();
    await expect(decode(fixture({ after: [chunk('IEND')] }))).rejects.toThrow();
  });
  it('rejects bad Adler and extra zlib bytes even with correct PNG CRCs', async () => {
    const zlib = deflateSync(
      filtered(
        [
          [0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0],
        ],
        0
      )
    );
    const invalid = Buffer.from(zlib);
    invalid[invalid.length - 1] ^= 1;
    await expect(decode(fixture({ compressed: invalid }))).rejects.toThrow();
    await expect(
      decode(fixture({ compressed: Buffer.concat([zlib, Buffer.from([0])]) }))
    ).rejects.toThrow();
  });
  it('rejects invalid filter and too much or too little decompressed output', async () => {
    await expect(decode(fixture({ raw: Buffer.from([5, 0, 0, 0, 0]) }))).rejects.toThrow();
    await expect(decode(fixture({ raw: Buffer.alloc(19) }))).rejects.toThrow();
    await expect(decode(fixture({ raw: Buffer.alloc(17) }))).rejects.toThrow();
  });
  it('refuses changed, oversized and zero expected grids before row allocation', async () => {
    await expect(decode(fixture(), { width: 3, height: 2 })).rejects.toThrow();
    await expect(decode(fixture(), { width: 0, height: 2 })).rejects.toThrow();
    await expect(decode(fixture(), { width: 4096, height: 4097 })).rejects.toThrow();
  });
  it('allocates only the dimension-derived rows, bounded history and tiny PNG buffers', async () => {
    const png = fixture(),
      allocations = [];
    const OriginalBytes = Uint8Array;
    class ObservedBytes extends OriginalBytes {
      constructor(...args) {
        super(...args);
        allocations.push(this.byteLength);
      }
    }
    vi.stubGlobal('Uint8Array', ObservedBytes);
    await expect(decode(png)).resolves.toBe(true);
    expect(allocations).toEqual([3, 13, 8, 8, 32768]);
    allocations.length = 0;
    await expect(decode(png, { width: 4096, height: 4097 })).rejects.toThrow();
    expect(allocations).toEqual([]);
  });
  it.each([null, {}, 1, undefined])('refuses non-string capture bytes %#', async (input) => {
    await expect(createPngAlphaDecoder().decode(input, grid, () => true)).rejects.toThrow();
  });
  it('rejects noncanonical padding bits', async () => {
    const png = fixture({ before: [chunk('pHYs', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 1]))] });
    const base64 = png.toString('base64'),
      alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    expect(base64.endsWith('=')).toBe(true);
    const position = base64.indexOf('=') - 1;
    const invalid =
      base64.slice(0, position) +
      alphabet[alphabet.indexOf(base64[position]) | 1] +
      base64.slice(position + 1);
    await expect(createPngAlphaDecoder().decode(invalid, grid, () => true)).rejects.toThrow();
  });
  it('bounds synchronous empty-IDAT traversal rather than hanging', async () => {
    await expect(
      decode(fixture({ before: Array.from({ length: 1000 }, () => chunk('IDAT')) }))
    ).rejects.toThrow('synchronous work limit');
  });
  it('keeps one underlying decoder until cancellation actually settles', async () => {
    vi.useFakeTimers();
    const rows = Array.from({ length: 64 }, () => new Array(256).fill(0));
    const png = fixture({ rows, compression: { level: 0 } }).toString('base64');
    const decoder = createPngAlphaDecoder();
    let current = true;
    const first = decoder.decode(png, { width: 64, height: 64 }, () => current);
    const rejected = (async () => {
      await expect(first).rejects.toThrow('cancelled');
    })();
    await Promise.resolve();
    await Promise.resolve();
    await expect(decoder.decode(png, { width: 64, height: 64 }, () => true)).rejects.toThrow(
      'still settling'
    );
    current = false;
    await vi.runAllTimersAsync();
    await rejected;
    await expect(decoder.decode(fixture().toString('base64'), grid, () => true)).resolves.toBe(
      true
    );
  });
  it('checks the monotonic deadline after a cooperative yield', async () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const rows = Array.from({ length: 64 }, () => new Array(256).fill(0));
    const pending = decode(fixture({ rows, compression: { level: 0 } }), { width: 64, height: 64 });
    const rejected = (async () => {
      await expect(pending).rejects.toThrow('did not finish');
    })();
    await Promise.resolve();
    await Promise.resolve();
    now = 10000;
    await vi.runAllTimersAsync();
    await rejected;
  });
});

function degenerateZlib(invalidCodes = false) {
  const bytes = [];
  let held = 0,
    count = 0;
  function bits(value, n) {
    for (let index = 0; index < n; index++) {
      held |= ((value >>> index) & 1) << count;
      if (++count === 8) {
        bytes.push(held);
        held = 0;
        count = 0;
      }
    }
  }
  bits(1, 1);
  bits(2, 2);
  bits(0, 5);
  bits(0, 5);
  bits(14, 4);
  const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1];
  for (const symbol of order)
    bits(symbol === 18 ? 1 : symbol === 0 || symbol === 1 ? (invalidCodes ? 1 : 2) : 0, 3);
  bits(0, 1);
  bits(127, 7);
  bits(0, 1);
  bits(107, 7);
  bits(3, 2);
  bits(1, 2);
  bits(0, 1);
  if (count) bytes.push(held);
  return Buffer.from([0x78, 0x01, ...bytes, 0, 0, 0, 1]);
}
describe('strict DEFLATE degenerate controls', () => {
  it('accepts single-EOB literal tree and unused empty distance tree', async () => {
    const compressed = degenerateZlib();
    let offset = 0;
    const emitted = vi.fn();
    await inflatePng(
      () => compressed[offset++] ?? null,
      0,
      emitted,
      createPngWork(() => true)
    );
    expect(emitted).not.toHaveBeenCalled();
  });
  it('rejects an oversubscribed code-length tree', async () => {
    const compressed = degenerateZlib(true);
    let offset = 0;
    await expect(
      inflatePng(
        () => compressed[offset++] ?? null,
        0,
        () => {},
        createPngWork(() => true)
      )
    ).rejects.toThrow();
  });
});
