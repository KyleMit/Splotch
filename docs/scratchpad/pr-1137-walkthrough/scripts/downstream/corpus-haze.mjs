import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { globSync } from 'node:fs';
import { alphaOverlayRgba } from '../../../../../tools/asset-gen/lib/overlay-alpha.mjs';

const FAR = 4;
async function luma(b) {
  const { data, info } = await sharp(b).grayscale().raw().toBuffer({ resolveWithObject: true });
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

const CATS = ['creatures', 'dinosaur', 'farm', 'nature', 'objects', 'shapes', 'space', 'vehicles'];
const picks = [];
for (let r = 0; picks.length < 12; r++)
  for (const c of CATS) {
    const f = globSync(`web/static/coloring/${c}/*-{tall,wide}.outline.webp`).sort();
    if (f[r] && picks.length < 12) picks.push(f[r]);
  }
let sumLight = 0,
  sumDark = 0,
  n = 0,
  savedKb = 0,
  totalKb = 0;
console.log(
  'page                              light overlay   dark overlay   (% far-paper carrying ink alpha)'
);
for (const o of picks) {
  const base = o.replace(/\.outline\.webp$/, '');
  const { data: ol, info } = await luma(o);
  const far = farMask(ol, info.width, info.height, FAR);
  const farN = far.reduce((a, b) => a + b, 0);
  const row = [];
  for (const suf of ['.overlay.webp', '.dark.overlay.webp']) {
    const f = `${base}${suf}`;
    const buf = await readFile(f);
    const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let h = 0;
    for (let i = 0; i < far.length; i++) if (far[i] && data[i * 4 + 3] > 0) h++;
    row.push((h / farN) * 100);
    if (suf === '.overlay.webp') {
      // byte cost of that far-field haze in the shipped file
      const cleaned = Buffer.from(data);
      for (let i = 0; i < far.length; i++) if (far[i]) cleaned[i * 4 + 3] = 0;
      const re = await sharp(cleaned, {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
        .webp({ lossless: true, effort: 6 })
        .toBuffer();
      savedKb += (buf.length - re.length) / 1024;
      totalKb += buf.length / 1024;
    }
  }
  sumLight += row[0];
  sumDark += row[1];
  n++;
  console.log(
    `${base.replace('web/static/coloring/', '').padEnd(34)} ${row[0].toFixed(2).padStart(7)}%      ${row[1].toFixed(2).padStart(7)}%`
  );
}
console.log(
  `\nMEAN across ${n}: light ${(sumLight / n).toFixed(2)}%   dark ${(sumDark / n).toFixed(2)}%`
);
console.log(
  `Byte cost of the far-field haze in the light overlays: ${savedKb.toFixed(0)} KB of ${totalKb.toFixed(0)} KB (${((savedKb / totalKb) * 100).toFixed(1)}%)`
);
