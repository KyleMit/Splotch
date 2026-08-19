import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { grid } from './figure.mjs';
import { luma } from '../tools/asset-gen/lib/image-stats.mjs';

const COLORING = 'web/static/coloring';
const FILLSRC = 'tools/asset-gen/fill-src';
const OUT = 'viz/out';

async function pair(path) {
  const buf = await readFile(path);
  const { data: rgbData, info } = await sharp(buf)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: vips } = await sharp(buf)
    .removeAlpha()
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width,
    h = info.height,
    n = w * h;
  const rec = new Float32Array(n);
  for (let p = 0; p < n; p++) rec[p] = luma(rgbData[p * 3], rgbData[p * 3 + 1], rgbData[p * 3 + 2]);
  return { rgbData, vips, rec, w, h, n };
}

const grayPng = (arr, w, h) => {
  const b = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) b[p] = Math.max(0, Math.min(255, Math.round(arr[p])));
  return sharp(b, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toBuffer();
};

// |vips - rec| as a heat map: 0 = black, ramps through blue/orange/white
const heatPng = (vips, rec, w, h) => {
  const b = Buffer.alloc(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    const d = Math.min(80, Math.abs(vips[p] - rec[p])) / 80;
    b[p * 3] = Math.round(255 * Math.min(1, d * 2.2));
    b[p * 3 + 1] = Math.round(255 * Math.max(0, d * 1.6 - 0.45));
    b[p * 3 + 2] = Math.round(255 * Math.max(0, d * 1.4 - 0.75));
  }
  return sharp(b, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
};

// pixels whose side of `t` differs between the two conversions
const flipPng = (vips, rec, w, h, t) => {
  const b = Buffer.alloc(w * h * 3);
  let n = 0;
  for (let p = 0; p < w * h; p++) {
    const flip = vips[p] < t !== rec[p] < t;
    if (flip) n++;
    const g = Math.round(rec[p] * 0.25 + 190 * 0.75);
    b[p * 3] = flip ? 255 : g;
    b[p * 3 + 1] = flip ? 0 : g;
    b[p * 3 + 2] = flip ? 110 : g;
  }
  return sharp(b, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer()
    .then((png) => ({ png, frac: n / (w * h) }));
};

const T = 300;
const fit = (buf) => sharp(buf).resize(T, T, { fit: 'inside' }).png().toBuffer();

const CASES = [
  {
    label: 'chalk line art (night-composite fence)',
    path: join(COLORING, 'creatures/dragon-wide.chalk.webp'),
    t: 150,
    tname: 'OUTLINE_LUMA_THRESHOLD 150',
  },
  {
    label: 'pen line art (outline-analysis fence)',
    path: join(COLORING, 'farm/cow-wide.outline.webp'),
    t: 110,
    tname: 'OUTLINE_INK_CUTOFF 110',
  },
  {
    label: 'raw colour fill (composite-eye fence)',
    path: join(FILLSRC, 'creatures/dragon-wide.light.raw.webp'),
    t: 90,
    tname: 'composite-eye DARK 90',
  },
];

const panels = [];
const stats = [];
for (const c of CASES) {
  const { rgbData, vips, rec, w, h, n } = await pair(c.path);
  let sum = 0,
    max = 0;
  for (let p = 0; p < n; p++) {
    const d = Math.abs(vips[p] - rec[p]);
    sum += d;
    if (d > max) max = d;
  }
  const { png: fp, frac } = await flipPng(vips, rec, w, h, c.t);
  stats.push({ label: c.label, mean: sum / n, max, frac, tname: c.tname });
  panels.push(
    {
      png: await fit(
        await sharp(rgbData, { raw: { width: w, height: h, channels: 3 } })
          .png()
          .toBuffer()
      ),
      label: c.label.split(' (')[0],
      sub: c.path.split('/').slice(-2).join('/'),
    },
    { png: await fit(await grayPng(rec, w, h)), label: 'Rec.601 luma()', sub: 'the shared helper' },
    {
      png: await fit(await grayPng(vips, w, h)),
      label: 'libvips .grayscale()',
      sub: 'the FENCED path — unchanged',
    },
    {
      png: await fit(await heatPng(vips, rec, w, h)),
      label: 'disagreement heat',
      sub: `mean ${(sum / n).toFixed(1)} · max ${max.toFixed(0)} levels`,
    },
    {
      png: await fit(fp),
      label: `pixels that would FLIP`,
      sub: `${c.tname} · ${(frac * 100).toFixed(2)}% flip`,
      color: '#ff7b72',
    }
  );
}
await grid({
  title: 'The fences — why three call sites were deliberately NOT unified',
  subtitle:
    'libvips .grayscale() is a linear-light Rec.709 conversion; luma() is gamma-space Rec.601. They agree on neutrals and diverge on colour. The last column paints red every pixel that would land on the OTHER side of the calibrated threshold if the fence were removed and the call site switched to luma().',
  panels,
  cols: 5,
  cell: 280,
  out: `${OUT}/C1-fences.png`,
});
console.log(JSON.stringify(stats, null, 1));
