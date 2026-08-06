// Cuts a subject out of a deliberately flat, uniform backdrop and returns it as
// RGBA with the backdrop transparent — used for the Sticker style cover, which
// is generated on a plain grey field so the picker's own --paper shows through
// instead of a baked plate (docs/style-cover-theme-fork.md).
//
// The fill is seeded from the border and spreads only through connected
// background, so a grey INSIDE the artwork is never cut away — a global color
// match would punch holes in the picture.
import sharp from 'sharp';

// Squared euclidean RGB distance under which a pixel counts as backdrop. Sized
// for a flat generated field with mild codec noise: high enough to swallow webp
// ringing, far below the gap to the sticker's white die-cut band.
const BACKDROP_TOLERANCE_SQ = 34 * 34 * 3;

// The keyed edge still carries a rim of half-backdrop pixels from the model's
// own antialiasing. Growing the mask by this many pixels eats the rim rather
// than leaving a grey halo around the cutout.
const RIM_BLEED_PX = 2;

function dominantBorderColor(data, width, height, channels) {
  const counts = new Map();
  const sample = (x, y) => {
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

function floodFillBackdrop(data, width, height, channels, backdrop) {
  const mask = new Uint8Array(width * height);
  const stack = [];
  const consider = (x, y) => {
    const p = y * width + x;
    if (mask[p]) return;
    const i = p * channels;
    const dr = data[i] - backdrop.r;
    const dg = data[i + 1] - backdrop.g;
    const db = data[i + 2] - backdrop.b;
    if (dr * dr + dg * dg + db * db > BACKDROP_TOLERANCE_SQ) return;
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
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) consider(x - 1, y);
    if (x < width - 1) consider(x + 1, y);
    if (y > 0) consider(x, y - 1);
    if (y < height - 1) consider(x, y + 1);
  }
  return mask;
}

function growMask(mask, width, height, radius) {
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

/**
 * @returns {Promise<{ buffer: Buffer, punchedFraction: number }>} PNG bytes with
 * the backdrop transparent, plus the share of pixels that were cut — a caller
 * can reject a render whose backdrop was never found (fraction ~0) or that got
 * eaten entirely (fraction ~1).
 */
export async function punchFlatBackground(input) {
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
    }
  }

  return {
    buffer: await sharp(rgba, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer(),
    punchedFraction: punched / (width * height),
  };
}
