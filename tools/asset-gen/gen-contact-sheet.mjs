// Builds the coloring-twin contact sheet for ONE category. Read
// ./contact-sheet.md before changing this file or anything under contact-sheet/
// — it holds the CLI contract, the layer/compositing model, and the size
// constraints that shape this generator.
//
//   node --experimental-strip-types --disable-warning=ExperimentalWarning \
//     tools/asset-gen/gen-contact-sheet.mjs <category>[/page[-orient]] \
//       [--source shipped|samples] [--out FILE]
import { parseArgs } from 'node:util';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { outlineMatch } from './lib/outline-match.mjs';
import {
  ASSET_GEN_DIR,
  COLORING_DIR,
  TWIN_SRC_DIR,
  SAMPLES_DIR,
  SAMPLES_DARK_DIR,
  fail,
} from './lib/paths.mjs';
import { BOOKS } from '../../web/src/lib/state/books.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string' },
    out: { type: 'string' },
  },
});
const source = values.source ?? 'shipped';
if (!['shipped', 'samples'].includes(source)) fail('--source must be shipped or samples');
if (positionals.length !== 1)
  fail(
    'give exactly one category (one sheet per category — the Artifact cap is 16 MB), e.g. "nature", "nature/ant", or "nature/ant-wide"'
  );
const target = positionals[0];
if (target === 'all')
  fail(
    '"all" is not supported — a whole-catalog sheet exceeds the 16 MB Artifact cap. Build one category per sheet.'
  );

// The target is a whole category ("nature") or a page/cell focus within it
// ("nature/ant" = both orientations, "nature/ant-wide" = one cell).
const catId = target.split('/')[0];
const pageFilter = target.includes('/') ? target : null;
const book = BOOKS.find((b) => b.id === catId);
if (!book) fail(`no book "${catId}" — categories: ${BOOKS.map((b) => b.id).join(', ')}`);
const wantsCell = (id, orient) =>
  !pageFilter || pageFilter === `${catId}/${id}` || pageFilter === `${catId}/${id}-${orient}`;

const OUT = values.out ?? join(SAMPLES_DIR, 'contact-sheet.html');

// The night twin: the shipped .night.webp (default), or a fresh ungated take from
// .coloring-samples-dark/ (--source samples — the human review gate before commit).
function nightPath(id, orient) {
  return source === 'samples'
    ? join(SAMPLES_DARK_DIR, catId, `${id}-${orient}.webp`)
    : join(COLORING_DIR, catId, `${id}-${orient}.night.webp`);
}
// The black-on-white line art and the light colored twin always come from
// web/static — light twins ship straight from the fills generator's punch.
const lineArtPath = (id, orient) => join(COLORING_DIR, catId, `${id}-${orient}.webp`);
const lightPath = (id, orient) => join(COLORING_DIR, catId, `${id}-${orient}.color.webp`);

function dataUri(p) {
  if (!existsSync(p)) return null;
  return `data:image/webp;base64,${readFileSync(p).toString('base64')}`;
}

// Outline-keep % for a cell, scored on the lined raw twin in twin-src/ (the
// shipped twin is punched fills-only, leaving no outline to register — same
// reason check-coloring-drift.mjs scores the raws). Night raws have WHITE
// outlines, which the dark-ink mask in lib/outline-match.mjs can't read, so only
// the light half carries the badge.
async function lightKeep(id, orient) {
  const raw = join(TWIN_SRC_DIR, catId, `${id}-${orient}.color.raw.webp`);
  const src = lineArtPath(id, orient);
  if (!existsSync(raw) || !existsSync(src)) return null;
  const { keep } = await outlineMatch(readFileSync(src), readFileSync(raw));
  return Math.round(keep * 1000) / 10;
}

// Wide pages first, then tall — each cell renders as a light+night pair.
const cells = [];
for (const orient of ['wide', 'tall']) {
  for (const p of book.pages) {
    if (!wantsCell(p.id, orient)) continue;
    cells.push({
      id: p.id,
      name: p.name,
      orient,
      night: dataUri(nightPath(p.id, orient)),
      lineArt: dataUri(lineArtPath(p.id, orient)),
      light: dataUri(lightPath(p.id, orient)),
      keep: await lightKeep(p.id, orient),
    });
  }
}
if (!cells.length) fail(`no pages matched "${target}"`);

// The look (CSS) and interactive runtime (client JS) live in real files under
// contact-sheet/ so they get editor highlighting, Prettier, and ESLint. The
// generator only assembles the shell and injects the cell data as a JSON global
// — no build-time string interpolation reaches the runtime.
const SHEET_DIR = join(ASSET_GEN_DIR, 'contact-sheet');
const css = readFileSync(join(SHEET_DIR, 'contact-sheet.css'), 'utf8');
const clientJs = readFileSync(join(SHEET_DIR, 'contact-sheet.client.js'), 'utf8');

const bootData = JSON.stringify({ cells });

const html = `<title>Splotch contact sheet — ${book.name} · ${source}</title>
<style>
${css}</style>
<div class="wrap">
  <header>
    <div class="crayons">
      <span style="background:var(--c-red)"></span><span style="background:var(--c-orange)"></span>
      <span style="background:var(--c-yellow)"></span><span style="background:var(--c-green)"></span>
      <span style="background:var(--c-blue)"></span><span style="background:var(--c-purple)"></span>
    </div>
    <h1>Coloring twins &mdash; ${book.name} <span class="accent">${source}</span></h1>
    <p class="lede">Every page <b>light</b> and <b>night</b> side by side, wide before tall.
    <b>Combined</b> reproduces the real canvas &mdash; the fills-only twin under the themed
    line art over the paper &mdash; so judge twins there; a blown-out eye only shows once the
    layers merge. <b>outline %</b> is how much of the line art the light raw twin preserves.</p>
  </header>
  <nav class="controls">
    <span class="seg-label">View</span>
    <div class="seg" id="viewSeg">
      <button data-view="outline">Outline</button>
      <button data-view="color">Color</button>
      <button data-view="combined" class="on">Combined</button>
    </div>
    <span class="hint">tap a tile to cycle it individually</span>
  </nav>
  <div id="pairs"></div>
</div>
<script>window.__CONTACT_SHEET__ = ${bootData};</script>
<script>
${clientJs}</script>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
const bytes = Buffer.byteLength(html);
console.log(
  `wrote ${OUT}  (${(bytes / 1024 / 1024).toFixed(2)} MB, source=${source}, ${cells.length} pages × 2 themes)`
);
// The Artifact tool rejects uploads over 16 MB — if one category ever outgrows
// the cap, focus the sheet on a page range instead of publishing it whole.
if (bytes > 16 * 1024 * 1024) {
  console.warn('⚠ exceeds the 16 MB Artifact cap — build focused page sheets instead.');
}
