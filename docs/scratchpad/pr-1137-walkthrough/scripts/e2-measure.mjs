import sharp from 'sharp';
import { raw, encodeQ } from './lib.mjs';

// Ringing = flat paper that stops being flat. Only count pixels the lossless
// source says are pure paper, and only those within a few px of ink.
async function paperDirt(buf, mask) {
  const { data } = await raw(buf);
  let sum = 0, worst = 0, dirty = 0, n = 0;
  for (let i = 0; i < data.length; i++) {
    if (!mask[i]) continue;
    n++;
    const d = 255 - data[i];
    sum += d;
    if (d > worst) worst = d;
    if (d > 6) dirty++;
  }
  return { mean: sum / n, worst, dirtyPct: (dirty / n) * 100, n };
}

async function nearInkPaperMask(file) {
  const { data, info } = await raw(file);
  const { width: w, height: h } = info;
  const mask = new Uint8Array(data.length);
  const R = 6;
  for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) {
      const i = y * w + x;
      if (data[i] < 250) continue;
      let nearInk = false;
      for (let dy = -R; dy <= R && !nearInk; dy += 2)
        for (let dx = -R; dx <= R; dx += 2)
          if (data[(y + dy) * w + x + dx] < 60) { nearInk = true; break; }
      if (nearInk) mask[i] = 1;
    }
  }
  return mask;
}

const files = process.argv.slice(2);
for (const f of files) {
  const src = await sharp(f).png().toBuffer();
  const mask = await nearInkPaperMask(src);
  const out = [];
  for (const q of [75, 90, 92]) {
    let buf = src;
    const gens = [];
    for (let g = 1; g <= 5; g++) {
      buf = await encodeQ(buf, q);
      if (g === 1 || g === 5) gens.push({ g, ...(await paperDirt(buf, mask)), bytes: buf.length });
    }
    out.push({ q, gens });
  }
  console.log(`\n${f}  (paper-near-ink px: ${out[0].gens[0].n})`);
  for (const { q, gens } of out)
    for (const g of gens)
      console.log(`  q${q} gen${g.g}: mean dirt ${g.mean.toFixed(2)}  worst ${g.worst}  dirty>6 ${g.dirtyPct.toFixed(1)}%  ${(g.bytes/1024).toFixed(0)}KB`);
}
