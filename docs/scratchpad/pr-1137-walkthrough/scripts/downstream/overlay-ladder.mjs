import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { alphaOverlayRgba } from '../../../../../tools/asset-gen/lib/overlay-alpha.mjs';

const page = process.argv[2] || 'web/static/coloring/creatures/unicorn-tall';

async function luma(buf) {
  const { data, info } = await sharp(buf).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}
async function binarize(file) {
  const { data, info } = await luma(file);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] < 128 ? 0 : 255;
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer();
}
// Exactly gen-overlays.mjs writeOverlay(): luma -> alphaOverlayRgba -> lossless webp
async function buildOverlay(outlineBuf) {
  const { data, info } = await luma(outlineBuf);
  const rgba = alphaOverlayRgba(data, 0);
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
}
async function hazeOnPaper(overlayBuf, paperMask) {
  const { data } = await sharp(overlayBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hazed = 0,
    paper = 0;
  for (let i = 0; i < paperMask.length; i++) {
    if (!paperMask[i]) continue;
    paper++;
    if (data[i * 4 + 3] > 0) hazed++;
  }
  return { hazed, paper, pct: (hazed / paper) * 100 };
}

const bin = await binarize(`${page}.outline.webp`);
const binLuma = (await luma(bin)).data;
const paperMask = new Uint8Array(binLuma.length);
for (let i = 0; i < binLuma.length; i++) paperMask[i] = binLuma[i] === 255 ? 1 : 0;

console.log(`${page}\n`);
console.log('outline stored as     haze px on paper   % paper   OVERLAY size (lossless, shipped)');
for (const q of [90, 92, 95, 98]) {
  const enc = await sharp(bin).webp({ quality: q }).toBuffer();
  const ov = await buildOverlay(enc);
  const h = await hazeOnPaper(ov, paperMask);
  console.log(
    `q${String(q).padEnd(19)} ${String(h.hazed).padStart(9)}   ${h.pct.toFixed(3).padStart(7)}%   ${(ov.length / 1024).toFixed(0).padStart(10)} KB`
  );
}
const ovClean = await buildOverlay(bin);
const hc = await hazeOnPaper(ovClean, paperMask);
console.log(
  `lossless / no ringing ${String(hc.hazed).padStart(9)}   ${hc.pct.toFixed(3).padStart(7)}%   ${(ovClean.length / 1024).toFixed(0).padStart(10)} KB`
);

const shippedOv = await readFile(`${page}.overlay.webp`);
const hs = await hazeOnPaper(shippedOv, paperMask);
console.log(
  `\nSHIPPED TODAY         ${String(hs.hazed).padStart(9)}   ${hs.pct.toFixed(3).padStart(7)}%   ${(shippedOv.length / 1024).toFixed(0).padStart(10)} KB`
);
