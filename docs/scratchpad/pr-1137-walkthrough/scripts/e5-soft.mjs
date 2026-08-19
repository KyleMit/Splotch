import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { raw, encodeQ, zoomCrop, svgLabel, stack, findEdgyCrop } from './lib.mjs';

// Same gain, same zoom, same encoder settings for both content classes — the only
// variable is what the art is made of.
const GAIN = 14,
  WIN = 190,
  ZOOM = 4;

const CASES = [
  {
    file: 'web/static/coloring/creatures/unicorn-tall.chalk.webp',
    label: 'HARD EDGE — chalk outline',
    sub: '97% of pixels are pure black or pure white',
  },
  {
    file: 'tools/asset-gen/fill-src/creatures/owl-wide.light.raw.webp',
    label: 'SOFT PAINT — light fill',
    sub: '96% of pixels are midtone paint',
  },
];

async function errorMap(src, enc, gain) {
  const [a, b] = [await raw(src), await raw(enc)];
  const out = Buffer.alloc(a.data.length * 3);
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.min(255, Math.abs(a.data[i] - b.data[i]) * gain);
    out[i * 3] = 255;
    out[i * 3 + 1] = 255 - d;
    out[i * 3 + 2] = 255 - d;
  }
  return sharp(out, { raw: { width: a.info.width, height: a.info.height, channels: 3 } })
    .png()
    .toBuffer();
}

const rows = [];
for (const c of CASES) {
  const src = await sharp(c.file).png().toBuffer();
  const crop = await findEdgyCrop(c.file, WIN);
  const enc = await encodeQ(src, 90);
  const map = await errorMap(src, enc, GAIN);
  const cells = [];
  cells.push(
    await stack([
      svgLabel(WIN * ZOOM, 34, ['the art'], { size: 18 }),
      await zoomCrop(src, { ...crop, factor: ZOOM }),
    ])
  );
  cells.push(
    await stack([
      svgLabel(WIN * ZOOM, 34, ['encoded q90'], { size: 18 }),
      await zoomCrop(enc, { ...crop, factor: ZOOM }),
    ])
  );
  cells.push(
    await stack([
      svgLabel(WIN * ZOOM, 34, [`where the error landed (x${GAIN})`], { size: 18 }),
      await zoomCrop(map, { ...crop, factor: ZOOM }),
    ])
  );
  const head = svgLabel(
    WIN * ZOOM * 3 + 24,
    56,
    [c.label, { t: c.sub, size: 15, weight: 400, fg: '#6b7280' }],
    { size: 22, bg: '#f3f4f6' }
  );
  rows.push(await stack([head, await stack(cells, { gap: 12, dir: 'h' })], { gap: 10 }));
}
await writeFile('.viz/out/e5-hard-vs-soft.png', await stack(rows, { gap: 22, bg: '#e5e7eb' }));
console.log('ok');
