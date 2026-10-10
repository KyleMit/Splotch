import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setImmediate, clearImmediate } from 'node:timers';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPngAlphaDecoder } from '../../experiments/native-architecture/src/drawing/pngAlpha.ts';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';

const HOST_FIXTURE_SETUP_MS = 5000;
const actual = readFileSync(new URL('./fixtures/ios-clear-rgba.png', import.meta.url));
const grid = { width: 2, height: 2 };
const exif = Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]);
const idot = Buffer.alloc(28);

function chunk(type, data = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const value of body) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  const size = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, checksum]);
}

function fixture(before, after = [], alpha = 3) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(grid.width);
  header.writeUInt32BE(grid.height, 4);
  header[8] = 8;
  header[9] = 6;
  const row = Buffer.from([0, 10, 20, 30, 0, 40, 50, 60, alpha]);
  return Buffer.concat([
    actual.subarray(0, 8),
    chunk('IHDR', header),
    ...before,
    chunk('IDAT', deflateSync(Buffer.concat([row, row]))),
    ...after,
    chunk('IEND'),
  ]);
}

function decode(bytes, expected = grid) {
  return createPngAlphaDecoder().decode(bytes.toString('base64'), expected, () => true);
}

afterEach(() => vi.unstubAllGlobals());

describe('iOS capture ancillary metadata', () => {
  it(
    'decodes the exact captured callback through its complete IDAT stream',
    async () => {
      expect(actual.length).toBe(240728);
      expect(createHash('sha256').update(actual).digest('hex')).toBe(
        '2594b5a6011c1852928a527298462ce0cdea54ee4200319f52512abde8c7cbf8'
      );
      // Host macrotasks exercise the public idle path without simulating native timing.
      vi.stubGlobal('requestIdleCallback', (callback) => setImmediate(callback));
      vi.stubGlobal('cancelIdleCallback', clearImmediate);
      await expect(decode(actual, { width: 3072, height: 2304 })).resolves.toBe(false);
    },
    PNG_TIMEOUT_MS + HOST_FIXTURE_SETUP_MS
  );

  it.each([0, 3, 4, 255])('preserves alpha %i with both ignored metadata chunks', async (alpha) => {
    await expect(
      decode(fixture([chunk('eXIf', exif), chunk('iDOT', idot)], [], alpha))
    ).resolves.toBe(alpha < 4);
  });
  it('accepts both TIFF byte-order signatures without interpreting metadata offsets', async () => {
    await expect(
      decode(fixture([chunk('eXIf', Buffer.from([0x4d, 0x4d, 0, 0x2a]))]))
    ).resolves.toBe(true);
  });
  it.each([
    ['short Exif', chunk('eXIf', exif.subarray(0, 3))],
    ['invalid Exif signature', chunk('eXIf', Buffer.alloc(8))],
    ['short iDOT', chunk('iDOT', Buffer.alloc(27))],
    ['long iDOT', chunk('iDOT', Buffer.alloc(29))],
    ['critical Exif', chunk('EXIf', exif)],
    ['critical iDOT', chunk('IDOT', idot)],
    ['unknown ancillary', chunk('tEXt', Buffer.from('unused'))],
  ])('rejects %s', async (_, metadata) => {
    await expect(decode(fixture([metadata]))).rejects.toThrow('invalid or unsupported PNG');
  });
  it.each([
    ['eXIf', exif],
    ['iDOT', idot],
  ])('rejects duplicate, late, and corrupt %s', async (type, data) => {
    const metadata = chunk(type, data);
    await expect(decode(fixture([metadata, metadata]))).rejects.toThrow();
    await expect(decode(fixture([], [metadata]))).rejects.toThrow();
    const corrupt = Buffer.from(metadata);
    corrupt[corrupt.length - 1] ^= 1;
    await expect(decode(fixture([corrupt]))).rejects.toThrow();
  });
  it('rejects oversized and truncated metadata framing', async () => {
    const oversized = chunk('eXIf', exif);
    oversized.writeUInt32BE(0x80000000);
    await expect(decode(fixture([oversized]))).rejects.toThrow();
    const truncated = chunk('iDOT', idot);
    truncated.writeUInt32BE(29);
    await expect(decode(fixture([truncated]))).rejects.toThrow();
  });
  it('still verifies the terminal CRC after detecting opaque ink', async () => {
    const png = fixture([chunk('eXIf', exif), chunk('iDOT', idot)], [], 255);
    png[png.length - 1] ^= 1;
    await expect(decode(png)).rejects.toThrow();
  });
});
