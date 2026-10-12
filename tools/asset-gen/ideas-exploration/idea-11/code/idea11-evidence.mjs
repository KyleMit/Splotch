// TEMP experiment script (idea #11): evidence images for the report.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR } from './lib/paths.mjs';
import { outlineMatch } from './lib/outline-match.mjs';
import { scoreSolidity, whitenSolidRegions } from './lib/solid-regions.mjs';

const OUT = process.argv[2];
const LONG = 560;

async function save(buf, name) {
  const img = sharp(buf);
  const { width, height } = await img.metadata();
  const scale = LONG / Math.max(width, height);
  await img
    .resize(Math.round(width * scale), Math.round(height * scale))
    .webp({ quality: 90 })
    .toFile(join(OUT, name));
  console.log(name);
}

for (const page of ['shapes/circle-tall', 'creatures/owl-tall']) {
  const slug = page.replace('/', '-');
  const pen = await readFile(join(COLORING_DIR, `${page}.outline.webp`));
  const chalk = await readFile(join(COLORING_DIR, `${page}.chalk.webp`));
  const solidity = await scoreSolidity(pen);
  const whitened = await whitenSolidRegions(pen, solidity);
  const before = await outlineMatch(pen, chalk);
  const after = await outlineMatch(whitened, chalk);
  await save(pen, `${slug}-ref-before.webp`);
  await save(whitened, `${slug}-ref-after.webp`);
  await save(before.overlay, `${slug}-overlay-before.webp`);
  await save(after.overlay, `${slug}-overlay-after.webp`);
  await save(await sharp(chalk).negate({ alpha: false }).toBuffer(), `${slug}-chalk-display.webp`);
  console.log(
    `${page}: before local ${(before.localKeep * 100).toFixed(1)}% -> after local ${(after.localKeep * 100).toFixed(1)}%`
  );
}
