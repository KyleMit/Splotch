// Builds the coloring-book proof sheet for ONE category. Read
// ../docs/coloring-book-proof-sheet.md before changing this file or anything under
// coloring-book-proof-sheet-assets/ — it holds the CLI contract, the layer/compositing
// model, and the size constraints that shape this generator.
//
//   node --experimental-strip-types --disable-warning=ExperimentalWarning \
//     tools/asset-gen/bin/gen-coloring-book-proof-sheet.mjs <category>[/page[-orient]] \
//       [--source shipped|samples] [--out FILE]
import { parseArgs } from 'node:util';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { outlineMatch } from '../lib/outline-match.mjs';
import {
  ASSET_GEN_DIR,
  COLORING_DIR,
  FILL_SRC_DIR,
  REPO_ROOT,
  SAMPLES_DIR,
  SAMPLES_DARK_DIR,
  fail,
} from '../lib/paths.mjs';
import { BOOKS } from '../../../web/src/lib/state/books.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string' },
    out: { type: 'string' },
  },
});
// `git:<ref>` renders each page's committed assets at <ref> (before) beside the
// current working-tree assets (after), so a regen can be judged old-vs-new in one
// sheet. The before-cell assets are read straight from git history with
// `git show <ref>:<path>`; a ref not present in a shallow clone degrades to
// before-cells full of placeholders rather than crashing.
const rawSource = values.source ?? 'shipped';
const gitRef = rawSource.startsWith('git:') ? rawSource.slice(4) : null;
if (gitRef === '') fail('--source git:<ref> needs a ref, e.g. --source git:HEAD~1 or git:6a95c46');
if (!gitRef && !['shipped', 'samples'].includes(rawSource))
  fail('--source must be shipped, samples, or git:<ref>');
// Path resolution + the client's punch decision both key off shipped-form assets
// in git mode: the before assets are the era's shipped fills-only webp (or their
// lined raw as a fallback), never fresh sample takes.
const source = gitRef ? 'shipped' : rawSource;
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

const OUT = values.out ?? join(SAMPLES_DIR, 'coloring-book-proof-sheet.html');

// The night fill: the shipped .night.webp (default), or a fresh ungated take from
// .coloring-samples-dark/ (--source samples — the human review gate before commit).
function nightPath(id, orient) {
  return source === 'samples'
    ? join(SAMPLES_DARK_DIR, catId, `${id}-${orient}.webp`)
    : join(COLORING_DIR, catId, `${id}-${orient}.night.webp`);
}
// The black-on-white line art and the light colored fill always come from
// web/static — light fills ship straight from the fills generator's punch. The
// chalk outline (dedicated dark-mode line art, ink-on-white) is optional; the
// dark half falls back to inverting the pen outline where it's absent.
const lineArtPath = (id, orient) => join(COLORING_DIR, catId, `${id}-${orient}.outline.webp`);
const chalkPath = (id, orient) => join(COLORING_DIR, catId, `${id}-${orient}.chalk.webp`);
const lightPath = (id, orient) => join(COLORING_DIR, catId, `${id}-${orient}.light.webp`);

function dataUri(p) {
  if (!existsSync(p)) return null;
  return `data:image/webp;base64,${readFileSync(p).toString('base64')}`;
}

// The lined raw fills (fill-src/) — the git-mode before-cell fallback when an era
// predates the shipped fills-only webp.
const nightRawPath = (id, orient) => join(FILL_SRC_DIR, catId, `${id}-${orient}.night.raw.webp`);
const lightRawPath = (id, orient) => join(FILL_SRC_DIR, catId, `${id}-${orient}.light.raw.webp`);

