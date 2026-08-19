import sharp from 'sharp';
import { alphaOverlayRgba } from '../../../../../tools/asset-gen/lib/overlay-alpha.mjs';

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

// Paper = pure white in the clean source. Any alpha there is false ink.
async function hazeStats(sourceBin, encoded) {
  const [s, e] = [await luma(sourceBin), await luma(encoded)];
  const rgba = alphaOverlayRgba(e.data, 0);
  let paper = 0,
    hazed = 0,
    sumAlpha = 0,
    worst = 0;
  const hist = {};
  for (let i = 0; i < s.data.length; i++) {
    if (s.data[i] !== 255) continue;
    paper++;
    const a = rgba[i * 4 + 3];
    if (a > 0) {
      hazed++;
      sumAlpha += a;
      if (a > worst) worst = a;
      hist[a] = (hist[a] || 0) + 1;
    }
  }
  return {
    paperPct: (hazed / paper) * 100,
    hazedPx: hazed,
    meanAlpha: hazed ? sumAlpha / hazed : 0,
    worst,
    hist,
  };
}

const file = process.argv[2] || 'web/static/coloring/creatures/unicorn-tall.outline.webp';
const bin = await binarize(file);
console.log(`${file}\n`);
console.log('q      haze px   % of paper   mean alpha   worst alpha   outline KB');
for (const q of [90, 92, 95, 98, 100]) {
  const enc = await sharp(bin).webp({ quality: q }).toBuffer();
  const st = await hazeStats(bin, enc);
  console.log(
    `q${String(q).padEnd(4)} ${String(st.hazedPx).padStart(8)}   ${st.paperPct.toFixed(3).padStart(8)}%   ` +
      `${st.meanAlpha.toFixed(1).padStart(9)}   ${String(st.worst).padStart(11)}   ${(enc.length / 1024).toFixed(0).padStart(9)}`
  );
}
const ll = await sharp(bin).webp({ lossless: true, effort: 6 }).toBuffer();
const st = await hazeStats(bin, ll);
console.log(
  `loss ${String(st.hazedPx).padStart(8)}   ${st.paperPct.toFixed(3).padStart(8)}%   ${st.meanAlpha.toFixed(1).padStart(9)}   ${String(st.worst).padStart(11)}   ${(ll.length / 1024).toFixed(0).padStart(9)}`
);
