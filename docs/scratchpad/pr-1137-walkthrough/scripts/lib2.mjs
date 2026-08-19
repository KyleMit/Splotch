import sharp from 'sharp';
import { raw, encodeQ } from './lib.mjs';

export async function nearInkPaperMask(file, R = 6) {
  const { data, info } = await raw(file);
  const { width: w, height: h } = info;
  const mask = new Uint8Array(data.length);
  for (let y = R; y < h - R; y++)
    for (let x = R; x < w - R; x++) {
      const i = y * w + x;
      if (data[i] < 250) continue;
      let near = false;
      for (let dy = -R; dy <= R && !near; dy += 2)
        for (let dx = -R; dx <= R; dx += 2)
          if (data[(y + dy) * w + x + dx] < 60) { near = true; break; }
      if (near) mask[i] = 1;
    }
  return { mask, info };
}

export async function paperDirt(buf, mask) {
  const { data } = await raw(buf);
  let sum = 0, worst = 0, dirty = 0, n = 0;
  for (let i = 0; i < data.length; i++) {
    if (!mask[i]) continue;
    n++;
    const d = 255 - data[i];
    sum += d; if (d > worst) worst = d; if (d > 6) dirty++;
  }
  return { mean: sum / n, worst, dirtyPct: (dirty / n) * 100, n };
}

// Ink stays grey for orientation; contaminated paper burns red.
export async function dirtMap(src, encoded, mask, info, gain = 14) {
  const [s, e] = [await raw(src), await raw(encoded)];
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < mask.length; i++) {
    const ink = s.data[i] < 128;
    let r = 255, g = 255, b = 255;
    if (ink) { r = g = b = 205; }
    if (mask[i]) {
      const d = Math.min(255, (255 - e.data[i]) * gain);
      r = 255; g = 255 - d; b = 255 - d;
    }
    out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
}

export { encodeQ };
