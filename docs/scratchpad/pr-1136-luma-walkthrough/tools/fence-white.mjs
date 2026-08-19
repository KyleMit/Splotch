import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { grid } from './figure.mjs';
import { luma } from '../tools/asset-gen/lib/image-stats.mjs';

const OUT = 'viz/out';
const PAGE = 'tools/asset-gen/fill-src/creatures/mermaid-wide.light.raw.webp';
const WHITE = 200,
  DARK = 90;

const buf = await readFile(PAGE);
const { data: rgb, info } = await sharp(buf)
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
for (let p = 0; p < n; p++) rec[p] = luma(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]);

const boolPng = async (fn, on = [255, 255, 255], off = [16, 20, 28]) => {
  const b = Buffer.alloc(n * 3);
  let c = 0;
  for (let p = 0; p < n; p++) {
    const v = fn(p);
    if (v) c++;
    const col = v ? on : off;
    b[p * 3] = col[0];
    b[p * 3 + 1] = col[1];
    b[p * 3 + 2] = col[2];
  }
  return {
    png: await sharp(b, { raw: { width: w, height: h, channels: 3 } })
      .png()
      .toBuffer(),
    frac: c / n,
  };
};

const recW = await boolPng((p) => rec[p] > WHITE);
const vipsW = await boolPng((p) => vips[p] > WHITE);
const diffW = await boolPng((p) => rec[p] > WHITE !== vips[p] > WHITE, [255, 45, 85], [22, 27, 34]);
const recD = await boolPng((p) => rec[p] < DARK);
const vipsD = await boolPng((p) => vips[p] < DARK);
const diffD = await boolPng((p) => rec[p] < DARK !== vips[p] < DARK, [255, 45, 85], [22, 27, 34]);

const T = 330;
const fit = (b) => sharp(b).resize(T, T, { fit: 'inside' }).png().toBuffer();

await grid({
  title: 'Fence close-up — composite-eye DARK 90 / WHITE 200 on creatures/mermaid-wide',
  subtitle:
    'composite-eye calls those two bars against a libvips grayscale channel. Swapping in luma() would redraw the masks below — this is the shape change the calibration fence exists to prevent, and why the PR left the libvips path byte-for-byte alone.',
  panels: [
    {
      png: await fit(
        await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
          .png()
          .toBuffer()
      ),
      label: 'raw colour fill',
      sub: 'mermaid-wide.light.raw.webp',
    },
    {
      png: await fit(vipsW.png),
      label: `WHITE gate, libvips (shipping)`,
      sub: `luma > 200 → ${(vipsW.frac * 100).toFixed(1)}% of pixels`,
    },
    {
      png: await fit(recW.png),
      label: `WHITE gate, Rec.601 luma()`,
      sub: `luma > 200 → ${(recW.frac * 100).toFixed(1)}% of pixels`,
    },
    {
      png: await fit(diffW.png),
      label: 'disagreement',
      sub: `${(diffW.frac * 100).toFixed(1)}% of pixels change side`,
      color: '#ff7b72',
    },
    {
      png: await fit(
        await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
          .png()
          .toBuffer()
      ),
      label: 'raw colour fill',
      sub: 'same page',
    },
    {
      png: await fit(vipsD.png),
      label: 'DARK gate, libvips (shipping)',
      sub: `luma < 90 → ${(vipsD.frac * 100).toFixed(1)}% of pixels`,
    },
    {
      png: await fit(recD.png),
      label: 'DARK gate, Rec.601 luma()',
      sub: `luma < 90 → ${(recD.frac * 100).toFixed(1)}% of pixels`,
    },
    {
      png: await fit(diffD.png),
      label: 'disagreement',
      sub: `${(diffD.frac * 100).toFixed(1)}% of pixels change side`,
      color: '#ff7b72',
    },
  ],
  cols: 4,
  cell: 330,
  out: `${OUT}/C2-fence-white.png`,
});
console.log(
  'white',
  (vipsW.frac * 100).toFixed(2),
  (recW.frac * 100).toFixed(2),
  (diffW.frac * 100).toFixed(2)
);
console.log(
  'dark',
  (vipsD.frac * 100).toFixed(2),
  (recD.frac * 100).toFixed(2),
  (diffD.frac * 100).toFixed(2)
);
