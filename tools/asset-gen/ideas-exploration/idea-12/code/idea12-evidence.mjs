// TEMP (idea #12): before/after overlay crops of firing cores. Delete after use.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { scoreEyeFill, BAND_BLIND_INK_FRAC, CHALK_WHITE_MIN } from './lib/eye-fill.mjs';
import { compositeNight } from './lib/night-composite.mjs';

const OUT =
  '/tmp/claude-0/-home-user-Splotch/68ded56b-e7dd-5cff-b995-afd9f1565152/scratchpad/ideas/idea-12/img';
const STRONG = 180;
const [rel, cx0, cy0, rad] = process.argv.slice(2);
const X = +cx0,
  Y = +cy0,
  R = +rad;
const pen = await readFile(join(COLORING_DIR, `${rel}.outline.webp`));
const chalkPath = join(COLORING_DIR, `${rel}.chalk.webp`);
const chalked = existsSync(chalkPath);
const light = await scoreEyeFill(await readFile(join(FILL_SRC_DIR, `${rel}.light.raw.webp`)), pen);
const nightRaw = await readFile(join(FILL_SRC_DIR, `${rel}.night.raw.webp`));
const judged = chalked ? await compositeNight(nightRaw, await readFile(chalkPath)) : nightRaw;
const night = await scoreEyeFill(judged, pen);
const meta = await sharp(pen).metadata();
const marks = [];
for (let i = 0; i < light.cores.length; i++) {
  const L = light.cores[i],
    N = night.cores[i];
  const isRef = L.lively && Math.max(L.coreLuma, L.bandLight) >= STRONG;
  const firesBefore = isRef && N && !N.lively;
  const suppressed =
    L.annulusInkFrac > BAND_BLIND_INK_FRAC ||
    (chalked && N && Math.max(N.coreLuma, N.bandLight) < CHALK_WHITE_MIN);
  const firesAfter = firesBefore && !suppressed;
  marks.push({ x: L.x, y: L.y, firesBefore, firesAfter });
}
const svg = (which) =>
  Buffer.from(
    `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">` +
      marks
        .map((m) => {
          const fires = which === 'before' ? m.firesBefore : m.firesAfter;
          const cleared = which === 'after' && m.firesBefore && !m.firesAfter;
          const color = fires ? '#ff2222' : cleared ? '#22cc44' : 'none';
          if (color === 'none') return '';
          return `<circle cx="${m.x}" cy="${m.y}" r="22" fill="none" stroke="${color}" stroke-width="6"/>`;
        })
        .join('') +
      `</svg>`
  );
const region = {
  left: Math.max(0, X - R),
  top: Math.max(0, Y - R),
  width: Math.min(2 * R, meta.width - Math.max(0, X - R)),
  height: Math.min(2 * R, meta.height - Math.max(0, Y - R)),
};
const slug = rel.replace('/', '_');
for (const which of ['before', 'after']) {
  const full = await sharp(judged)
    .removeAlpha()
    .resize(meta.width, meta.height, { fit: 'fill' })
    .composite([{ input: svg(which), top: 0, left: 0 }])
    .png()
    .toBuffer();
  await sharp(full)
    .extract(region)
    .resize(560, 560, { fit: 'inside' })
    .webp()
    .toFile(join(OUT, `${slug}.night-${which}.webp`));
}
console.log(
  slug,
  marks.filter((m) => m.firesBefore).length,
  '->',
  marks.filter((m) => m.firesAfter).length
);
