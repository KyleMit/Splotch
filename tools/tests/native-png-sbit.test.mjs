import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPngAlphaDecoder } from '../../experiments/native-architecture/src/drawing/pngAlpha.ts';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
import { pngChunk, rgbaPng } from './native-png-fixtures.mjs';

const HEADER_BYTES = 33;
const IEND_BYTES = 12;
const TEST_SETUP_BUDGET_MS = 2_000;
const actualAndroidPng = new URL('./fixtures/native-png-android-rgba-sbit.png', import.meta.url);

function decode(png, grid = { width: 2, height: 2 }) {
  return createPngAlphaDecoder().decode(png.toString('base64'), grid, () => true);
}

function withMetadata(before, after = [], alpha = 0) {
  const png = rgbaPng(2, 2, alpha);
  return Buffer.concat([
    png.subarray(0, HEADER_BYTES),
    ...before,
    png.subarray(HEADER_BYTES, -IEND_BYTES),
    ...after,
    png.subarray(-IEND_BYTES),
  ]);
}

const significantBits = (values) => pngChunk('sBIT', Buffer.from(values));

describe('strict RGBA significant-bits metadata', () => {
  it(
    'decodes the exact opaque Android producer PNG without changing alpha interpretation',
    async () => {
      const png = readFileSync(actualAndroidPng);
      expect(createHash('sha256').update(png).digest('hex')).toBe(
        'bec2c1fceb86daff95c56e12ff12bdfc4f96727d7c6e32875fc224e152b3f9ec'
      );
      expect(png.subarray(HEADER_BYTES, HEADER_BYTES + 16)).toEqual(significantBits([8, 8, 8, 8]));
      await expect(decode(png, { width: 1024, height: 768 })).resolves.toBe(false);
    },
    PNG_TIMEOUT_MS + TEST_SETUP_BUDGET_MS
  );

  it.each([
    [0, true],
    [3, true],
    [4, false],
    [255, false],
  ])('preserves raw alpha %i with valid reduced significant bits', async (alpha, empty) => {
    await expect(decode(withMetadata([significantBits([1, 2, 7, 8])], [], alpha))).resolves.toBe(
      empty
    );
  });

  it('accepts significant bits before an optional truecolor palette', async () => {
    await expect(
      decode(
        withMetadata([significantBits([8, 8, 8, 8]), pngChunk('PLTE', Buffer.from([1, 2, 3]))])
      )
    ).resolves.toBe(true);
  });

  it.each([{ values: [] }, { values: [8] }, { values: [8, 8, 8] }, { values: [8, 8, 8, 8, 8] }])(
    'rejects a significant-bits length other than four %#',
    async ({ values }) => {
      await expect(decode(withMetadata([significantBits(values)]))).rejects.toThrow(
        'Picture capture returned an invalid or unsupported PNG.'
      );
    }
  );

  it.each([0, 1, 2, 3])('validates both depth bounds for channel %i', async (channel) => {
    const low = [8, 8, 8, 8];
    const high = [8, 8, 8, 8];
    low[channel] = 0;
    high[channel] = 9;
    await expect(decode(withMetadata([significantBits(low)]))).rejects.toThrow();
    await expect(decode(withMetadata([significantBits(high)]))).rejects.toThrow();
  });

  it('rejects repeated and out-of-order significant bits', async () => {
    const bits = significantBits([8, 8, 8, 8]);
    await expect(decode(withMetadata([bits, bits]))).rejects.toThrow();
    await expect(
      decode(withMetadata([pngChunk('PLTE', Buffer.from([1, 2, 3])), bits]))
    ).rejects.toThrow();
    await expect(decode(withMetadata([], [bits]))).rejects.toThrow();
  });

  it('rejects corrupt significant-bits CRC and corrupt PNG tail after opaque alpha', async () => {
    const bits = significantBits([8, 8, 8, 8]);
    bits[bits.length - 1] ^= 1;
    await expect(decode(withMetadata([bits]))).rejects.toThrow();
    const png = withMetadata([significantBits([8, 8, 8, 8])], [], 255);
    png[png.length - 1] ^= 1;
    await expect(decode(png)).rejects.toThrow();
  });

  it.each(['sBIt', 'iCCP', 'tEXt', 'tRNS', 'acTL', 'ABCD'])(
    'retains unsupported-chunk refusal for %s',
    async (type) => {
      await expect(
        decode(withMetadata([pngChunk(type, Buffer.from([8, 8, 8, 8]))]))
      ).rejects.toThrow();
    }
  );
});
