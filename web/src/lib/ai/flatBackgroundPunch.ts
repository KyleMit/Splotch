// Cuts a subject out of a deliberately flat, uniform backdrop and returns it as
// RGBA with the backdrop transparent for Sticker covers and live generations.
//
// The generic cover cut is seeded from the border. Sticker mode also clears
// enclosed magenta gaps, since its prompt forbids magenta inside the artwork.
import sharp from 'sharp';

// Squared euclidean RGB distance under which a pixel counts as backdrop. Sized
// for a flat generated field with mild codec noise: high enough to swallow webp
// ringing, far below the gap to the sticker's white die-cut band.
const BACKDROP_TOLERANCE_SQ = 34 * 34 * 3;

// The keyed edge still carries a rim of half-backdrop pixels from the model's
// own antialiasing. Growing the mask by this many pixels eats the rim rather
// than leaving a magenta halo around the cutout.
const RIM_BLEED_PX = 2;

// A usable render loses most of its field but keeps a substantial subject.
// Outside this band the backdrop was missed or the whole image was eaten.
const MIN_PUNCHED_FRACTION = 0.05;
const MAX_PUNCHED_FRACTION = 0.95;
const MAGENTA_MIN_CHANNEL = 150;
const MAGENTA_MAX_GREEN = 125;
const STICKER_EDGE_BAND_PX = 6;
const MAGENTA_SPILL_DELTA = 8;
const STICKER_EDGE_BLEND_TOLERANCE = 20;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function matchesBackdrop(data: Buffer, index: number, backdrop: Rgb): boolean {
  const dr = data[index] - backdrop.r;
  const dg = data[index + 1] - backdrop.g;
  const db = data[index + 2] - backdrop.b;
  return dr * dr + dg * dg + db * db <= BACKDROP_TOLERANCE_SQ;
}

function dominantBorderColor(data: Buffer, width: number, height: number, channels: number): Rgb {
  const counts = new Map<string, { count: number; r: number; g: number; b: number }>();
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    const key = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
    const entry = counts.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    entry.count++;
    entry.r += data[i];
    entry.g += data[i + 1];
    entry.b += data[i + 2];
    counts.set(key, entry);
  };
  for (let x = 0; x < width; x++) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    sample(0, y);
    sample(width - 1, y);
  }
  let best = null;
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
  return best
    ? { r: best.r / best.count, g: best.g / best.count, b: best.b / best.count }
    : { r: 0, g: 0, b: 0 };
}

function floodFillBackdrop(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  backdrop: Rgb
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const stack: number[] = [];
  const consider = (x: number, y: number) => {
    const p = y * width + x;
    if (mask[p]) return;
    const i = p * channels;
    if (!matchesBackdrop(data, i, backdrop)) return;
    mask[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < width; x++) {
    consider(x, 0);
    consider(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    consider(0, y);
    consider(width - 1, y);
  }

  while (stack.length) {
    const p = stack.pop();
    if (p === undefined) break;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) consider(x - 1, y);
    if (x < width - 1) consider(x + 1, y);
    if (y > 0) consider(x, y - 1);
    if (y < height - 1) consider(x, y + 1);
  }
  return mask;
}

function growMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  let current = mask;
  for (let step = 0; step < radius; step++) {
    const next = current.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (current[p]) continue;
        const up = y > 0 && current[p - width];
        const down = y < height - 1 && current[p + width];
        const left = x > 0 && current[p - 1];
        const right = x < width - 1 && current[p + 1];
        if (up || down || left || right) next[p] = 1;
      }
    }
    current = next;
  }
  return current;
}

export async function punchFlatBackground(
  input: Buffer | Uint8Array,
  mode: 'flat' | 'sticker' = 'flat'
): Promise<{ buffer: Buffer; punchedFraction: number; backdrop: Rgb }> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const backdrop = dominantBorderColor(data, width, height, channels);
  const mask = growMask(
    floodFillBackdrop(data, width, height, channels, backdrop),
    width,
    height,
    RIM_BLEED_PX
  );
  if (mode === 'sticker') {
    for (let p = 0; p < width * height; p++) {
      if (matchesBackdrop(data, p * channels, backdrop)) mask[p] = 1;
    }
  }
  const edgeBand = mode === 'sticker' ? growMask(mask, width, height, STICKER_EDGE_BAND_PX) : null;

  // An explicit interleaved RGBA buffer, never joinChannel: sharp tags a joined
  // 4th band as a generic extra channel and the encoder silently flattens it
  // (tools/asset-gen/CLAUDE.md).
  const rgba = Buffer.alloc(width * height * 4);
  let punched = 0;
  for (let p = 0; p < width * height; p++) {
    const src = p * channels;
    const dst = p * 4;
    rgba[dst] = data[src];
    rgba[dst + 1] = data[src + 1];
    rgba[dst + 2] = data[src + 2];
    if (mask[p]) {
      rgba[dst + 3] = 0;
      punched++;
    } else {
      rgba[dst + 3] = channels === 4 ? data[src + 3] : 255;
      if (
        edgeBand?.[p] &&
        data[src] - data[src + 1] > MAGENTA_SPILL_DELTA &&
        data[src + 2] - data[src + 1] > MAGENTA_SPILL_DELTA
      ) {
        const alpha = Math.max(
          0,
          Math.min(1, (data[src + 1] - backdrop.g) / Math.max(1, 255 - backdrop.g))
        );
        const expectedRed = alpha * 255 + (1 - alpha) * backdrop.r;
        const expectedBlue = alpha * 255 + (1 - alpha) * backdrop.b;
        if (
          Math.abs(data[src] - expectedRed) <= STICKER_EDGE_BLEND_TOLERANCE &&
          Math.abs(data[src + 2] - expectedBlue) <= STICKER_EDGE_BLEND_TOLERANCE
        ) {
          rgba[dst] = 255;
          rgba[dst + 1] = 255;
          rgba[dst + 2] = 255;
          rgba[dst + 3] = Math.round(rgba[dst + 3] * alpha);
        }
      }
    }
  }

  return {
    buffer: await sharp(rgba, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer(),
    punchedFraction: punched / (width * height),
    backdrop,
  };
}

export async function keyStickerBackground(
  input: Buffer | Uint8Array
): Promise<{ buffer: Buffer; punchedFraction: number }> {
  const { buffer, punchedFraction, backdrop } = await punchFlatBackground(input, 'sticker');
  const isMagenta =
    backdrop.r >= MAGENTA_MIN_CHANNEL &&
    backdrop.b >= MAGENTA_MIN_CHANNEL &&
    backdrop.g <= MAGENTA_MAX_GREEN;
  if (
    !isMagenta ||
    punchedFraction < MIN_PUNCHED_FRACTION ||
    punchedFraction > MAX_PUNCHED_FRACTION
  ) {
    throw new Error(
      `Sticker key rejected: backdrop rgb(${Math.round(backdrop.r)}, ${Math.round(backdrop.g)}, ${Math.round(backdrop.b)}), keyed ${(punchedFraction * 100).toFixed(1)}% (expected magenta and ${MIN_PUNCHED_FRACTION * 100}–${MAX_PUNCHED_FRACTION * 100}% keyed)`
    );
  }
  return { buffer, punchedFraction };
}
