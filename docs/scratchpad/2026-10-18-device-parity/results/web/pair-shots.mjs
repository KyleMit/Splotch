// The inspector's side-by-side view: rn-web on the left, web-prod on the right, for each named
// capture. Writes PNGs to --out (outside the repo); the committed record keeps only the webps.
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import sharp from 'sharp';
import { SHOTS_DIR } from './harness.mjs';

const GUTTER_PX = 12;
const { values, positionals } = parseArgs({
  options: { out: { type: 'string' } },
  allowPositionals: true,
  strict: true,
});
if (!values.out) throw new Error('Usage: --out <dir> <capture name>...');
for (const name of positionals) {
  const left = await sharp(join(SHOTS_DIR, `${name}-rn-web.webp`)).png().toBuffer();
  const right = await sharp(join(SHOTS_DIR, `${name}-web-prod.webp`)).png().toBuffer();
  const [a, b] = await Promise.all([sharp(left).metadata(), sharp(right).metadata()]);
  const file = join(values.out, `${name}.png`);
  await sharp({
    create: { width: a.width + b.width + GUTTER_PX, height: Math.max(a.height, b.height), channels: 3, background: '#ff00ff' },
  })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: a.width + GUTTER_PX, top: 0 },
    ])
    .png()
    .toFile(file);
  console.log(file);
}
