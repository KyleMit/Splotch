import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from '/home/user/Splotch/tools/asset-gen/lib/paths.mjs';
import { compositeNight } from '/home/user/Splotch/tools/asset-gen/lib/night-composite.mjs';

const OUT =
  '/tmp/claude-0/-home-user-Splotch/68ded56b-e7dd-5cff-b995-afd9f1565152/scratchpad/ideas/idea-12/instr';
const [rel, cx, cy, rad] = process.argv.slice(2);
const x = +cx,
  y = +cy,
  r = +rad;
const pen = await readFile(join(COLORING_DIR, `${rel}.outline.webp`));
const chalkPath = join(COLORING_DIR, `${rel}.chalk.webp`);
const chalk = existsSync(chalkPath) ? await readFile(chalkPath) : null;
const light = await readFile(join(FILL_SRC_DIR, `${rel}.light.raw.webp`));
const nightRaw = await readFile(join(FILL_SRC_DIR, `${rel}.night.raw.webp`));
const night = chalk ? await compositeNight(nightRaw, chalk) : nightRaw;
const meta = await sharp(pen).metadata();
const region = {
  left: Math.max(0, x - r),
  top: Math.max(0, y - r),
  width: Math.min(2 * r, meta.width - (x - r)),
  height: Math.min(2 * r, meta.height - (y - r)),
};
const slug = rel.replace('/', '_');
const tiles = [];
for (const [name, buf] of [
  ['pen', pen],
  ['chalk', chalk],
  ['light', light],
  ['night', night],
]) {
  if (!buf) continue;
  const full = await sharp(buf)
    .removeAlpha()
    .resize(meta.width, meta.height, { fit: 'fill' })
    .png()
    .toBuffer();
  const t = await sharp(full).extract(region).resize(260, 260, { fit: 'inside' }).png().toBuffer();
  tiles.push({ name, t });
}
const canvas = sharp({
  create: { width: 270 * tiles.length, height: 280, channels: 3, background: '#888' },
});
await canvas
  .composite(tiles.map((t, i) => ({ input: t.t, left: 5 + i * 270, top: 10 })))
  .webp()
  .toFile(join(OUT, `${slug}_${x}x${y}.crops.webp`));
console.log(`${slug}_${x}x${y}.crops.webp  order: ${tiles.map((t) => t.name).join(' | ')}`);
