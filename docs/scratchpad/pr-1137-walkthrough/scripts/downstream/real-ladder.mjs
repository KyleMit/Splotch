import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { alphaOverlayRgba } from '../../../../../tools/asset-gen/lib/overlay-alpha.mjs';

const FAR_PX = 4;
async function luma(buf) {
  const { data, info } = await sharp(buf).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}
function farFromInkMask(l, w, h, radius) {
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
  for (let i = 0; i < d.length; i++) m[i] = d[i] > radius ? 1 : 0;
  return m;
}
async function overlayFrom(outlineBuf) {
  const { data, info } = await luma(outlineBuf);
  const rgba = alphaOverlayRgba(data, 0);
  return {
    buf: await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
      .webp({ lossless: true, effort: 6 })
      .toBuffer(),
    rgba,
  };
}

const page = process.argv[2] || 'web/static/coloring/creatures/unicorn-tall';
const src = await sharp(`${page}.outline.webp`).png().toBuffer();
const { data: ol, info } = await luma(src);
const far = farFromInkMask(ol, info.width, info.height, FAR_PX);
const farCount = far.reduce((a, b) => a + b, 0);

console.log(`${page} — REAL shipped outline as the source (its render noise already baked in)\n`);
console.log('re-encode outline at   far-field haze px   % of far paper   overlay KB');
for (const q of [75, 90, 92, 95, 98]) {
  const enc = await sharp(src).webp({ quality: q }).toBuffer();
  const { buf, rgba } = await overlayFrom(enc);
  let h = 0;
  for (let i = 0; i < far.length; i++) if (far[i] && rgba[i * 4 + 3] > 0) h++;
  console.log(
    `q${String(q).padEnd(20)} ${String(h).padStart(10)}   ${((h / farCount) * 100).toFixed(2).padStart(12)}%   ${(buf.length / 1024).toFixed(0).padStart(9)}`
  );
}
const { buf, rgba } = await overlayFrom(src);
let h = 0;
for (let i = 0; i < far.length; i++) if (far[i] && rgba[i * 4 + 3] > 0) h++;
console.log(
  `lossless (no re-encode)${String(h).padStart(10)}   ${((h / farCount) * 100).toFixed(2).padStart(12)}%   ${(buf.length / 1024).toFixed(0).padStart(9)}`
);
console.log(
  `\nshipped overlay today: ${((await readFile(`${page}.overlay.webp`)).length / 1024).toFixed(0)} KB`
);
