// Tight zoom crops of the train-wide eye + right cheek for each variant.
import { join } from 'node:path';
import { dilateMask } from '/home/user/Splotch/tools/asset-gen/lib/morphology.mjs';
import {
  loadRgb,
  chalkMask,
  ringBands,
  punchWithMask,
  compositePunched,
  lumaOf,
  saveCrop,
} from './rim-lib.mjs';

const REPO = '/home/user/Splotch';
const IDEA_DIR =
  '/tmp/claude-0/-home-user-Splotch/68ded56b-e7dd-5cff-b995-afd9f1565152/scratchpad/ideas/idea-1';
const page = 'vehicles/train-wide';
const raw = join(REPO, 'tools/asset-gen/fill-src', `${page}.night.raw.webp`);
const chalkPath = join(REPO, 'web/static/coloring', `${page}.chalk.webp`);
const { rgb: rawRgb, width: w, height: h } = await loadRgb(raw);
const mask = await chalkMask(chalkPath, w, h);
const bands = ringBands(mask, w, h, 3);
const refRgb = punchWithMask(rawRgb, dilateMask(mask, w, h, 4), w, h);
const before = punchWithMask(rawRgb, mask, w, h);
const selMask = mask.slice();
for (const band of bands)
  for (const p of band) if (lumaOf(refRgb, p) - lumaOf(before, p) > 25) selMask[p] = 1;

const variants = {
  before,
  'c-dilate1': punchWithMask(rawRgb, dilateMask(mask, w, h, 1), w, h),
  'c-dilate2': punchWithMask(rawRgb, dilateMask(mask, w, h, 2), w, h),
  'a-selective': punchWithMask(rawRgb, selMask, w, h),
};
const boxes = [
  { left: 908, top: 460, width: 130, height: 130, name: 'eye' },
  { left: 950, top: 330, width: 130, height: 130, name: 'brow' },
];
for (const [name, fill] of Object.entries(variants)) {
  const { rgb: comp } = await compositePunched(fill, chalkPath, w, h);
  for (const box of boxes)
    await saveCrop(
      comp,
      w,
      h,
      box,
      join(IDEA_DIR, `vehicles-train-wide.${name}.${box.name}.webp`),
      520
    );
}
console.log('eye/brow crops written');
