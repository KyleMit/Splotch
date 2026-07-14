// Build a self-contained HTML review of the composite-eye audit's BLANK-ORB
// flags: one card per flagged page with the whole-page night composite plus the
// zoomed eye crop(s) the gate flagged, each labelled with its core dark-fraction
// (≈0 for a real blank orb). The single human-review surface for the composite blank-orb
// gate (lib/composite-eye.mjs) — publish the output with the Artifact tool and
// mark which pages are real defects vs. an over-flagged big-catchlight eye
// before burning them down. Deterministic, no API key/network.
//
//   node tools/asset-gen/bin/review-orb-eyes.mjs                 whole catalog
//   node tools/asset-gen/bin/review-orb-eyes.mjs creatures       one category
//   node tools/asset-gen/bin/review-orb-eyes.mjs --out FILE      choose the output path
import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR, REPO_ROOT, fail } from '../lib/paths.mjs';
import { compositeNight } from '../lib/night-composite.mjs';
import { scoreCompositeEyes } from '../lib/composite-eye.mjs';
import { resolveOutlineTargets } from '../lib/outline-targets.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' } },
});
const OUT = values.out ?? join(REPO_ROOT, 'orb-review.html');

const pages = await resolveOutlineTargets(positionals, {
  includeCovers: false,
  explicitFiles: false,
  sort: 'all',
  defaultAll: true,
  onMissing: (target) => fail(`no page or category "${target}" under ${COLORING_DIR}`),
});

const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
const cards = [];
for (const page of pages) {
  const rel = relative(COLORING_DIR, page)
    .replace(/\.outline\.webp$/, '')
    .replace(/\\/g, '/');
  const lightPath = join(FILL_SRC_DIR, `${rel}.light.raw.webp`);
  const nightPath = join(FILL_SRC_DIR, `${rel}.night.raw.webp`);
  const chalkPath = page.replace(/\.outline\.webp$/, '.chalk.webp');
  if (!existsSync(lightPath) || !existsSync(nightPath) || !existsSync(chalkPath)) continue;
  const comp = await compositeNight(await readFile(nightPath), await readFile(chalkPath));
  const r = await scoreCompositeEyes(comp, await readFile(lightPath), await readFile(page));
  if (r.passes) continue;
  const meta = await sharp(comp).metadata();
  const full = b64(await sharp(comp).resize(320).png().toBuffer());
  const crops = [];
  for (const p of r.pupils.filter((q) => q.blankOrb)) {
    const cx = Math.round(p.x * meta.width);
    const cy = Math.round(p.y * meta.height);
    const box = Math.round(Math.min(meta.width, meta.height) * 0.08);
    const left = Math.max(0, cx - box);
    const top = Math.max(0, cy - box);
    const crop = await sharp(comp)
      .extract({
        left,
        top,
        width: Math.min(box * 2, meta.width - left),
        height: Math.min(box * 2, meta.height - top),
      })
      .resize(200, 200, { kernel: 'nearest' })
      .png()
      .toBuffer();
    crops.push({ img: b64(crop), coreDark: p.coreDarkFrac });
  }
  cards.push({ rel, full, crops });
}

const cardHtml = (c) =>
  `<div style="border:1px solid #444;border-radius:10px;padding:12px;background:#1c1c22;color:#e6e6e6">
  <div style="font-family:monospace;font-weight:700;margin-bottom:8px">${c.rel}</div>
  <img src="${c.full}" style="width:100%;border-radius:6px"/>
  <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
    ${c.crops
      .map(
        (k) =>
          `<figure style="margin:0"><img src="${k.img}" style="width:120px;border-radius:6px"/><figcaption style="font-family:monospace;font-size:12px;text-align:center">coreDark ${k.coreDark}</figcaption></figure>`
      )
      .join('')}
  </div>
</div>`;

const html = `<title>Blank-orb night eyes — ${cards.length} flagged</title>
<h1>Composite blank-orb night eyes — ${cards.length} flagged</h1>
<p>Each card is the whole-page night composite plus the zoomed eye(s) the composite-eye gate flagged, with the core dark-fraction (fraction of a small disc at the catchlight core that is dark). A real blank orb reads ≈0 — the catchlight sits in white with no pupil around it; a legible eye has its dark pupil at the core. <strong>Decide which pages to fix.</strong></p>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:20px">
${cards.map(cardHtml).join('')}
</div>`;

await writeFile(OUT, html);
console.log(
  `wrote ${relative(REPO_ROOT, OUT)} — ${cards.length} flagged page(s); publish it with the Artifact tool`
);
