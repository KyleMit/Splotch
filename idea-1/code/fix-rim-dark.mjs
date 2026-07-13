// Idea-1 variant "a-dark": extend the punch mask by pixels within r px of the
// chalk ink whose RAW luma is dark (< DARK) — i.e. the model's re-inked outline
// overhang — and inpaint them with the standard bleed. Legit dark fills lose
// only their outermost r px and re-bleed their own color, so they are visually
// unchanged; bright-line pages are a no-op.
// Usage (repo root): node fix-rim-dark.mjs <book/page-orient> [...more]
import { join } from 'node:path';
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
const IDEA_DIR =
  '/tmp/claude-0/-home-user-Splotch/68ded56b-e7dd-5cff-b995-afd9f1565152/scratchpad/ideas/idea-1';
const DARK = Number(process.env.DARK ?? 110);

const CROPS = {
  'vehicles/train-wide': [
    { left: 908, top: 460, width: 130, height: 130, name: 'eye' },
    { left: 840, top: 600, width: 150, height: 150, name: 'chin' },
  ],
  'farm/cat-wide': [{ left: 176, top: 432, width: 160, height: 160, name: 'bale' }],
  'shapes/circle-wide': [{ left: 1344, top: 704, width: 160, height: 160, name: 'control' }],
};

function rimShare(fillRgb, refRgb, bands) {
  let n = 0;
  let rim = 0;
  for (const band of bands)
    for (const p of band) {
      n++;
      if (lumaOf(refRgb, p) - lumaOf(fillRgb, p) > 40) rim++;
    }
  return rim / n;
}

for (const page of process.argv.slice(2)) {
  const slug = page.replace('/', '-');
  const raw = join(REPO, 'tools/asset-gen/fill-src', `${page}.night.raw.webp`);
  const chalkPath = join(REPO, 'web/static/coloring', `${page}.chalk.webp`);
  const { rgb: rawRgb, width: w, height: h } = await loadRgb(raw);
  const mask = await chalkMask(chalkPath, w, h);
  const bands = ringBands(mask, w, h, 3);
  const refRgb = punchWithMask(rawRgb, dilateMask(mask, w, h, 4), w, h);

  console.log(`\n=== ${page} ===`);
  for (const r of (process.env.RS ?? '2,3').split(',').map(Number)) {
    const grown = dilateMask(mask, w, h, r);
    const darkMask = mask.slice();
    let added = 0;
    for (let p = 0; p < w * h; p++)
      if (grown[p] && !mask[p] && lumaOf(rawRgb, p) < DARK) {
        darkMask[p] = 1;
        added++;
      }
    const fill = punchWithMask(rawRgb, darkMask, w, h);
    const { rgb: comp } = await compositePunched(fill, chalkPath, w, h);
    await saveRgb(comp, w, h, join(IDEA_DIR, `${slug}.a-dark${DARK}r${r}.full.webp`), 560);
    for (const box of CROPS[page] ?? [])
      await saveCrop(
        comp,
        w,
        h,
        box,
        join(IDEA_DIR, `${slug}.a-dark${DARK}r${r}.${box.name}.webp`),
        520
      );
    console.log(
      `  a-dark r=${r}  added ${added} px   rim(Δ>40) ${(rimShare(fill, refRgb, bands) * 100).toFixed(2)}%`
    );
  }
}
