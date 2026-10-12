// IDEA #4 experiment (temporary — delete before finishing).
// Recompute bgLuma (scoreNightness) for every committed night raw in fill-src/,
// scored against the same source gen-coloring-fills-dark.mjs uses (chalk if
// forked, else pen). Prints a sorted table + per-category summary as JSON.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { glob } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';

const NIGHT_W = 384;
const NIGHT_SRC_LIGHT = 170;
const NIGHT_MIN_BG_FRAC = 0.04;

export async function scoreNightness(fillBuf, sourceBuf) {
  const s = await sharp(sourceBuf)
    .resize(NIGHT_W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const t = await sharp(fillBuf)
    .resize(NIGHT_W, null, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const n = w * h;
  const bg = new Uint8Array(n);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x;
    if (!bg[i] && s.data[i] > NIGHT_SRC_LIGHT) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  const lumas = [];
  for (let i = 0; i < n; i++) {
    if (!bg[i]) continue;
    const r = t.data[i * 3];
    const g = t.data[i * 3 + 1];
    const b = t.data[i * 3 + 2];
    lumas.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  if (lumas.length < n * NIGHT_MIN_BG_FRAC)
    return { bgLuma: 0, bgFrac: lumas.length / n, judged: false };
  lumas.sort((a, b) => a - b);
  return {
    bgLuma: lumas[lumas.length >> 1],
    bgFrac: lumas.length / n,
    p10: lumas[Math.floor(lumas.length * 0.1)],
    p90: lumas[Math.floor(lumas.length * 0.9)],
    judged: true,
  };
}

const rows = [];
for await (const entry of glob('**/*.night.raw.webp', { cwd: FILL_SRC_DIR })) {
  const rel = entry.replace(/\\/g, '/');
  const page = rel.replace(/\.night\.raw\.webp$/, '');
  const chalkPath = join(COLORING_DIR, `${page}.chalk.webp`);
  const penPath = join(COLORING_DIR, `${page}.outline.webp`);
  const sourcePath = existsSync(chalkPath) ? chalkPath : penPath;
  const fill = await readFile(join(FILL_SRC_DIR, rel));
  const source = await readFile(sourcePath);
  const score = await scoreNightness(fill, source);
  rows.push({ page, source: existsSync(chalkPath) ? 'chalk' : 'pen', ...score });
}
rows.sort((a, b) => a.bgLuma - b.bgLuma);
console.log(JSON.stringify(rows, null, 1));
