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
import { AI_OUTPUT_FIXTURES } from '../../web/tests/artifacts/ai-output-fixtures.ts';
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
    ['progressive', 3, 'jpeg', { progressive: true }],
    ['mozjpeg', 3, 'jpeg', { mozjpeg: true }],
    ['grayProgressive', 1, 'jpeg', { progressive: true }],
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
it.each([
  'rgb',
  'rgba',
  'baseline',
  'gray',
  'progressive',
  'mozjpeg',
  'grayProgressive',
  'lossy',
  'lossless',
  'alpha',
])(
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
it.each(['rgba', 'baseline', 'progressive', 'lossy', 'lossless'])(
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
function jpegSegments(bytes) {
  const segments = [];
  let offset = 2;
  while (bytes[offset + 1] !== 0xd9) {
    const marker = bytes[offset + 1],
      end = offset + 2 + bytes.readUInt16BE(offset + 2);
    segments.push({ marker, offset, end });
    offset = end;
    if (marker === 0xda)
      while (bytes[offset] !== 255 || !bytes[offset + 1] || (bytes[offset + 1] & 0xf8) === 0xd0)
        offset++;
  }
  return segments;
}
const admits = (bytes) =>
  resultImageGrid(bytes, 'image/jpeg', current).then(
    () => true,
    () => false
  );
it.each(Object.entries(AI_OUTPUT_FIXTURES))(
  'admits the committed progressive %s provider output at its exact canvas',
  async (_, path) => {
    const bytes = readFileSync(path);
    const { width, height, isProgressive } = await sharp(bytes).metadata();
    expect(isProgressive).toBe(true);
    expect(await resultImageGrid(bytes, 'image/jpeg', current)).toEqual({ width, height });
  }
);
it('rejects a JPEG header without a scan, markers spliced into entropy data and invalid quantization', async () => {
  const { bytes } = fixtures.get('baseline'),
    damaged = Buffer.from(bytes),
    quantization = Buffer.from(bytes);
  const scan = jpegSegments(bytes).find((segment) => segment.marker === 0xda);
  const headerOnly = Buffer.concat([bytes.subarray(0, scan.offset), Buffer.of(255, 0xd9)]);
  damaged[scan.end] = 255;
  damaged[scan.end + 1] = 0xc0;
  const table = quantization.indexOf(Buffer.from([255, 219]));
  quantization[table + 5] = 0;
  for (const candidate of [headerOnly, damaged, quantization])
    await expect(resultImageGrid(candidate, 'image/jpeg', current)).rejects.toThrow();
});
it('rejects progressive scans that break the band, approximation or table rules', async () => {
  const { bytes } = fixtures.get('progressive');
  const scans = jpegSegments(bytes).filter((segment) => segment.marker === 0xda);
  const dc = scans.find((scan) => bytes[scan.end - 3] === 0),
    ac = scans.find((scan) => bytes[scan.end - 3] > 0 && bytes[scan.end - 1] === 0x10);
  const mutate = (scan, index, value) => {
    const copy = Buffer.from(bytes);
    copy[scan.end - index] = value;
    return copy;
  };
  expect(await admits(bytes)).toBe(true);
  for (const candidate of [
    mutate(dc, 2, 63),
    mutate(ac, 1, 0x20),
    mutate(ac, 1, 0x0e),
    mutate(ac, 2, bytes[ac.end - 3] - 1),
    mutate(ac, 4, 3),
  ])
    expect(await admits(candidate)).toBe(false);
});
it('rejects a DC scan claiming the AC band, a component coded twice, and AC before its DC', async () => {
  const portrait = readFileSync(AI_OUTPUT_FIXTURES.portrait),
    gray = fixtures.get('gray').bytes;
  const segments = jpegSegments(portrait),
    scans = segments.flatMap((segment, index) => (segment.marker === 0xda ? [index] : []));
  const dcStart = segments.find((segment) => segment.marker === 0xc4).offset,
    acStart = segments[scans[0] + 1].offset,
    acEnd = segments[scans[1] + 1].offset;
  const wideDc = Buffer.from(portrait.subarray(0, acStart));
  wideDc[segments[scans[0]].end - 2] = 63;
  const grayScan = jpegSegments(gray).find((segment) => segment.marker === 0xda).offset,
    grayData = gray.subarray(grayScan, gray.length - 2);
  for (const candidate of [
    Buffer.concat([wideDc, Buffer.of(255, 0xd9)]),
    Buffer.concat([gray.subarray(0, grayScan), grayData, grayData, Buffer.of(255, 0xd9)]),
    Buffer.concat([
      portrait.subarray(0, dcStart),
      portrait.subarray(acStart, acEnd),
      portrait.subarray(dcStart, acStart),
      portrait.subarray(acEnd),
    ]),
  ])
    expect(await admits(candidate)).toBe(false);
});
function entropySpans(bytes) {
  const segments = jpegSegments(bytes);
  return segments.flatMap((segment, index) =>
    segment.marker === 0xda
      ? [{ start: segment.end, end: segments[index + 1]?.offset ?? bytes.length - 2 }]
      : []
  );
}
const withEndOfImage = (bytes, length) =>
  Buffer.concat([bytes.subarray(0, length), Buffer.of(255, 0xd9)]);
it.each([
  ['baseline', 1024, 768, { progressive: false }],
  ['progressive', 512, 384, { progressive: true }],
  ['progressive 4:4:4', 512, 384, { progressive: true, chromaSubsampling: '4:4:4' }],
  ['mozjpeg', 512, 384, { mozjpeg: true }],
  ['gray progressive', 512, 384, { progressive: true }, true],
])(
  'walks every block of a %s provider picture and rejects it cut inside any scan before an intact EOI',
  async (_, width, height, options, gray = false) => {
    const source = sharp(readFileSync(AI_OUTPUT_FIXTURES.landscape)).resize(width, height, {
      fit: 'fill',
    });
    const bytes = await (gray ? source.grayscale() : source).jpeg(options).toBuffer();
    await sharp(bytes, { failOn: 'warning' }).raw().toBuffer();
    expect(await resultImageGrid(bytes, 'image/jpeg', current)).toEqual({ width, height });
    for (const span of entropySpans(bytes))
      for (const length of [span.start + 1, Math.floor((span.start + span.end) / 2)]) {
        const cut = withEndOfImage(bytes, length);
        await expect(sharp(cut, { failOn: 'warning' }).raw().toBuffer()).rejects.toThrow();
        expect(await admits(cut)).toBe(false);
      }
  }
);
it.each(Object.entries(AI_OUTPUT_FIXTURES))(
  'rejects the committed %s output cut inside a middle or the last scan, or without its last scan, before an intact EOI',
  async (_, path) => {
    const bytes = readFileSync(path),
      spans = entropySpans(bytes);
    const middle = spans[Math.floor(spans.length / 2)],
      last = spans.at(-1);
    for (const length of [
      middle.start + 1,
      Math.floor((middle.start + middle.end) / 2),
      Math.floor((last.start + last.end) / 2),
      spans.at(-2).end,
    ])
      expect(await admits(withEndOfImage(bytes, length))).toBe(false);
  }
);
function restartJpeg(interval, marker) {
  const segment = (code, body) => Buffer.of(255, code, 0, body.length + 2, ...body);
  const table = (selector) => [selector, 1, ...Array(15).fill(0), 0];
  return Buffer.concat([
    Buffer.of(255, 0xd8),
    segment(0xdb, [0, ...Array(64).fill(1)]),
    segment(0xc0, [8, 0, 8, 0, 16, 1, 1, 0x11, 0]),
    segment(0xc4, [...table(0x00), ...table(0x10)]),
    segment(0xdd, [0, interval]),
    segment(0xda, [1, 1, 0, 0, 63, 0]),
    Buffer.of(0x3f, 255, marker, 0x3f, 255, 0xd9),
  ]);
}
it('admits in-sequence restart markers and rejects undeclared or out-of-sequence ones', async () => {
  const valid = restartJpeg(1, 0xd0);
  await sharp(valid, { failOn: 'warning' }).raw().toBuffer();
  expect(await resultImageGrid(valid, 'image/jpeg', current)).toEqual({ width: 16, height: 8 });
  for (const candidate of [restartJpeg(0, 0xd0), restartJpeg(1, 0xd1)])
    expect(await admits(candidate)).toBe(false);
});
it('admits exactly the JPEG frame types both native decoders admit', async () => {
  const frames = [...Array(16).keys()]
    .map((index) => 0xc0 + index)
    .filter((marker) => ![0xc4, 0xc8, 0xcc].includes(marker));
  const withFrame = (bytes, marker) => {
    const copy = Buffer.from(bytes);
    copy[jpegSegments(bytes).find((segment) => frames.includes(segment.marker)).offset + 1] =
      marker;
    return copy;
  };
  const admitted = [];
  for (const marker of frames)
    if (
      (await admits(withFrame(fixtures.get('baseline').bytes, marker))) ||
      (await admits(withFrame(fixtures.get('progressive').bytes, marker)))
    )
      admitted.push(marker);
  const root = new URL('../../experiments/native-architecture/', import.meta.url);
  const native = (path, pattern) =>
    readFileSync(new URL(path, root), 'utf8')
      .match(pattern)[1]
      .split(',')
      .map(Number)
      .filter((marker) => frames.includes(marker));
  expect(admitted).toEqual([0xc0, 0xc1, 0xc2]);
  expect(
    native(
      'android/app/src/main/java/art/splotch/migration/probe/SplotchAIEnvironment.kt',
      /check\(marker in setOf\(([^)]*)\)/
    )
  ).toEqual(admitted);
  expect(
    native('ios/HelloWorld/SplotchAIEnvironment.swift', /require\(\[([^\]]*)\]\.contains\(marker\)/)
  ).toEqual(admitted);
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
