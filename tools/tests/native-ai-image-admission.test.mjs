import { beforeAll, expect, it } from 'vitest';
import sharp from 'sharp';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resultImageGrid } from '../../experiments/native-architecture/src/ai/imageAdmission.ts';
import {
  MAX_AI_IMAGE_PIXELS,
  MAX_AI_IMAGE_DIMENSION_PX,
  MAX_AI_DECODED_BYTES,
  imageGrid,
} from '../../experiments/native-architecture/src/ai/imageBounds.ts';
import { parseAiResponse } from '../../experiments/native-architecture/src/ai/transport.ts';
import { pngChunk, pngFromZlib, rgbaPng } from './native-png-fixtures.mjs';
const fixtures = new Map();
const current = () => true;
const start = { path: '/api/generate-image', method: 'POST', headers: {} };
beforeAll(async () => {
  for (const [name, channels, format, options] of [
    ['rgb', 3, 'png', {}],
    ['rgba', 4, 'png', {}],
    ['baseline', 3, 'jpeg', { progressive: false }],
    ['gray', 1, 'jpeg', { progressive: false }],
    ['lossy', 3, 'webp', {}],
    ['lossless', 4, 'webp', { lossless: true }],
    ['alpha', 4, 'webp', { lossless: false }],
  ]) {
    const pixels = Buffer.alloc(16 * 12 * channels, 128);
    const bytes = await sharp(pixels, { raw: { width: 16, height: 12, channels } })
      .toFormat(format, options)
      .toBuffer();
    await sharp(bytes, { failOn: 'warning' }).raw().toBuffer();
    fixtures.set(name, { bytes, mime: `image/${format}` });
  }
});
it.each(['rgb', 'rgba', 'baseline', 'gray', 'lossy', 'lossless', 'alpha'])(
  'admits complete controlled provider-format %s bytes and returns their exact bounded grid',
  async (name) => {
    const { bytes, mime } = fixtures.get(name);
    expect(await resultImageGrid(bytes, mime, current)).toEqual({ width: 16, height: 12 });
    expect(
      await parseAiResponse(
        new Response(bytes, { headers: { 'Content-Type': mime } }),
        start,
        new AbortController().signal,
        0
      )
    ).toMatchObject({ kind: 'image', mime, bytes: Uint8Array.from(bytes) });
  }
);
it.each([
  ['image/png', [137, 80, 78, 71, 13, 10, 26, 10]],
  ['image/jpeg', [255, 216, 255]],
  ['image/webp', [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]],
])('rejects the demonstrated643e signature-only %s response', async (mime, data) => {
  await expect(
    parseAiResponse(
      new Response(Uint8Array.from(data), { headers: { 'Content-Type': mime } }),
      start,
      new AbortController().signal,
      0
    )
  ).rejects.toThrow();
});
it.each(['rgba', 'baseline', 'lossy', 'lossless'])(
  'rejects truncated and trailing %s data instead of accepting a header',
  async (name) => {
    const { bytes, mime } = fixtures.get(name);
    for (const length of [8, Math.floor(bytes.length / 2), bytes.length - 1])
      await expect(resultImageGrid(bytes.subarray(0, length), mime, current)).rejects.toThrow();
    await expect(
      resultImageGrid(Buffer.concat([bytes, Buffer.of(0)]), mime, current)
    ).rejects.toThrow();
  }
);
it('rejects PNG CRC, checksum, filter, interlace and animation faults', async () => {
  const valid = rgbaPng(2, 2, 255),
    crc = Buffer.from(valid);
  crc[crc.length - 1] ^= 1;
  const raw = Buffer.alloc(18);
  raw[0] = 5;
  const corrupt = deflateSync(Buffer.alloc(18));
  corrupt[corrupt.length - 1] ^= 1;
  const header = Buffer.from(valid.subarray(16, 29));
  header[12] = 1;
  const interlaced = Buffer.concat([
    valid.subarray(0, 8),
    pngChunk('IHDR', header),
    valid.subarray(33),
  ]);
  const animated = Buffer.concat([
    valid.subarray(0, 33),
    pngChunk('acTL', Buffer.alloc(8)),
    valid.subarray(33),
  ]);
  for (const bytes of [
    crc,
    pngFromZlib(corrupt),
    pngFromZlib(deflateSync(raw)),
    interlaced,
    animated,
  ])
    await expect(resultImageGrid(bytes, 'image/png', current)).rejects.toThrow();
});
it('rejects inconsistent PNG color metadata and invalid palette ordering', async () => {
  const valid = rgbaPng(2, 2, 255);
  const gamma = Buffer.alloc(4);
  gamma.writeUInt32BE(100000);
  const chromaticity = Buffer.alloc(32);
  for (let index = 0; index < 8; index++) chromaticity.writeUInt32BE(50000, index * 4);
  const cases = [
    [pngChunk('sRGB', Buffer.of(0)), pngChunk('gAMA', gamma)],
    [pngChunk('sRGB', Buffer.of(0)), pngChunk('cHRM', chromaticity)],
    [pngChunk('PLTE', Buffer.of(0, 0, 0)), pngChunk('sRGB', Buffer.of(0))],
    [pngChunk('cHRM', Buffer.alloc(32))],
  ];
  for (const metadata of cases)
    await expect(
      resultImageGrid(
        Buffer.concat([valid.subarray(0, 33), ...metadata, valid.subarray(33)]),
        'image/png',
        current
      )
    ).rejects.toThrow();
  gamma.writeUInt32BE(45455);
  const values = [31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000];
  values.forEach((value, index) => chromaticity.writeUInt32BE(value, index * 4));
  expect(
    await resultImageGrid(
      Buffer.concat([
        valid.subarray(0, 33),
        pngChunk('sRGB', Buffer.of(0)),
        pngChunk('gAMA', gamma),
        pngChunk('cHRM', chromaticity),
        valid.subarray(33),
      ]),
      'image/png',
      current
    )
  ).toEqual({ width: 2, height: 2 });
});
it('rejects result dimensions and pixel budgets before decoded allocation', async () => {
  for (const [width, height] of [
    [MAX_AI_IMAGE_DIMENSION_PX + 1, 1],
    [4096, 1025],
  ]) {
    const bytes = pngFromZlib(deflateSync(Buffer.alloc(1)), width, height);
    await expect(resultImageGrid(bytes, 'image/png', current)).rejects.toThrow();
  }
  expect(() => imageGrid(4096, 1025)).toThrow();
  expect(() => imageGrid(4097, 1)).toThrow();
  expect(MAX_AI_IMAGE_PIXELS).toBe(4194304);
  expect(MAX_AI_DECODED_BYTES).toBe(16777216);
});
function jpegScan(bytes) {
  let offset = 2;
  while (offset < bytes.length) {
    const marker = bytes[offset + 1],
      size = bytes.readUInt16BE(offset + 2);
    if (marker === 0xda) return offset + 2 + size;
    offset += 2 + size;
  }
  throw new Error('Fixture has no scan');
}
it('rejects JPEG damaged entropy, unsupported progressive encoding and invalid quantization', async () => {
  const { bytes } = fixtures.get('baseline'),
    damaged = Buffer.from(bytes),
    quantization = Buffer.from(bytes);
  const scan = jpegScan(bytes);
  damaged[scan] = 255;
  damaged[scan + 1] = 0xc0;
  const table = quantization.indexOf(Buffer.from([255, 219]));
  quantization[table + 5] = 0;
  const progressive = await sharp(bytes).jpeg({ progressive: true }).toBuffer();
  for (const candidate of [damaged, quantization, progressive])
    await expect(resultImageGrid(candidate, 'image/jpeg', current)).rejects.toThrow();
});
it('rejects WebP inconsistent RIFF lengths, animation and oversized frame dimensions', async () => {
  const { bytes } = fixtures.get('lossy'),
    size = Buffer.from(bytes),
    dimensions = Buffer.from(bytes);
  size.writeUInt32LE(bytes.length, 4);
  const frame = dimensions.indexOf(Buffer.from('VP8 '));
  dimensions.writeUInt16LE(4097, frame + 8 + 6);
  const alpha = Buffer.from(fixtures.get('alpha').bytes);
  alpha[20] |= 2;
  for (const candidate of [size, dimensions, alpha])
    await expect(resultImageGrid(candidate, 'image/webp', current)).rejects.toThrow();
});
it('honors cancellation before image work and pins actual bounded native decoding source', async () => {
  await expect(
    resultImageGrid(fixtures.get('rgba').bytes, 'image/png', () => false)
  ).rejects.toThrow('cancelled');
  const root = new URL('../../experiments/native-architecture/', import.meta.url);
  const kotlin = readFileSync(
    new URL('android/app/src/main/java/art/splotch/migration/probe/SplotchAIEnvironment.kt', root),
    'utf8'
  );
  const swift = readFileSync(new URL('ios/HelloWorld/SplotchAIEnvironment.swift', root), 'utf8');
  for (const text of [kotlin, swift]) {
    expect(text).toContain('maxImageDimension = 4096');
    expect(text).toContain('maxImagePixels = 4 * 1024 * 1024');
    expect(text).toContain('maxImageBytes = 16 * 1024 * 1024');
  }
  expect(kotlin).toContain('bitmap.recycle()');
  expect(kotlin).toContain('decoder.setOnPartialImageListener { false }');
  expect(kotlin).toContain('Build.VERSION.SDK_INT >= 28 || mime != "image/webp"');
  expect(kotlin).toContain('bitmap.allocationByteCount <= maxDecodedBytes');
  expect(swift).toContain('kCGImageSourceShouldCacheImmediately: true');
  expect(swift).toContain('context.draw(image');
  expect(swift).toContain('CGImageSourceGetStatusAtIndex(source, 0) == .statusComplete');
});

it.each(['png', 'jpeg', 'webp'])(
  'checks a complete 1024 by 768 controlled %s provider-size fixture',
  async (format) => {
    const bytes = await sharp({
      create: { width: 1024, height: 768, channels: 3, background: '#888888' },
    })
      .toFormat(format)
      .toBuffer();
    await sharp(bytes, { failOn: 'warning' }).raw().toBuffer();
    expect(await resultImageGrid(bytes, `image/${format}`, current)).toEqual({
      width: 1024,
      height: 768,
    });
  }
);
