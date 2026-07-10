// Build a self-contained HTML contact sheet of the coloring twins for one or
// more categories, so they can be reviewed in a browser / published as an
// Artifact. Covers both the dark "night" twins and the light `.light.webp`
// twins (toggle in the sheet). Images are embedded as base64 data URIs (no
// external file refs), so the page renders anywhere — including the Artifact
// sandbox, whose CSP blocks linking to local files.
//
//   node --experimental-strip-types --disable-warning=ExperimentalWarning \
//     tools/asset-gen/gen-contact-sheet.mjs <target...> [--source samples|shipped]
//       [--theme dark|light] [--out FILE]
//
//   <target>          "all" (every book) OR a whole category ("nature") OR a
//                     single page/cell to focus the sheet on: "nature/ant" (both
//                     orientations) or "nature/ant-wide" (one cell). Mix freely.
//   --source samples  (default) read fresh takes from .coloring-samples-dark/
//   --source shipped  read the live assets from web/static/coloring/*.night.webp
//   --theme dark      (default) open in dark; --theme light opens the light-twin
//                     review (the .light.webp under black lines — the magic-brush look)
//   --out FILE        output path (default .coloring-samples-dark/contact-sheet.html)
//
// Each cell embeds THREE layers so the sheet can reproduce what a child actually
// sees, not just the raw generated twin:
//   • color   — the generated colored twin alone (night twin in dark, light
//               `.light.webp` twin in light).
//   • outline — the page line art rendered as the canvas renders it (white
//               "chalk" on dark paper in dark mode; black lines on light paper
//               in light mode).
//   • combined — the real canvas composite: the fills-only twin (its own
//               outlines punched with the line art as a mask, the same punch
//               asset-gen bakes into shipped twins — lib/punch-twin.mjs) under
//               the line-art layer, over the paper. The punch is a no-op on
//               shipped twins (already fills-only) and does the real work for
//               `--source samples`, whose fresh takes still carry outlines. This
//               is the view to trust when judging a twin — a bug like blown-out
//               eyes only shows once the layers are merged.
// A per-tile tap cycles color → outline → combined; a top toolbar sets the view
// for every tile and toggles light/dark (defaulting to dark, the mode we debug).
// The compositing mirrors DrawingCanvas.svelte + magicBrush.ts (ADR-0043/0052).
//
// Page IDs come from the real catalog (books.ts), so the sheet always matches
// what will ship. Missing images are shown as a placeholder, not a crash.
import { parseArgs } from 'node:util';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ASSET_GEN_DIR, COLORING_DIR, SAMPLES_DARK_DIR, fail } from './lib/paths.mjs';
import { BOOKS } from '../../web/src/lib/state/books.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string' },
    theme: { type: 'string' },
    out: { type: 'string' },
  },
});
const source = values.source ?? 'samples';
if (!['samples', 'shipped'].includes(source)) fail('--source must be samples or shipped');
const theme = values.theme ?? 'dark';
if (!['dark', 'light'].includes(theme)) fail('--theme must be dark or light');
if (!positionals.length) fail('give one or more targets, e.g. "all", "farm", or "nature/ant-wide"');

// `all` is a whole-catalog shortcut so the common cross-session pass
// (`gen:contact-sheet -- all --source shipped`) needn't enumerate every book.
const targets = positionals.includes('all') ? BOOKS.map((b) => b.id) : positionals;

// A target is a whole category ("nature") or a page/cell filter ("nature/ant",
// "nature/ant-wide"). Split them: bare ids expand to the whole book, slashed ids
// keep only the matching page (or page+orientation) of their category.
const categories = new Set(targets.filter((p) => !p.includes('/')));
const pageFilters = targets.filter((p) => p.includes('/'));
const wantsCategory = (catId) =>
  categories.has(catId) || pageFilters.some((f) => f.startsWith(`${catId}/`));
// Keep this (cat,id,orient) cell? Its category was named whole, or a filter names
// exactly this page ("cat/id") or this cell ("cat/id-orient").
const wantsCell = (catId, id, orient) =>
  categories.has(catId) ||
  pageFilters.includes(`${catId}/${id}`) ||
  pageFilters.includes(`${catId}/${id}-${orient}`);

const OUT = values.out ?? join(SAMPLES_DARK_DIR, 'contact-sheet.html');

