// Debug visualization: paint rim-flagged pixels (delta>25 vs dilate-4 reference)
// bright red on the BEFORE composite so we can adjudicate real rim vs legit art.
// Usage (repo root): node rim-overlay.mjs <book/page-orient> [...more]
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
} from './rim-lib.mjs';

const REPO = '/home/user/Splotch';
const FILL_SRC = join(REPO, 'tools/asset-gen/fill-src');
const COLORING = join(REPO, 'web/static/coloring');
const IDEA_DIR =
  '/tmp/claude-0/-home-user-Splotch/68ded56b-e7dd-5cff-b995-afd9f1565152/scratchpad/ideas/idea-1';

for (const page of process.argv.slice(2)) {
  const slug = page.replace('/', '-');
  const raw = join(FILL_SRC, `${page}.night.raw.webp`);
  const chalkPath = join(COLORING, `${page}.chalk.webp`);
  const { rgb: rawRgb, width: w, height: h } = await loadRgb(raw);
  const mask = await chalkMask(chalkPath, w, h);
  const bands = ringBands(mask, w, h, 3);
  const refRgb = punchWithMask(rawRgb, dilateMask(mask, w, h, 4), w, h);
  const before = punchWithMask(rawRgb, mask, w, h);
  const { rgb: comp } = await compositePunched(before, chalkPath, w, h);
  for (const band of bands)
    for (const p of band) {
      if (lumaOf(refRgb, p) - lumaOf(before, p) <= 25) continue;
      comp[p * 3] = 255;
      comp[p * 3 + 1] = 0;
      comp[p * 3 + 2] = 60;
    }
  await saveRgb(comp, w, h, join(IDEA_DIR, `${slug}.rim-overlay.full.webp`), 1100);
  console.log(`${slug}.rim-overlay.full.webp written`);
}
