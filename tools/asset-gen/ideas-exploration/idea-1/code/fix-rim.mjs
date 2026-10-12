// Idea-1 experiments (a) and (c): remove the dark rim the punch leaves behind
// on re-inked night raws.
//
//   (c) blanket: dilate the punch mask by r px — the rim is inpainted with the
//       punch's own neighbor bleed. Variants r=1, r=2.
//   (a) selective: extend the punch mask only where the raw is dark RELATIVE to
//       the local fill (rimDelta > threshold against a dilate-4 reference
//       punch), within 3 px of the chalk ink. Also an (a-white) variant that
//       paints those pixels white instead of inpainting, as IDEAS.md phrased it.
//
// Usage (repo root): node fix-rim.mjs <book/page-orient> [...more]
// Writes composites + crops to IDEA_DIR and prints before/after rim stats.
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { dilateMask } from '/home/user/Splotch/tools/asset-gen/lib/morphology.mjs';
import {
  loadRgb,
  chalkMask,
  ringBands,
  punchWithMask,
  compositePunched,
  lumaOf,
  saveRgb,
  saveCrop,
} from './rim-lib.mjs';

const REPO = '/home/user/Splotch';
const FILL_SRC = join(REPO, 'tools/asset-gen/fill-src');
const COLORING = join(REPO, 'web/static/coloring');
const IDEA_DIR =
  '/tmp/claude-0/-home-user-Splotch/68ded56b-e7dd-5cff-b995-afd9f1565152/scratchpad/ideas/idea-1';
mkdirSync(IDEA_DIR, { recursive: true });

const CROPS = {
  'vehicles/train-wide': [
    { left: 920, top: 400, width: 150, height: 150, name: 'cheek' },
    { left: 840, top: 600, width: 150, height: 150, name: 'chin' },
  ],
  'farm/cat-wide': [
    { left: 176, top: 432, width: 160, height: 160, name: 'bale' },
    { left: 380, top: 340, width: 160, height: 160, name: 'backstripe' },
  ],
  'shapes/circle-wide': [{ left: 1344, top: 704, width: 160, height: 160, name: 'control' }],
};

function rimShare(fillRgb, refRgb, bands) {
  let n = 0;
  let rim = 0;
  let bright = 0;
  for (const band of bands)
    for (const p of band) {
      const d = lumaOf(refRgb, p) - lumaOf(fillRgb, p);
      n++;
      if (d > 40) rim++;
      if (d < -40) bright++;
    }
  return { rim: rim / n, bright: bright / n };
}

for (const page of process.argv.slice(2)) {
  const slug = page.replace('/', '-');
  const raw = join(FILL_SRC, `${page}.night.raw.webp`);
  const chalkPath = join(COLORING, `${page}.chalk.webp`);
  const { rgb: rawRgb, width: w, height: h } = await loadRgb(raw);
  const mask = await chalkMask(chalkPath, w, h);
  const bands = ringBands(mask, w, h, 3);
  const refRgb = punchWithMask(rawRgb, dilateMask(mask, w, h, 4), w, h);

  // BEFORE: the current shipping punch (mask = chalk ink only).
  const variants = { before: punchWithMask(rawRgb, mask, w, h) };

  // (c) blanket dilation.
  for (const r of [1, 2])
    variants[`c-dilate${r}`] = punchWithMask(rawRgb, dilateMask(mask, w, h, r), w, h);

  // (a) selective: extend mask by band pixels whose rimDelta > 25.
  const selMask = mask.slice();
  let selAdded = 0;
  for (const band of bands)
    for (const p of band) {
      const beforeRgb = variants.before;
      if (lumaOf(refRgb, p) - lumaOf(beforeRgb, p) > 25) {
        selMask[p] = 1;
        selAdded++;
      }
    }
  variants['a-selective'] = punchWithMask(rawRgb, selMask, w, h);

  // (a-white) same selection, painted white instead of inpainted (IDEAS.md wording).
  const white = Buffer.from(variants.before);
  for (let p = 0; p < w * h; p++)
    if (selMask[p] && !mask[p]) {
      white[p * 3] = 255;
      white[p * 3 + 1] = 255;
      white[p * 3 + 2] = 255;
    }
  variants['a-white'] = white;

  console.log(`\n=== ${page}  (selective added ${selAdded} px) ===`);
  for (const [name, fill] of Object.entries(variants)) {
    const s = rimShare(fill, refRgb, bands);
    const { rgb: comp } = await compositePunched(fill, chalkPath, w, h);
    await saveRgb(comp, w, h, join(IDEA_DIR, `${slug}.${name}.full.webp`), 560);
    for (const box of CROPS[page] ?? [])
      await saveCrop(comp, w, h, box, join(IDEA_DIR, `${slug}.${name}.${box.name}.webp`), 560);
    console.log(
      `  ${name.padEnd(12)} rim(Δ>40) ${(s.rim * 100).toFixed(2)}%   over-bright(Δ<-40) ${(s.bright * 100).toFixed(2)}%`
    );
  }
}