const staticDir = COLORING_DIR;
// The night twin: fresh sample takes, or the shipped .night.webp.
function nightPath(cat, id, orient) {
  return source === 'samples'
    ? join(SAMPLES_DARK_DIR, cat, `${id}-${orient}.webp`)
    : join(staticDir, cat, `${id}-${orient}.night.webp`);
}
// The original black-on-white line art, and the light colored twin — both always
// live in web/static regardless of --source.
const lineArtPath = (cat, id, orient) => join(staticDir, cat, `${id}-${orient}.outline.webp`);
const lightPath = (cat, id, orient) => join(staticDir, cat, `${id}-${orient}.light.webp`);

function dataUri(p) {
  if (!existsSync(p)) return null;
  return `data:image/webp;base64,${readFileSync(p).toString('base64')}`;
}

const cells = [];
let counts = [];
const catIds = BOOKS.map((b) => b.id).filter(wantsCategory);
for (const named of targets) {
  const bare = named.includes('/') ? named.split('/')[0] : named;
  if (!BOOKS.some((b) => b.id === bare)) console.warn(`(skip) no book "${bare}"`);
}
for (const catId of catIds) {
  const book = BOOKS.find((b) => b.id === catId);
  if (!book) continue;
  let n = 0;
  for (const p of book.pages) {
    for (const orient of ['tall', 'wide']) {
      if (!wantsCell(catId, p.id, orient)) continue;
      n++;
      cells.push({
        cat: catId,
        id: p.id,
        name: p.name,
        orient,
        night: dataUri(nightPath(catId, p.id, orient)),
        lineArt: dataUri(lineArtPath(catId, p.id, orient)),
        light: dataUri(lightPath(catId, p.id, orient)),
      });
    }
  }
  if (n) counts.push(`${book.name} (${n})`);
}

// The look (CSS) and interactive runtime (client JS) live in real files under
// contact-sheet/ so they get editor highlighting, Prettier, and ESLint. The
// generator only assembles the shell and injects the cell data + initial theme
// as a JSON global — no build-time string interpolation reaches the runtime.
const SHEET_DIR = join(ASSET_GEN_DIR, 'contact-sheet');
const css = readFileSync(join(SHEET_DIR, 'contact-sheet.css'), 'utf8');
const clientJs = readFileSync(join(SHEET_DIR, 'contact-sheet.client.js'), 'utf8');

const bootData = JSON.stringify({ cells, theme });

const html = `<title>Splotch contact sheet — ${source}${counts.length ? ` · ${counts.join(', ')}` : ''}</title>
<style>
${css}</style>
<div class="wrap">
  <header class="bar">
    <h1>Coloring twins &mdash; <span class="accent">${source}</span> contact sheet</h1>
    <p class="sub">Categories: ${counts.join(' · ')}. <strong>Combined</strong> reproduces the real canvas: fills-only twin under the themed line-art layer over the paper (the asset-gen punch + DrawingCanvas compositing). Judge twins here — blown-out or black-on-black eyes only show once the layers merge. Tap any tile to cycle its own view.</p>
    <div class="controls">
      <span class="seg-label">Theme</span>
      <div class="seg" id="themeSeg">
        <button data-theme="dark"${theme === 'dark' ? ' class="on"' : ''}>Dark</button>
        <button data-theme="light"${theme === 'light' ? ' class="on"' : ''}>Light</button>
      </div>
      <span class="seg-label">View</span>
      <div class="seg" id="viewSeg">
        <button data-view="color">Color</button>
        <button data-view="outline">Outline</button>
        <button data-view="combined" class="on">Combined</button>
      </div>
      <span class="hint">tap a tile to cycle it individually</span>
    </div>
  </header>
  <div id="sections"></div>
</div>
<script>window.__CONTACT_SHEET__ = ${bootData};</script>
<script>
${clientJs}</script>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
const bytes = Buffer.byteLength(html);
console.log(
  `wrote ${OUT}  (${(bytes / 1024 / 1024).toFixed(2)} MB, source=${source}, ${cells.length} cells)`
);
// The Artifact tool rejects uploads over 16 MB, which a whole-catalog `all` sheet
// now exceeds — split the pass into per-category (or 2–3-category) sheets to publish.
if (bytes > 16 * 1024 * 1024) {
  console.warn(
    '⚠ exceeds the 16 MB Artifact cap — publish per-category (or 2–3 categories per sheet) instead of `all`.'
  );
}
