// Shared machinery for the idea-1 dark-rim experiments.
// Run from the Splotch repo root so `sharp` resolves from the root node_modules.
import { createRequire } from 'node:module';
import { dilateMask } from '/home/user/Splotch/tools/asset-gen/lib/morphology.mjs';

// Resolve sharp from the Splotch repo root (this file lives outside the repo).
export const sharp = createRequire('/home/user/Splotch/tools/asset-gen/x.mjs')('sharp');

export const PUNCH_LUMA = 150; // lib/punch-fill.mjs OUTLINE_LUMA_THRESHOLD
export const PAPER_DARK = [0x21, 0x1f, 0x29];

export async function loadRgb(path) {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgb: data, width: info.width, height: info.height };
}

export function lumaOf(rgb, p) {
  return 0.299 * rgb[p * 3] + 0.587 * rgb[p * 3 + 1] + 0.114 * rgb[p * 3 + 2];
}

// Binary chalk-ink mask at the fill's resolution (same math as punchFill).
export async function chalkMask(chalkPath, width, height) {
  const { data: line } = await sharp(chalkPath)
    .removeAlpha()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < width * height; p++, i += 3) {
    const luma = 0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2];
    if (luma < PUNCH_LUMA) mask[p] = 1;
  }
  return mask;
}

// Ring bands: band[d] = pixels at chebyshev distance exactly d from the mask (d=1..maxD).
export function ringBands(mask, w, h, maxD) {
  const bands = [];
  let prev = mask;
  for (let d = 1; d <= maxD; d++) {
    const grown = dilateMask(mask, w, h, d);
    const band = [];
    for (let p = 0; p < w * h; p++) if (grown[p] && !prev[p]) band.push(p);
    bands.push(band);
    prev = grown;
  }
  return bands;
}

// Copy of lib/punch-fill.mjs bleedUnderMask (kept verbatim so results match shipping).
export function bleedUnderMask(rgb, mask, width, height) {
  const pending = mask.slice();
  let ring = [];
  for (let p = 0; p < width * height; p++) if (pending[p]) ring.push(p);
  while (ring.length) {
    const done = [];
    const next = [];
    for (const p of ring) {
      const x = p % width;
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q < 0 || q >= width * height || pending[q]) continue;
        r += rgb[q * 3];
        g += rgb[q * 3 + 1];
        b += rgb[q * 3 + 2];
        n++;
      }
      if (!n) {
        next.push(p);
        continue;
      }
      rgb[p * 3] = Math.round(r / n);
      rgb[p * 3 + 1] = Math.round(g / n);
      rgb[p * 3 + 2] = Math.round(b / n);
      done.push(p);
    }
    if (!done.length) break;
    for (const p of done) pending[p] = 0;
    ring = next;
  }
}

// Punch a raw fill buffer against an arbitrary mask, return punched RGB.
export function punchWithMask(rawRgb, mask, w, h) {
  const rgb = Buffer.from(rawRgb);
  bleedUnderMask(rgb, mask, w, h);
  return rgb;
}

// Composite exactly like lib/night-composite.mjs but from a pre-punched fill RGB.
// (compositeNight re-punches internally from the raw; for shipped/experimental
// fills we composite the already-punched RGB: paper where chalk ink, else fill,
// then screen the chalk white on top.)
export async function compositePunched(fillRgb, chalkPath, w, h) {
  const { data: ink } = await sharp(chalkPath)
    .grayscale()
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(w * h * 3);
  for (let p = 0, i = 0; p < w * h; p++, i += 3) {
    const punched = ink[p] < PUNCH_LUMA;
    const chalkWhite = 255 - ink[p];
    for (let c = 0; c < 3; c++) {
      const base = punched ? PAPER_DARK[c] : fillRgb[i + c];
      out[i + c] = 255 - ((255 - base) * (255 - chalkWhite)) / 255;
    }
  }
  return { rgb: out, w, h };
}

// Rim-darkness metric: for band-d pixels (just outside the chalk ink), how dark
// is the punched fill relative to the "true" local fill sampled at distance
// refD (well clear of any re-inked rim)? Reports the count/share of band pixels
// darker than their reference by more than `gap` luma.
export function rimStats(fillRgb, bands, w, h) {
  const stats = [];
  for (let d = 0; d < bands.length; d++) {
    const lumas = bands[d].map((p) => lumaOf(fillRgb, p));
    lumas.sort((a, b) => a - b);
    const q = (f) => lumas[Math.floor(f * (lumas.length - 1))] ?? NaN;
    stats.push({
      d: d + 1,
      n: lumas.length,
      p10: q(0.1),
      p25: q(0.25),
      median: q(0.5),
      darkShare: lumas.filter((l) => l < 90).length / (lumas.length || 1),
    });
  }
  return stats;
}

export async function saveRgb(rgb, w, h, path, resizeLong) {
  let img = sharp(rgb, { raw: { width: w, height: h, channels: 3 } });
  if (resizeLong) img = img.resize(w >= h ? { width: resizeLong } : { height: resizeLong });
  await img.webp({ quality: 90 }).toFile(path);
}

// Crop a region and upscale (nearest) for zoom evidence, long side <= maxSide.
export async function saveCrop(rgb, w, h, box, path, maxSide = 560) {
  const { left, top, width, height } = box;
  const crop = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 3; c++)
        crop[(y * width + x) * 3 + c] = rgb[((top + y) * w + (left + x)) * 3 + c];
  const scale = Math.max(1, Math.floor(maxSide / Math.max(width, height)));
  await sharp(crop, { raw: { width, height, channels: 3 } })
    .resize(width * scale, height * scale, { kernel: 'nearest' })
    .webp({ quality: 92, effort: 5 })
    .toFile(path);
}
