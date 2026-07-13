// TEMPORARY (idea #24) — build evidence composites; deleted after use.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { compositeNight } from './lib/night-composite.mjs';

const OUT = process.env.IDEA_OUT;
const pages = [
  ['shapes/heart-wide', 560, null],
  ['objects/umbrella-tall', null, 560],
  ['shapes/heart-tall', null, 560],
  ['objects/umbrella-wide', 560, null],
];

for (const [rel, w, h] of pages) {
  const name = rel.split('/')[1];
  const resize = w ? { width: w } : { height: h };
  const pen = await readFile(join(COLORING_DIR, `${rel}.outline.webp`));
  await sharp(pen).resize(resize).webp({ quality: 85 }).toFile(join(OUT, `${name}.pen.webp`));

  const chalk = await readFile(join(COLORING_DIR, `${rel}.chalk.webp`));
  // dark-mode display view = negation of the stored ink-on-white chalk
  await sharp(chalk).negate().resize(resize).webp({ quality: 85 }).toFile(join(OUT, `${name}.chalk-display.webp`));

  // light combined = raw light fill (fill + its outlines, what light mode reads as)
  const lightRaw = await readFile(join(FILL_SRC_DIR, `${rel}.light.raw.webp`));
  await sharp(lightRaw).resize(resize).webp({ quality: 85 }).toFile(join(OUT, `${name}.light-combined.webp`));

  // night combined = simulated final dark-mode composite
  const nightRaw = await readFile(join(FILL_SRC_DIR, `${rel}.night.raw.webp`));
  const night = await compositeNight(nightRaw, chalk);
  await sharp(night).resize(resize).webp({ quality: 85 }).toFile(join(OUT, `${name}.night-combined.webp`));
  console.log(`done ${rel}`);
}
