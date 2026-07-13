// TEMP (idea #15): rank all raw fills by punched % without writing any output.
// Replicates the mask math of lib/punch-fill.mjs exactly.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { glob } from 'node:fs/promises';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';

const OUTLINE_LUMA_THRESHOLD = 150;

const raws = [];
for await (const entry of glob('**/*.raw.webp', { cwd: FILL_SRC_DIR }))
  raws.push(join(FILL_SRC_DIR, entry));
raws.sort();

const rows = [];
for (const rawPath of raws) {
  const rel = relative(FILL_SRC_DIR, rawPath).replace(/\\/g, '/');
  const shippedRel = rel.replace(/\.raw\.webp$/, '.webp');
  const penPath = join(COLORING_DIR, shippedRel.replace(/\.(light|night)\.webp$/, '.outline.webp'));
  const chalkPath = join(COLORING_DIR, shippedRel.replace(/\.(light|night)\.webp$/, '.chalk.webp'));
  const lineArtPath =
    shippedRel.endsWith('.night.webp') && existsSync(chalkPath) ? chalkPath : penPath;
  const meta = await sharp(await readFile(rawPath)).metadata();
  const { data: line, info } = await sharp(await readFile(lineArtPath))
    .removeAlpha()
    .resize(meta.width, meta.height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let punched = 0;
  const n = info.width * info.height;
  for (let p = 0, i = 0; p < n; p++, i += 3) {
    const luma = 0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2];
    if (luma < OUTLINE_LUMA_THRESHOLD) punched++;
  }
  rows.push({ rel: shippedRel, punched: punched / n });
}
rows.sort((a, b) => b.punched - a.punched);
for (const r of rows) console.log(`${(r.punched * 100).toFixed(2).padStart(6)}%  ${r.rel}`);
