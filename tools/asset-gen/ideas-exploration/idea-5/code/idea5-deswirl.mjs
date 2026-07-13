// Idea 5 experiment: deterministic de-swirl of caterpillar-wide's pen eyes.
// The shipped pen draws each eye as a SPIRAL: eyeball ring -> pupil ring ->
// catchlight are tangent/welded (the outer ring even has a spiral opening at
// its lower-left), which collapses the nested-region topology lib/eye-fill.mjs
// needs, so the chalk generator's eye-polarity gate saw no pupil core to
// protect and the shipped chalk whitened the whole eyeball (-> flat night
// pupils). Fix: erase each eye's interior with an ellipse fitted just inside
// the eyeball ring, then draw the caterpillar-tall two-circle treatment — one
// thin pupil ellipse + one small DETACHED catchlight circle — with >=2.5 px
// clearance everywhere so no antialias weld can rebuild the spiral. Weld nubs
// left on the eyeball ring are harmless (open strokes create no regions).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, SAMPLES_DARK_DIR } from './lib/paths.mjs';

const PAGE = 'nature/caterpillar-wide';
// Hand-measured from ASCII luma maps of the shipped outline (full-res pixels).
const EYES = [
  {
    erase: { cx: 450.5, cy: 512, rx: 15, ry: 29 },
    pupil: { cx: 450.5, cy: 512, rx: 9, ry: 13.5, sw: 4.5 },
    catch: { cx: 451, cy: 508, r: 3, sw: 2 },
  },
  {
    erase: { cx: 578, cy: 515.5, rx: 14.5, ry: 28.5 },
    pupil: { cx: 578, cy: 515, rx: 9, ry: 13.5, sw: 4.5 },
    catch: { cx: 578.5, cy: 511, r: 3, sw: 2 },
  },
];

const src = await readFile(join(COLORING_DIR, `${PAGE}.outline.webp`));
const { width, height } = await sharp(src).metadata();

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
${EYES.map(
  (e) => `
  <ellipse cx="${e.erase.cx}" cy="${e.erase.cy}" rx="${e.erase.rx}" ry="${e.erase.ry}" fill="white"/>
  <ellipse cx="${e.pupil.cx}" cy="${e.pupil.cy}" rx="${e.pupil.rx}" ry="${e.pupil.ry}"
           fill="none" stroke="black" stroke-width="${e.pupil.sw}"/>
  <circle cx="${e.catch.cx}" cy="${e.catch.cy}" r="${e.catch.r}"
          fill="none" stroke="black" stroke-width="${e.catch.sw}"/>`
).join('\n')}
</svg>`;

const out = await sharp(src)
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .webp({ quality: 92 })
  .toBuffer();

const dest = join(SAMPLES_DARK_DIR, 'idea5', 'caterpillar-wide.outline.webp');
await mkdir(join(SAMPLES_DARK_DIR, 'idea5'), { recursive: true });
await writeFile(dest, out);
console.log('wrote', dest);
