import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { raw, svgLabel, stack, zoomCrop, encodeQ } from './lib.mjs';

const DISPLAY = 141; // measured in the running app: Pick-a-style modal, 900x900 viewport
const CW = 340,
  ZW = 110,
  ZF = 3;
const file = 'web/static/styles/felt.light.webp';
const src = await sharp(file).png().toBuffer();

// Crop where q75 has the most to lose: the busiest texture in the image.
async function busiestCrop(buf, win) {
  const { data, info } = await raw(buf);
  let best = { v: -1, left: 0, top: 0 };
  for (let top = 0; top + win <= info.height; top += 10)
    for (let left = 0; left + win <= info.width; left += 10) {
      let s = 0,
        s2 = 0,
        n = 0;
      for (let y = top; y < top + win; y += 3)
        for (let x = left; x < left + win; x += 3) {
          const v = data[y * info.width + x];
          s += v;
          s2 += v * v;
          n++;
        }
      const varr = s2 / n - (s / n) ** 2;
      if (varr > best.v) best = { v: varr, left, top };
    }
  return { left: best.left, top: best.top, w: win, h: win };
}
const crop = await busiestCrop(src, ZW);

async function ampDiffBuf(a, b, gain) {
  const [x, y] = [await raw(a), await raw(b)];
  const out = Buffer.alloc(x.data.length * 3);
  for (let i = 0; i < x.data.length; i++) {
    const d = Math.min(255, Math.abs(x.data[i] - y.data[i]) * gain);
    out[i * 3] = 255;
    out[i * 3 + 1] = 255 - d;
    out[i * 3 + 2] = 255 - d;
  }
  return sharp(out, { raw: { width: x.info.width, height: x.info.height, channels: 3 } })
    .png()
    .toBuffer();
}

function center(buf, w, h) {
  return sharp(buf)
    .metadata()
    .then((m) =>
      sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } })
        .composite([
          { input: buf, left: Math.round((w - m.width) / 2), top: Math.round((h - m.height) / 2) },
        ])
        .png()
        .toBuffer()
    );
}

const cells = [];
const encs = {};
for (const q of [75, 92]) {
  const enc = await encodeQ(src, q);
  encs[q] = enc;
  cells.push(
    await stack(
      [
        svgLabel(
          CW,
          52,
          [
            `q${q}`,
            {
              t: `${(enc.length / 1024).toFixed(0)} KB per cover`,
              size: 14,
              weight: 400,
              fg: '#6b7280',
            },
          ],
          { size: 20, fg: q === 75 ? '#991b1b' : '#166534' }
        ),
        svgLabel(CW, 24, ['what the app actually shows — 141 px'], {
          size: 13,
          weight: 400,
          fg: '#6b7280',
        }),
        await center(await sharp(enc).resize(DISPLAY, DISPLAY).png().toBuffer(), CW, DISPLAY),
        svgLabel(CW, 30, [`${ZF}x zoom on the busiest texture`], {
          size: 13,
          weight: 400,
          fg: '#6b7280',
        }),
        await center(await zoomCrop(enc, { ...crop, factor: ZF }), CW, ZW * ZF),
      ],
      { gap: 4 }
    )
  );
}
const diff = await ampDiffBuf(encs[92], encs[75], 6);
cells.push(
  await stack(
    [
      svgLabel(
        CW,
        52,
        ['q75 vs q92', { t: 'what q75 threw away (x6)', size: 14, weight: 400, fg: '#6b7280' }],
        { size: 20, fg: '#6b7280' }
      ),
      svgLabel(CW, 24, [' '], { size: 13 }),
      await center(await sharp(diff).resize(DISPLAY, DISPLAY).png().toBuffer(), CW, DISPLAY),
      svgLabel(CW, 30, [`${ZF}x zoom, same crop`], { size: 13, weight: 400, fg: '#6b7280' }),
      await center(await zoomCrop(diff, { ...crop, factor: ZF }), CW, ZW * ZF),
    ],
    { gap: 4 }
  )
);

const body = await stack(cells, { gap: 12, dir: 'h' });
const bw = (await sharp(body).metadata()).width;
await writeFile(
  '.viz/out/e7-covers.png',
  await stack(
    [
      svgLabel(
        bw,
        54,
        [
          'gen-style-covers q75 — the artifacts are real; the 141 px display size is what hides them',
        ],
        { size: 21, bg: '#f3f4f6' }
      ),
      body,
    ],
    { gap: 10, bg: '#e5e7eb' }
  )
);
console.log('crop', crop, 'ok');