// Read an asset's bytes at a git ref as a data URI (git mode). Missing at that ref
// (or a ref absent from a shallow clone) -> null, same as an absent file on disk.
function gitDataUri(ref, absPath) {
  try {
    const buf = execFileSync('git', ['show', `${ref}:${relative(REPO_ROOT, absPath)}`], {
      cwd: REPO_ROOT,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return buf.length ? `data:image/webp;base64,${buf.toString('base64')}` : null;
  } catch {
    return null;
  }
}

// One cell's layers, sourced either from the working tree (era = null) or from a
// git ref (era = "<ref>"). Night/light before-cells fall back to their lined raw
// fill where the shipped fills-only webp didn't exist yet at that ref.
async function makeCell(p, orient, era) {
  const read = era ? (abs) => gitDataUri(era, abs) : (abs) => dataUri(abs);
  let night = read(nightPath(p.id, orient));
  let light = read(lightPath(p.id, orient));
  // Tracked per theme: the raw fill carries its own outline, so the half showing
  // it must be punched (not drawn as-is) and labelled — mixing a raw night with a
  // shipped light in the same cell is possible.
  let nightRaw = false;
  let lightRaw = false;
  if (era) {
    if (!night) {
      const r = gitDataUri(era, nightRawPath(p.id, orient));
      if (r) {
        night = r;
        nightRaw = true;
      }
    }
    if (!light) {
      const r = gitDataUri(era, lightRawPath(p.id, orient));
      if (r) {
        light = r;
        lightRaw = true;
      }
    }
  }
  return {
    id: p.id,
    name: p.name,
    orient,
    era: era ?? (gitRef ? 'current' : null),
    nightRaw,
    lightRaw,
    night,
    lineArt: read(lineArtPath(p.id, orient)),
    chalk: read(chalkPath(p.id, orient)),
    light,
    // The keep badge scores the lined raw at HEAD; skip it for a git-era cell.
    keep: era ? null : await lightKeep(p.id, orient),
  };
}

// Outline-keep % for a cell, scored on the lined raw fill in fill-src/ (the
// shipped fill is punched fills-only, leaving no outline to register — same
// reason check-coloring-drift.mjs scores the raws). Night raws have WHITE
// outlines, which the dark-ink mask in lib/outline-match.mjs can't read, so only
// the light half carries the badge.
async function lightKeep(id, orient) {
  const raw = join(FILL_SRC_DIR, catId, `${id}-${orient}.light.raw.webp`);
  const src = lineArtPath(id, orient);
  if (!existsSync(raw) || !existsSync(src)) return null;
  const { keep } = await outlineMatch(readFileSync(src), readFileSync(raw));
  return Math.round(keep * 1000) / 10;
}

// Each cell renders as a light+night pair; a page's orientations stay together
// (wide row, then its tall row) so a page is judged as one unit. In git mode each
// orientation emits two cells — the <ref> "before" directly above the current
// "after" — so the regen reads as an old-vs-new pair.
const cells = [];
for (const p of book.pages) {
  for (const orient of ['wide', 'tall']) {
    if (!wantsCell(p.id, orient)) continue;
    if (gitRef) {
      cells.push(await makeCell(p, orient, gitRef));
      cells.push(await makeCell(p, orient, null));
    } else {
      cells.push(await makeCell(p, orient, null));
    }
  }
}
if (!cells.length) fail(`no pages matched "${target}"`);

// The look (CSS) and interactive runtime (client JS) live in real files under
// coloring-book-proof-sheet-assets/ so they get editor highlighting, Prettier, and ESLint.
// The generator only assembles the shell and injects the cell data as a JSON global
// — no build-time string interpolation reaches the runtime.
const SHEET_DIR = join(ASSET_GEN_DIR, 'coloring-book-proof-sheet-assets');
const css = readFileSync(join(SHEET_DIR, 'coloring-book-proof-sheet.css'), 'utf8');
const clientJs = readFileSync(join(SHEET_DIR, 'coloring-book-proof-sheet.client.js'), 'utf8');

const sourceLabel = gitRef ? `git:${gitRef} → current` : source;
const bootData = JSON.stringify({ cells, source, gitRef });

// The ref is user-supplied and lands in the HTML shell, so escape it — the cell
// data goes in as a JSON global (already safe), but these header interpolations don't.
const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const sourceLabelHtml = esc(sourceLabel);

const gitLede = gitRef
  ? ` Each page shows its committed assets at <b>${esc(gitRef)}</b> (before) directly above the
    current working-tree assets (after), so a regen reads as an old-vs-new pair.`
  : '';

const html = `<title>Splotch coloring-book proof sheet — ${book.name} · ${sourceLabelHtml}</title>
<style>
${css}</style>
<div class="wrap">
  <header>
    <div class="crayons">
      <span style="background:var(--c-red)"></span><span style="background:var(--c-orange)"></span>
      <span style="background:var(--c-yellow)"></span><span style="background:var(--c-green)"></span>
      <span style="background:var(--c-blue)"></span><span style="background:var(--c-purple)"></span>
      <span style="background:var(--c-pink)"></span>
    </div>
    <h1>Coloring fills &mdash; ${book.name} <span class="accent">${sourceLabelHtml}</span></h1>
    <p class="lede">Every page <b>light</b> and <b>night</b> side by side, each page&rsquo;s wide row
    followed by its tall row.${gitLede}
    <b>Combined</b> reproduces the real canvas &mdash; the fills-only fill under the themed
    line art over the paper &mdash; so judge fills there; a blown-out eye only shows once the
    layers merge. <b>outline %</b> is how much of the line art the light raw fill preserves.</p>
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
<script>window.__COLORING_BOOK_PROOF_SHEET__ = ${bootData};</script>
<script>
${clientJs}</script>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
const bytes = Buffer.byteLength(html);
console.log(
  `wrote ${OUT}  (${(bytes / 1024 / 1024).toFixed(2)} MB, source=${sourceLabel}, ${cells.length} cells)`
);
// The Artifact tool rejects uploads over 16 MB — if one category ever outgrows
// the cap, focus the sheet on a page range instead of publishing it whole.
if (bytes > 16 * 1024 * 1024) {
  console.warn('⚠ exceeds the 16 MB Artifact cap — build focused page sheets instead.');
}
