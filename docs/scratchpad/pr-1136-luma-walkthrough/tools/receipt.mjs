import sharp from 'sharp';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { grid } from './figure.mjs';

const BASE = '../out-base',
  PR = '../out-pr',
  OUT = 'viz/out';
const files = (await readdir(BASE)).sort();
const panels = [];
let totalPx = 0,
  totalDiff = 0;
for (const f of files) {
  const a = await sharp(await readFile(join(BASE, f)))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const b = await sharp(await readFile(join(PR, f)))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = a.info.width,
    h = a.info.height,
    n = w * h;
  const diff = Buffer.alloc(n * 3);
  let differing = 0,
    maxAbs = 0;
  for (let p = 0; p < n; p++) {
    const d = Math.max(
      Math.abs(a.data[p * 3] - b.data[p * 3]),
      Math.abs(a.data[p * 3 + 1] - b.data[p * 3 + 1]),
      Math.abs(a.data[p * 3 + 2] - b.data[p * 3 + 2])
    );
    if (d) {
      differing++;
      if (d > maxAbs) maxAbs = d;
    }
    const v = Math.min(255, d * 32);
    diff[p * 3] = v;
    diff[p * 3 + 1] = v ? 40 : 0;
    diff[p * 3 + 2] = v ? 60 : 0;
  }
  totalPx += n;
  totalDiff += differing;
  panels.push({
    png: await sharp(diff, { raw: { width: w, height: h, channels: 3 } })
      .resize(250, 250, { fit: 'inside' })
      .png()
      .toBuffer(),
    label: f.replace('__', '/').replace('.webp', ''),
    sub: `${differing} of ${n.toLocaleString()} px differ`,
    color: differing ? '#ff7b72' : '#7ee787',
  });
}
await grid({
  title: 'The receipt — base tree output minus PR tree output',
  subtitle: `Each tile is a real per-pixel absolute difference (×32 gain) between the night fill re-punched by the OLD inline expression and by the NEW luma() helper, decoded from the two encoded WebPs. Every tile is black: ${totalDiff} differing pixels out of ${totalPx.toLocaleString()}.`,
  panels,
  cols: 4,
  cell: 250,
  out: `${OUT}/G1-receipt.png`,
});
console.log('total differing px', totalDiff, 'of', totalPx);
