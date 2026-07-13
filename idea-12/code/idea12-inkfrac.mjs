// TEMP (idea #12): per-core annulus ink fraction on the PEN mask. Delete after use.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR } from './lib/paths.mjs';
import { findEyeCores } from './lib/eye-fill.mjs';

for (const rel of process.argv.slice(2)) {
  const pen = await readFile(join(COLORING_DIR, `${rel}.outline.webp`));
  const { cores, label, ink, w, h } = await findEyeCores(pen);
  console.log(`\n${rel}`);
  for (const core of cores) {
    const cx = (core.minX + core.maxX) / 2;
    const cy = (core.minY + core.maxY) / 2;
    const r = Math.max(core.maxX - core.minX, core.maxY - core.minY) / 2 + 1;
    const rIn = r + 3;
    const rOut = r + 3 + Math.max(12, r * 0.6);
    let total = 0, inked = 0, sampled = 0;
    for (let y = Math.max(0, Math.floor(cy - rOut)); y <= Math.min(h - 1, Math.ceil(cy + rOut)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rOut)); x <= Math.min(w - 1, Math.ceil(cx + rOut)); x++) {
        const p = y * w + x;
        const d = Math.hypot(x - cx, y - cy);
        if (d < rIn || d > rOut) continue;
        if (label[p] === core.id) continue;
        total++;
        if (ink[p]) { inked++; continue; }
        let nearInk = false;
        for (let dy = -1; dy <= 1 && !nearInk; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || xx >= w || yy < 0 || yy >= h || ink[yy * w + xx]) { nearInk = true; break; }
          }
        if (!nearInk) sampled++;
      }
    }
    console.log(`  core (${Math.round(cx)},${Math.round(cy)}) r=${r.toFixed(1)}  annulus=${total} inkFrac=${(inked/total).toFixed(2)} sampled=${sampled}`);
  }
}
