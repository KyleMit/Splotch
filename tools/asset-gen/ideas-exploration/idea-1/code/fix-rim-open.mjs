// Idea-1 refined variant "a-open": punch dark raw pixels near chalk ink ONLY if
// they belong to a THIN dark structure (removed by a morphological opening) —
// a re-inked outline overhang is a 1-3px sliver hugging the stroke, while legit
// dark art (the owl's eye ring, the cat's stripes) is thicker and survives the
// opening, so it is protected.
//   rim = darkRaw ∩ dilate_r(chalk) ∩ NOT opening(darkRaw, OPEN_R) ∩ NOT chalk
// Usage (repo root): DARK=145 R=2 OPEN_R=2 node fix-rim-open.mjs <pages…>
import { join } from 'node:path';
import { dilateMask, erodeMask } from '/home/user/Splotch/tools/asset-gen/lib/morphology.mjs';
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
const DARK = Number(process.env.DARK ?? 145);
const R = Number(process.env.R ?? 2);
const OPEN_R = Number(process.env.OPEN_R ?? 2);

const CROPS = {
  'vehicles/train-wide': [{ left: 855, top: 540, width: 140, height: 130, name: 'mouth' }],
  'creatures/owl-tall': [{ left: 330, top: 660, width: 220, height: 180, name: 'eye2' }],
  'farm/cat-wide': [{ left: 176, top: 432, width: 160, height: 160, name: 'bale' }],
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

  const dark = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (lumaOf(rawRgb, p) < DARK) dark[p] = 1;
  // Open only the OVERHANG (dark outside the chalk ink): the raw re-inks the
  // line dark UNDER the chalk too, so opening plain `dark` would merge the
  // sliver with the under-ink into a thick protected body and no-op the fix.
  const overhang = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) overhang[p] = dark[p] && !mask[p] ? 1 : 0;
  const kept = dilateMask(erodeMask(overhang, w, h, OPEN_R), w, h, OPEN_R);
  const grown = dilateMask(mask, w, h, R);
  const rimMask = mask.slice();
  let added = 0;
  for (let p = 0; p < w * h; p++)
    if (grown[p] && !mask[p] && dark[p] && !kept[p]) {
      rimMask[p] = 1;
      added++;
    }
  const fill = punchWithMask(rawRgb, rimMask, w, h);
  const { rgb: comp } = await compositePunched(fill, chalkPath, w, h);
  const before = punchWithMask(rawRgb, mask, w, h);
  const { rgb: compBefore } = await compositePunched(before, chalkPath, w, h);
  let sum = 0;
  let big = 0;
  for (let p = 0; p < w * h; p++) {
    const d = Math.abs(lumaOf(comp, p) - lumaOf(compBefore, p));
    sum += d;
    if (d > 30) big++;
  }
  await saveRgb(comp, w, h, join(IDEA_DIR, `${slug}.a-open.full.webp`), 560);
  for (const box of CROPS[page] ?? [])
    await saveCrop(comp, w, h, box, join(IDEA_DIR, `${slug}.a-open.${box.name}.webp`), 560);
  console.log(
    `${page}  added=${added}  rim(Δ>40) before=${(rimShare(before, refRgb, bands) * 100).toFixed(2)}% after=${(rimShare(fill, refRgb, bands) * 100).toFixed(2)}%  compositeΔ mean=${(sum / (w * h)).toFixed(3)} px(Δ>30)=${((big / (w * h)) * 100).toFixed(3)}%`
  );
}
