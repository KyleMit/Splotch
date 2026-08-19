import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { raw, encodeQ, zoomCrop, svgLabel, stack, findEdgyCrop } from './lib.mjs';
import { nearInkPaperMask, paperDirt, dirtMap } from './lib2.mjs';

const file = 'web/static/coloring/creatures/unicorn-tall.outline.webp';
const WIN = 170,
  ZOOM = 4;

async function binarize(f) {
  const { data, info } = await raw(f);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] < 128 ? 0 : 255;
  return {
    buf: await sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } })
      .png()
      .toBuffer(),
    info,
  };
}
const { buf: bin, info } = await binarize(file);
const { mask } = await nearInkPaperMask(bin);
const crop = await findEdgyCrop(file, WIN);

const cells = [
  await stack([
    svgLabel(
      WIN * ZOOM,
      88,
      ['lossless source', { t: 'pure black on pure white', size: 14, weight: 400, fg: '#6b7280' }],
      { size: 19 }
    ),
    await zoomCrop(bin, { ...crop, factor: ZOOM }),
  ]),
];
for (const q of [75, 90, 92]) {
  const enc = await encodeQ(bin, q);
  const d = await paperDirt(enc, mask);
  cells.push(
    await stack([
      svgLabel(
        WIN * ZOOM,
        88,
        [
          `q${q}`,
          { t: `${d.dirtyPct.toFixed(2)}% of paper dirtied`, size: 15, weight: 500, fg: '#374151' },
          {
            t: `worst ${d.worst}/255 · ${(enc.length / 1024).toFixed(0)} KB`,
            size: 13,
            weight: 400,
            fg: '#6b7280',
          },
        ],
        { size: 20, fg: q === 92 ? '#166534' : q === 90 ? '#92400e' : '#991b1b' }
      ),
      await zoomCrop(await dirtMap(bin, enc, mask, info, 14), { ...crop, factor: ZOOM }),
    ])
  );
}
const body = await stack(cells, { gap: 12, dir: 'h' });
const bw = (await sharp(body).metadata()).width;
await writeFile(
  '.viz/out/e11-ladder.png',
  await stack(
    [
      svgLabel(
        bw,
        58,
        [
          'ONE encode from a genuinely lossless source — red = paper the encoder dirtied, 4x zoom',
          {
            t: 'chalk (q92) and pen outlines (q90) are the same content: from a clean source they measure identically',
            size: 14,
            weight: 400,
            fg: '#6b7280',
          },
        ],
        { size: 21, bg: '#f3f4f6' }
      ),
      body,
    ],
    { gap: 10, bg: '#e5e7eb' }
  )
);
console.log('ok');
