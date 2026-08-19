import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { alphaOverlayRgba } from '../../../../../tools/asset-gen/lib/overlay-alpha.mjs';

const FAR_PX = 4;
async function luma(buf) {
  const { data, info } = await sharp(buf).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}
function farMask(l, w, h, r) {
  const INF = 1e6,
    d = new Float32Array(l.length);
  for (let i = 0; i < d.length; i++) d[i] = l[i] < 128 ? 0 : INF;
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
  const m = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) m[i] = d[i] > r ? 1 : 0;
  return m;
}

const page = process.argv[2] || 'web/static/coloring/creatures/unicorn-tall';
const src = await sharp(`${page}.outline.webp`).png().toBuffer();
const { data: ol, info } = await luma(src);
const far = farMask(ol, info.width, info.height, FAR_PX);
const farCount = far.reduce((a, b) => a + b, 0);

console.log(`${page} — snap near-white paper to pure white BEFORE building the overlay\n`);
console.log('paper floor   far-field haze px   % far paper   overlay KB   ink pixels kept');
for (const floor of [null, 254, 251, 248, 240]) {
  const l = Buffer.from(ol);
  if (floor !== null) for (let i = 0; i < l.length; i++) if (l[i] >= floor) l[i] = 255;
  const rgba = alphaOverlayRgba(l, 0);
  const buf = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  let h = 0,
    ink = 0;
  for (let i = 0; i < far.length; i++) {
    if (rgba[i * 4 + 3] > 0) ink++;
    if (far[i] && rgba[i * 4 + 3] > 0) h++;
  }
  console.log(
    `${String(floor ?? 'none').padEnd(13)} ${String(h).padStart(10)}   ${((h / farCount) * 100).toFixed(2).padStart(10)}%   ${(buf.length / 1024).toFixed(0).padStart(10)}   ${String(ink).padStart(14)}`
  );
}
