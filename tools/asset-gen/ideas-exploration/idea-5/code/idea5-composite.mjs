import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { compositeNight } from './lib/night-composite.mjs';

const [page, l, t, w, h, out, fillOverride] = process.argv.slice(2);
const fill = await readFile(fillOverride ?? join(FILL_SRC_DIR, `${page}.night.raw.webp`));
const chalk = await readFile(join(COLORING_DIR, `${page}.chalk.webp`));
const comp = await compositeNight(fill, chalk);
await sharp(comp)
  .extract({ left: +l, top: +t, width: +w, height: +h })
  .resize({ width: Math.min(560, +w * 3), kernel: 'nearest' })
  .png()
  .toFile(out);
console.log('wrote', out);
