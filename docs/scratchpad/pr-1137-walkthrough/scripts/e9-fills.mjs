import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { globSync } from 'node:fs';
import { raw, svgLabel, stack, encodeQ } from './lib.mjs';

const variant = process.argv[2]; // light | night
const outName = process.argv[3];
const CATS = ['creatures', 'dinosaur', 'farm', 'nature', 'objects', 'shapes', 'space', 'vehicles'];

const picks = [];
for (let round = 0; picks.length < 12; round++)
  for (const c of CATS) {
    const fs = globSync(`tools/asset-gen/fill-src/${c}/*.${variant}.raw.webp`).sort();
    if (fs[round] && picks.length < 12) picks.push(fs[round]);
  }

async function meanAbsErr(a, b) {
  const [x, y] = [await raw(a), await raw(b)];
  let s = 0,
    worst = 0;
  for (let i = 0; i < x.data.length; i++) {
    const d = Math.abs(x.data[i] - y.data[i]);
    s += d;
    if (d > worst) worst = d;
  }
  return { mean: s / x.data.length, worst };
}

const TILE = 210;
const tiles = [];
let sum90 = 0,
  sum92 = 0,
  b90 = 0,
  b92 = 0;
for (const f of picks) {
  const src = await sharp(f).png().toBuffer();
  const e90 = await encodeQ(src, 90),
    e92 = await encodeQ(src, 92);
  const m90 = await meanAbsErr(src, e90),
    m92 = await meanAbsErr(src, e92);
  sum90 += m90.mean;
  sum92 += m92.mean;
  b90 += e90.length;
  b92 += e92.length;
  const name = f.replace('tools/asset-gen/fill-src/', '').replace(`.${variant}.raw.webp`, '');
  tiles.push(
    await stack([
      await sharp(src)
        .resize(TILE, TILE, { fit: 'contain', background: '#ffffff' })
        .png()
        .toBuffer(),
      svgLabel(TILE, 22, [name], { size: 12, weight: 600, fg: '#374151' }),
      svgLabel(TILE, 20, [`q90 err ${m90.mean.toFixed(2)} vs q92 ${m92.mean.toFixed(2)} /255`], {
        size: 11,
        weight: 500,
        fg: '#6b7280',
      }),
    ])
  );
  console.log(
    `${name}: q90 mean ${m90.mean.toFixed(2)} worst ${m90.worst} | q92 mean ${m92.mean.toFixed(2)} worst ${m92.worst}`
  );
}
const rows = [];
for (let i = 0; i < tiles.length; i += 6)
  rows.push(await stack(tiles.slice(i, i + 6), { gap: 10, dir: 'h' }));
const body = await stack(rows, { gap: 14 });
const bw = (await sharp(body).metadata()).width;
const gen = variant === 'light' ? 'gen-light-fills' : 'gen-night-fills';
await writeFile(
  `.viz/out/${outName}`,
  await stack(
    [
      svgLabel(
        bw,
        52,
        [
          `${gen} q90 — 12 of the 96 ${variant} raw fills it encodes`,
          {
            t: 'err = mean absolute pixel error vs the lossless source, out of 255',
            size: 14,
            weight: 400,
            fg: '#6b7280',
          },
        ],
        { size: 20, bg: '#f3f4f6' }
      ),
      body,
    ],
    { gap: 10, bg: '#e5e7eb' }
  )
);
console.log(
  `\nMEAN: q90 ${(sum90 / 12).toFixed(2)}  q92 ${(sum92 / 12).toFixed(2)}  | bytes q90 ${(b90 / 1024).toFixed(0)}KB q92 ${(b92 / 1024).toFixed(0)}KB (${(((b92 - b90) / b92) * 100).toFixed(1)}% saved)`
);
