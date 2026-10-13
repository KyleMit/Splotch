import { deflateSync } from 'node:zlib';

export function pngChunk(type, body = Buffer.alloc(0)) {
  const data = Buffer.concat([Buffer.from(type), body]);
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  const size = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  size.writeUInt32BE(body.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, data, checksum]);
}
export function pngFromZlib(compressed, width = 2, height = 2, tinyChunks = false) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const chunks = tinyChunks
    ? [...compressed].map((value) => pngChunk('IDAT', Buffer.from([value])))
    : [pngChunk('IDAT', compressed)];
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    ...chunks,
    pngChunk('IEND'),
  ]);
}
export function rgbaPng(width, height, alpha = 0) {
  const rows = Buffer.alloc(height * (width * 4 + 1));
  rows[1] = 190;
  rows[2] = 80;
  rows[3] = 10;
  rows[4] = alpha;
  return pngFromZlib(deflateSync(rows), width, height);
}
export function bitWriter() {
  const output = [];
  let held = 0,
    size = 0;
  return {
    bits(value, count) {
      for (let bit = 0; bit < count; bit++) {
        held |= ((value >>> bit) & 1) << size;
        if (++size === 8) {
          output.push(held);
          held = 0;
          size = 0;
        }
      }
    },
    code(value, count) {
      for (let bit = count - 1; bit >= 0; bit--) this.bits((value >>> bit) & 1, 1);
    },
    align() {
      if (size) {
        output.push(held);
        held = 0;
        size = 0;
      }
    },
    bytes() {
      this.align();
      return Buffer.from(output);
    },
  };
}
export function zlibEnvelope(deflate, raw = Buffer.alloc(18)) {
  let a = 1,
    b = 0;
  for (const value of raw) {
    a = (a + value) % 65521;
    b = (b + a) % 65521;
  }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(((b << 16) | a) >>> 0);
  return Buffer.concat([Buffer.from([0x78, 0x01]), deflate, adler]);
}
export function fixedSymbol(writer, symbol) {
  if (symbol < 144) writer.code(0x30 + symbol, 8);
  else if (symbol < 256) writer.code(0x190 + symbol - 144, 9);
  else if (symbol < 280) writer.code(symbol - 256, 7);
  else writer.code(0xc0 + symbol - 280, 8);
}
export function legalDynamicFence(distanceField = 31) {
  const writer = bitWriter();
  writer.bits(0, 1);
  writer.bits(2, 2);
  writer.bits(29, 5);
  writer.bits(distanceField, 5);
  writer.bits(15, 4);
  const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  for (const value of order)
    writer.bits(value === 16 ? 1 : value === 17 ? 2 : value === 18 ? 3 : 7, 3);
  for (let index = 0; index < 287 + distanceField; index++)
    writer.code(index === 256 || index === 286 ? 113 : 112, 7);
  writer.code(0, 1);
  writer.bits(1, 1);
  writer.bits(0, 2);
  writer.align();
  const stored = Buffer.from([18, 0, 237, 255, ...Buffer.alloc(18)]);
  const compressed = zlibEnvelope(Buffer.concat([writer.bytes(), stored]));
  const png = pngFromZlib(compressed, 2, 2, true);
  return {
    compressed,
    png,
    base64: png
      .toString('base64')
      .match(/.{1,4}/g)
      .join('\r\n'),
  };
}
const INK_COLORS = [
  [230, 40, 40],
  [40, 120, 230],
  [250, 200, 30],
  [20, 20, 20],
];
const INK_STROKES = 24;
const INK_STROKE_STEPS = 160;
const INK_RADIUS_PX = [6, 24];
const INK_STEP_FRACTION = 0.35;
const INK_TURN_RADIANS = 0.5;

function inkPixels(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  let seed = 7;
  const random = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
  for (let stroke = 0; stroke < INK_STROKES; stroke++) {
    const [red, green, blue] = INK_COLORS[stroke % INK_COLORS.length];
    const radius = INK_RADIUS_PX[0] + random() * (INK_RADIUS_PX[1] - INK_RADIUS_PX[0]);
    let x = random() * width,
      y = random() * height,
      angle = random() * Math.PI * 2;
    for (let step = 0; step < INK_STROKE_STEPS; step++) {
      angle += (random() - 0.5) * INK_TURN_RADIANS;
      x += Math.cos(angle) * radius * INK_STEP_FRACTION;
      y += Math.sin(angle) * radius * INK_STEP_FRACTION;
      const top = Math.max(0, Math.floor(y - radius - 1));
      const bottom = Math.min(height - 1, Math.ceil(y + radius + 1));
      const left = Math.max(0, Math.floor(x - radius - 1));
      const right = Math.min(width - 1, Math.ceil(x + radius + 1));
      for (let row = top; row <= bottom; row++)
        for (let column = left; column <= right; column++) {
          const coverage = Math.min(1, radius - Math.hypot(column - x, row - y) + 0.5);
          if (coverage <= 0) continue;
          const offset = (row * width + column) * 4;
          const alpha = Math.round(coverage * 255);
          if (alpha <= pixels[offset + 3]) continue;
          pixels[offset] = red;
          pixels[offset + 1] = green;
          pixels[offset + 2] = blue;
          pixels[offset + 3] = alpha;
        }
    }
  }
  return pixels;
}

/** Antialiased crayon-like strokes on transparent paper, Sub-filtered like a platform encoder. */
export function inkPng(width, height) {
  const pixels = inkPixels(width, height);
  const rowBytes = width * 4;
  const raw = Buffer.alloc(height * (rowBytes + 1));
  for (let row = 0; row < height; row++) {
    const start = row * (rowBytes + 1);
    raw[start] = 1;
    for (let index = 0; index < rowBytes; index++) {
      const left = index >= 4 ? pixels[row * rowBytes + index - 4] : 0;
      raw[start + 1 + index] = (pixels[row * rowBytes + index] - left) & 255;
    }
  }
  return pngFromZlib(deflateSync(raw), width, height);
}
