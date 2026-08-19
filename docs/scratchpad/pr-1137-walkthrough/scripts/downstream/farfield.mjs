import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

// Antialiasing hugs a stroke edge (1-2 px). Alpha found further out than that is
// not smoothing — it is encoder ringing carried into the overlay's alpha channel.
const FAR_PX = 4;

async function luma(buf) {
  const { data, info } = await sharp(buf).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}

// Distance-to-ink via two-pass chamfer, cheap and good enough at this radius.
function farFromInkMask(lumaData, w, h, radius) {
  const INF = 1e6;
  const d = new Float32Array(lumaData.length);
  for (let i = 0; i < d.length; i++) d[i] = lumaData[i] < 128 ? 0 : INF;
  const put = (i, v) => {
    if (v < d[i]) d[i] = v;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (y > 0) put(i, d[i - w] + 1);
      if (x > 0) put(i, d[i - 1] + 1);
      if (y > 0 && x > 0) put(i, d[i - w - 1] + 1.414);
      if (y > 0 && x < w - 1) put(i, d[i - w + 1] + 1.414);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (y < h - 1) put(i, d[i + w] + 1);
      if (x < w - 1) put(i, d[i + 1] + 1);
      if (y < h - 1 && x < w - 1) put(i, d[i + w + 1] + 1.414);
      if (y < h - 1 && x > 0) put(i, d[i + w - 1] + 1.414);
    }
  const mask = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) mask[i] = d[i] > radius ? 1 : 0;
  return mask;
}

const page = process.argv[2] || 'web/static/coloring/creatures/unicorn-tall';
const { data: ol, info } = await luma(`${page}.outline.webp`);
const far = farFromInkMask(ol, info.width, info.height, FAR_PX);

const overlay = await readFile(`${page}.overlay.webp`);
const { data: rgba } = await sharp(overlay)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let farPx = 0,
  hazed = 0,
  worst = 0;
const hist = {};
for (let i = 0; i < far.length; i++) {
  if (!far[i]) continue;
  farPx++;
  const a = rgba[i * 4 + 3];
  if (a > 0) {
    hazed++;
    if (a > worst) worst = a;
    hist[a] = (hist[a] || 0) + 1;
  }
}
console.log(`${page}.overlay.webp  (${(overlay.length / 1024).toFixed(0)} KB)`);
console.log(`  far-from-ink pixels (>${FAR_PX}px): ${farPx}`);
console.log(
  `  carrying alpha > 0: ${hazed}  (${((hazed / farPx) * 100).toFixed(2)}% of far paper)  worst alpha ${worst}`
);
console.log(
  `  alpha histogram out there:`,
  Object.entries(hist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `a${k}:${v}`)
    .join('  ')
);

// What does that far-field haze cost in shipped bytes? Zero it and re-encode.
const cleaned = Buffer.from(rgba);
for (let i = 0; i < far.length; i++) if (far[i]) cleaned[i * 4 + 3] = 0;
const reenc = await sharp(cleaned, { raw: { width: info.width, height: info.height, channels: 4 } })
  .webp({ lossless: true, effort: 6 })
  .toBuffer();
console.log(
  `  overlay with far-field haze removed: ${(reenc.length / 1024).toFixed(0)} KB  (${(((overlay.length - reenc.length) / overlay.length) * 100).toFixed(1)}% smaller)`
);
