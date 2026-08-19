import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { svgLabel, stack, zoomCrop } from '../lib.mjs';
import { alphaOverlayRgba } from '../../../../../tools/asset-gen/lib/overlay-alpha.mjs';

const PAPER = { r: 0xfc, g: 0xfb, b: 0xf8 }; // --paper, light theme
const page = 'web/static/coloring/creatures/unicorn-tall';

async function luma(b) {
  const { data, info } = await sharp(b).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}
// Composite black-ink alpha over the app's paper colour, as the canvas does.
async function onPaper(rgbaBuf, info) {
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) {
    const a = rgbaBuf[i * 4 + 3] / 255;
    out[i * 3] = Math.round(PAPER.r * (1 - a));
    out[i * 3 + 1] = Math.round(PAPER.g * (1 - a));
    out[i * 3 + 2] = Math.round(PAPER.b * (1 - a));
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
    .png()
    .toBuffer();
}
// Every pixel that carries ink alpha, amplified so faint speckle becomes visible.
async function alphaMap(rgbaBuf, info, gain) {
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) {
    const d = Math.min(255, rgbaBuf[i * 4 + 3] * gain);
    out[i * 3] = 255;
    out[i * 3 + 1] = 255 - d;
    out[i * 3 + 2] = 255 - d;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
    .png()
    .toBuffer();
}

const { data: ol, info } = await luma(`${page}.outline.webp`);
const asIs = alphaOverlayRgba(ol, 0);
const floored = Buffer.from(ol);
for (let i = 0; i < floored.length; i++) if (floored[i] >= 248) floored[i] = 255;
const clean = alphaOverlayRgba(floored, 0);

// A crop of open paper — a region the art leaves blank, where only speckle lives.
const CROP = { left: 120, top: 120, w: 200, h: 200, factor: 3 };
const GAIN = 14;

const cols = [];
for (const [title, sub, rgba] of [
  ['shipped today', 'overlay built from the outline as stored', asIs],
  ['paper floor at 248', 'near-white snapped to pure white first', clean],
]) {
  cols.push(
    await stack(
      [
        svgLabel(
          CROP.w * CROP.factor,
          56,
          [title, { t: sub, size: 13, weight: 400, fg: '#6b7280' }],
          { size: 19 }
        ),
        svgLabel(CROP.w * CROP.factor, 24, ['composited on --paper, 1:1 colour'], {
          size: 12,
          weight: 400,
          fg: '#9ca3af',
        }),
        await zoomCrop(await onPaper(rgba, info), CROP),
        svgLabel(CROP.w * CROP.factor, 26, [`the same alpha, amplified x${GAIN}`], {
          size: 12,
          weight: 400,
          fg: '#9ca3af',
        }),
        await zoomCrop(await alphaMap(rgba, info, GAIN), CROP),
      ],
      { gap: 4 }
    )
  );
}
const body = await stack(cols, { gap: 14, dir: 'h' });
const bw = (await sharp(body).metadata()).width;
await mkdir('.viz-out', { recursive: true });
await writeFile(
  '.viz-out/speckle.png',
  await stack(
    [
      svgLabel(
        bw,
        58,
        [
          'A patch of OPEN PAPER in the canvas overlay — no line art here at all',
          {
            t: 'the speckle is alpha 8/255 (3% black); raising the outline past q92 does not remove it',
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
