import sharp from 'sharp';
import { raw, encodeQ } from './lib.mjs';
import { nearInkPaperMask, paperDirt } from './lib2.mjs';

// Control for generational idempotence: build a genuinely lossless binary source
// (pure 0 / pure 255) so no prior WebP pass is baked into the reference.
async function binarize(file) {
  const { data, info } = await raw(file);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] < 128 ? 0 : 255;
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
}

for (const f of process.argv.slice(2)) {
  const bin = await binarize(f);
  const { mask } = await nearInkPaperMask(bin);
  const line = [];
  for (const q of [75, 88, 90, 92, 95]) {
    const enc = await encodeQ(bin, q);
    const d = await paperDirt(enc, mask);
    line.push(`q${q}: dirty ${d.dirtyPct.toFixed(2)}% worst ${d.worst} ${(enc.length / 1024).toFixed(0)}KB`);
  }
  console.log(`${f}\n  ${line.join('\n  ')}`);
}
