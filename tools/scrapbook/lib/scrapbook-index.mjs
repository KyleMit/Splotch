// Builds the landing page for the committed /scrapbook tree (ADR-0059). Pure
// apart from reading the tree: scans the directory, returns an HTML string — the
// publish script and the scrapbook:index script both call this. No build step;
// GitHub Pages serves the result as-is (.nojekyll).
//
// The page groups one card per scrapbook "type" (top-level folder) under a few
// short headings. Each card links to the type's entry page, draws a small glyph
// that depicts what that page shows, and can list the pages or sections inside
// the collection. Any folder the registry does not know falls back to a plain
// list of its report pages (HTML and Markdown) so nothing published ever goes
// missing. The base look comes from the shared chrome in ./scrapbook-chrome.mjs;
// everything specific to this page lives here.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { esc } from '../../lib/html.mjs';
import { chromeStyle } from './scrapbook-chrome.mjs';

// Not scrapbook entries — the index's own scaffolding.
const SCAFFOLDING = new Set(['index.html', 'README.md', '.nojekyll', '.gitkeep']);

// Repo identity — the single source of truth for the URLs the scrapbook links to
// (this module's Markdown blob links and the publish script's Pages base, which
// imports these). Edit here if the repo is renamed or moved, and the two stay in
// lockstep.
export const OWNER = 'KyleMit';
export const REPO = 'Splotch';

const REPO_URL = `https://github.com/${OWNER}/${REPO}`;
const APP_URL = 'https://splotch.art';

// GitHub blob view for Markdown pages. Pages serves .md as text/plain under
// .nojekyll (raw source, not rendered), so an on-site link would show markdown
// as plain text — but github.com's blob view renders it. Markdown reports link
// there; HTML pages link on-site (Pages renders those). Repo segment keeps its
// casing; the owner is case-insensitive.
const REPO_BLOB_BASE = `${REPO_URL}/blob/main/scrapbook/`;

const ICONS_DIR = join(ROOT, 'web/src/lib/icons');

// The localStorage key the theme switch persists under. Only this page reads it.
const THEME_STORAGE_KEY = 'scrapbook-theme';

// Inline one of the app's own icons, stripping the root width/height so CSS
// sizes it. Used for the mascot in the masthead.
function inlineIcon(name) {
  const svg = readFileSync(join(ICONS_DIR, `${name}.svg`), 'utf8');
  return svg.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, ''));
}

// One small drawing per collection, each a miniature of what its entry page
// shows: the light/night pair of a proof sheet, the tile grid of the drawing
// engine, the cell matrix of the performance page, and so on. `currentColor`
// is the card's hue; the --glyph-* variables come from the page CSS so the
// drawings follow the theme.
const GLYPHS = {
  proofSheet: `<svg viewBox="0 0 64 64" fill="none" stroke-linecap="round" stroke-linejoin="round">
<rect x="5" y="11" width="25" height="42" rx="4" fill="var(--glyph-paper)" stroke="currentColor" stroke-width="2"/>
<path d="M10 33l7.5-8 7.5 8M12 32v12h11V32M16 44v-6h3v6" stroke="var(--glyph-ink)" stroke-width="2"/>
<circle cx="23" cy="20" r="2.5" stroke="var(--glyph-ink)" stroke-width="1.6"/>
<rect x="34" y="11" width="25" height="42" rx="4" fill="#26305a" stroke="currentColor" stroke-width="2"/>
<circle cx="52" cy="19.5" r="2.5" fill="var(--c-yellow)"/>
<circle cx="39" cy="17" r="1.1" fill="#fff"/><circle cx="45" cy="15" r=".9" fill="#fff"/>
<path d="M41 32v12h11V32z" fill="var(--c-orange)"/>
<path d="M38.5 33l8-8.5 8 8.5z" fill="var(--c-red)"/>
<rect x="45" y="38" width="3" height="6" fill="var(--c-yellow)"/>
<rect x="36" y="44" width="21" height="7.5" rx="1.5" fill="var(--c-green)"/>
</svg>`,
  bakeOff: `<svg viewBox="0 0 64 64" fill="none" stroke-linecap="round" stroke-linejoin="round">
<rect x="6" y="12" width="30" height="26" rx="4" fill="var(--glyph-paper)" stroke="currentColor" stroke-width="2"/>
<circle cx="28" cy="19.5" r="2.5" fill="var(--c-yellow)"/>
<path d="M10 34l7-9 5 6 4-4 6 7" stroke="currentColor" stroke-width="2"/>
<rect x="28" y="26" width="30" height="26" rx="4" fill="var(--glyph-paper)" stroke="currentColor" stroke-width="2"/>
<circle cx="50" cy="33.5" r="2.5" fill="var(--c-yellow)"/>
<path d="M32 48l7-9 5 6 4-4 6 7" stroke="currentColor" stroke-width="2"/>
<circle cx="56" cy="26" r="6.5" fill="var(--c-green)" stroke="var(--glyph-paper)" stroke-width="2"/>
<path d="M53 26l2 2 4-4" stroke="#fff" stroke-width="2"/>
</svg>`,
  crayon: `<svg viewBox="0 0 64 64" fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M8 50c7-2 13-2 20-4" stroke="currentColor" stroke-width="8" opacity=".38"/>
<path d="M9 48.5c7-1 13-1.5 20-3.5" stroke="currentColor" stroke-width="4" opacity=".55"/>
<g transform="rotate(45 32 47)">
<path d="M32 47l-4.5-9h9z" fill="currentColor"/>
<rect x="27.5" y="12" width="9" height="27" rx="2" fill="currentColor"/>
<rect x="27.5" y="17" width="9" height="7" fill="var(--glyph-paper)" opacity=".85"/>
</g>
</svg>`,
  workers: `<svg viewBox="0 0 64 64" fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M8 54h48" stroke="var(--glyph-hair)" stroke-width="2"/>
<rect x="11" y="16" width="7" height="38" rx="2" fill="currentColor"/>
<rect x="21" y="28" width="7" height="26" rx="2" fill="currentColor"/>
<rect x="31" y="34" width="7" height="20" rx="2" fill="currentColor"/>
<rect x="41" y="37" width="7" height="17" rx="2" fill="currentColor"/>
<path d="M14 46c8 1 15-3 21-8s10-13 16-24" stroke="var(--c-red)" stroke-width="2.5"/>
<circle cx="51" cy="14" r="3" fill="var(--c-red)"/>
</svg>`,
  tiles: `<svg viewBox="0 0 64 64" fill="none" stroke-linecap="round" stroke-linejoin="round">
<g stroke="var(--glyph-hair)" stroke-width="1.5">
<rect x="6" y="6" width="11" height="11" rx="2"/><rect x="19" y="6" width="11" height="11" rx="2"/><rect x="32" y="6" width="11" height="11" rx="2"/>
<rect x="6" y="19" width="11" height="11" rx="2"/><rect x="45" y="19" width="11" height="11" rx="2"/>
<rect x="19" y="32" width="11" height="11" rx="2"/><rect x="45" y="32" width="11" height="11" rx="2"/>
<rect x="19" y="45" width="11" height="11" rx="2"/><rect x="32" y="45" width="11" height="11" rx="2"/><rect x="45" y="45" width="11" height="11" rx="2"/>
</g>
<g fill="currentColor" opacity=".22">
<rect x="45" y="6" width="11" height="11" rx="2"/>
<rect x="19" y="19" width="11" height="11" rx="2"/><rect x="32" y="19" width="11" height="11" rx="2"/>
<rect x="6" y="32" width="11" height="11" rx="2"/><rect x="32" y="32" width="11" height="11" rx="2"/>
<rect x="6" y="45" width="11" height="11" rx="2"/>
</g>
<path d="M10 51c4-10 9-19 17-22s9 9 15 7 6-13 10-24" stroke="currentColor" stroke-width="4"/>
</svg>`,
  matrix: `<svg viewBox="0 0 64 64" fill="none">
<g fill="currentColor">
<rect x="7" y="9" width="9" height="9" rx="2"/><rect x="19" y="9" width="9" height="9" rx="2"/><rect x="31" y="9" width="9" height="9" rx="2"/><rect x="43" y="9" width="9" height="9" rx="2" fill="var(--c-yellow)"/>
<rect x="7" y="21" width="9" height="9" rx="2"/><rect x="19" y="21" width="9" height="9" rx="2"/><rect x="31" y="21" width="9" height="9" rx="2" fill="var(--c-yellow)"/><rect x="43" y="21" width="9" height="9" rx="2"/>
<rect x="7" y="33" width="9" height="9" rx="2"/><rect x="19" y="33" width="9" height="9" rx="2" fill="var(--c-red)"/><rect x="31" y="33" width="9" height="9" rx="2"/><rect x="43" y="33" width="9" height="9" rx="2"/>
<rect x="7" y="45" width="9" height="9" rx="2" fill="var(--c-yellow)"/><rect x="19" y="45" width="9" height="9" rx="2"/><rect x="31" y="45" width="9" height="9" rx="2"/><rect x="43" y="45" width="9" height="9" rx="2"/>
</g>
</svg>`,
  clearSound: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
<path d="M11 20h30"/>
<path d="M21 20v-3a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3"/>
<path d="M15 20l2 28.5a2 2 0 0 0 2 1.5h14a2 2 0 0 0 2-1.5L37 20" fill="var(--glyph-paper)"/>
<path d="M22 27v16M30 27v16"/>
<path d="M45 30a5 5 0 0 1 0 8" opacity=".95"/>
<path d="M49 25a11 11 0 0 1 0 18" opacity=".7"/>
<path d="M53 20a18 18 0 0 1 0 28" opacity=".45"/>
</svg>`,
  devices: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
<rect x="5" y="13" width="38" height="30" rx="4" fill="var(--glyph-paper)"/>
<rect x="9" y="17" width="30" height="22" rx="1.5" fill="currentColor" opacity=".16" stroke="none"/>
<rect x="42" y="26" width="17" height="31" rx="3.5" fill="var(--glyph-paper)"/>
<rect x="45" y="30" width="11" height="20" rx="1" fill="#26305a" stroke="none"/>
<path d="M48.5 53.5h4"/>
</svg>`,
};

// Section headings, in page order. `desc` is the plain-words subtitle.
const GROUPS = {
  galleries: { title: 'Galleries', desc: 'Pictures and sounds to browse' },
  measurements: { title: 'Measurements', desc: 'The numbers behind a decision, and how they were taken' },
  explainers: { title: 'Explainers', desc: 'How the app works, in plain words' },
};

// The proof-sheet hub keeps its own category list; read it so the card's
// category links carry the hub's display names and stay in step with it.
function proofSheetCategories(hubPath) {
  if (!existsSync(hubPath)) return [];
  const hub = readFileSync(hubPath, 'utf8');
  const source = hub.match(/const CATEGORIES = \[([\s\S]*?)\];/)?.[1] ?? '';
  return [...source.matchAll(/\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)'/g)].map(([, id, name]) => ({
    id,
    name,
  }));
}

// The in-page navigation of a long explainer, read from the page itself so the
// card's section links can never name a heading the page no longer has.
function sectionAnchors(pagePath) {
  if (!existsSync(pagePath)) return [];
  const html = readFileSync(pagePath, 'utf8');
  const navs = [...html.matchAll(/<nav\b[\s\S]*?<\/nav>/g)].map((m) => m[0]).join('');
  return [...navs.matchAll(/<a\s+[^>]*href="#([^"]+)"[^>]*>([^<]+)</g)].map(([, id, label]) => ({
    id,
    label: label.replace(/&amp;/g, '&').trim(),
  }));
}

// First Markdown heading of a report, used as its link label. The headings end
// in an " — <issue or date>" qualifier that the card has no room for.
function markdownTitle(path) {
  const heading = readFileSync(path, 'utf8').match(/^#\s+(.+)$/m)?.[1] ?? '';
  return heading.split(' — ')[0].trim();
}

// Sub-collections of a type dir: every child folder with an HTML or Markdown
// entry page, newest date prefix last. HTML pages link on-site, Markdown pages to
// their rendered GitHub blob view.
function childReports(dir, type) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'assets')
    .map((e) => e.name)
    .sort()
    .map((name) => {
      const html = join(dir, name, 'index.html');
      const md = join(dir, name, 'index.md');
      if (existsSync(html)) {
        return { label: name, href: `${type}/${name}/index.html` };
      }
      if (existsSync(md)) {
        return { label: markdownTitle(md), href: `${REPO_BLOB_BASE}${type}/${name}/index.md` };
      }
      return null;
    })
    .filter(Boolean);
}

// Curated presentation for the known scrapbook types. `entry` is the page a card
// links to; `count` derives a short unit label from the type's directory; `inside`
// lists the pages or sections a reader can jump straight to.
const REGISTRY = {
  'coloring-book-proof-sheets': {
    group: 'galleries',
    glyph: 'proofSheet',
    hue: 'orange',
    title: 'Coloring-book proof sheets',
    blurb:
      'Every coloring page as one row: line art, light fill, night fill, and how it looks on the real canvas. One tab per category.',
    entry: 'coloring-book-proof-sheets/index.html',
    count: (dir) => {
      const n = readdirSync(dir).filter((f) => f.endsWith('.html') && f !== 'index.html').length;
      return n ? `${n} categories` : null;
    },
    inside: (dir) =>
      proofSheetCategories(join(dir, 'index.html')).map(({ id, name }) => ({
        label: name,
        href: `coloring-book-proof-sheets/index.html#${id}`,
      })),
  },
  'crayon-brush-samples': {
    group: 'galleries',
    glyph: 'crayon',
    hue: 'red',
    title: 'Crayon brush reference strokes',
    blurb:
      'What a waxy crayon stroke should look like, built up in stages from single lines to fills. The crayon brush is judged against these pictures.',
    entry: 'crayon-brush-samples/index.html',
    count: (dir) => {
      const n = readdirSync(dir).filter((f) => f.endsWith('.webp')).length;
      return n ? `${n} samples` : null;
    },
    inside: (dir) =>
      [
        { file: 'index.html', label: 'Reference strokes' },
        { file: 'vs-current.html', label: 'Versus the shipping brush' },
      ]
        .filter(({ file }) => existsSync(join(dir, file)))
        .map(({ file, label }) => ({ label, href: `crayon-brush-samples/${file}` })),
  },
  'page-inventory': {
    group: 'galleries',
    glyph: 'devices',
    hue: 'purple',
    title: 'App page inventory',
    blurb:
      'Every route, settings section, and modal on four iPhone and iPad sizes, in light and night mode, each with a short design review.',
    entry: 'page-inventory/index.html',
    count: (dir) => {
      const manifest = join(dir, 'capture-manifest.json');
      if (!existsSync(manifest)) return null;
      const n = JSON.parse(readFileSync(manifest, 'utf8')).captures?.length ?? 0;
      return n ? `${n} screenshots` : null;
    },
    inside: (dir) =>
      sectionAnchors(join(dir, 'index.html')).map(({ id, label }) => ({
        label,
        href: `page-inventory/index.html#${id}`,
      })),
  },
  'sound-design': {
    group: 'galleries',
    glyph: 'clearSound',
    hue: 'yellow',
    title: 'Drag-to-clear sound options',
    blurb:
      'Three candidate sounds for the clear gesture, played through the same drag-away-from-the-trash control the app uses. Records which one shipped.',
    entry: 'sound-design/clear-sound-contact-sheet/index.html',
    count: (dir) => {
      const clips = join(dir, 'clear-sound-contact-sheet', 'assets');
      if (!existsSync(clips)) return null;
      const n = readdirSync(clips).filter((f) => f.endsWith('.mp3')).length;
      return n ? `${n} clips` : null;
    },
    inside: () => [],
  },
  'model-eval': {
    group: 'measurements',
    glyph: 'bakeOff',
    hue: 'blue',
    title: 'Image-model bake-off',
    blurb:
      'Eight image models run over the same coloring pages. Compares cost, speed, and picture quality, and records which model shipped and why.',
    entry: 'model-eval/report/index.html',
    count: (dir) => {
      const n = childReports(dir, 'model-eval').length;
      return n > 1 ? `${n} reports` : null;
    },
    inside: (dir) => {
      const labels = { report: 'Bake-off report', 'prompt-adherence': 'Prompt-adherence lab' };
      return childReports(dir, 'model-eval').map((r) => ({
        ...r,
        label: labels[r.label] ?? r.label,
      }));
    },
  },
  'e2e-tuning': {
    group: 'measurements',
    glyph: 'workers',
    hue: 'pink',
    title: 'End-to-end test tuning',
    blurb:
      'How many Playwright workers the test suite should use, measured on a laptop and on CI, plus the three real test bugs found on the way.',
    entry: 'e2e-tuning/index.html',
    count: () => null,
    inside: () => [],
  },
  performance: {
    group: 'measurements',
    glyph: 'matrix',
    hue: 'green',
    title: 'Performance matrix',
    blurb:
      'Drawing, undo, and button timings on real iPads and Android phones, simulators, and desktop browsers, checked against the release limits. Every number names the commit it measured.',
    entry: 'performance/2026-07-31-deployment-target-matrix/index.html',
    count: (dir) => {
      const n = childReports(dir, 'performance').length;
      return n > 1 ? `${n} reports` : null;
    },
    inside: (dir) =>
      childReports(dir, 'performance').map((r) => ({
        ...r,
        label:
          r.label === '2026-07-31-deployment-target-matrix'
            ? 'Deployment-target matrix'
            : r.label,
      })),
  },
  'drawing-engine': {
    group: 'explainers',
    glyph: 'tiles',
    hue: 'blue',
    title: 'How Splotch turns fingers into pixels',
    blurb:
      'A tour of the drawing pipeline: how touches become strokes, how the canvas is split into tiles, how undo keeps pixels, and how a picture is exported. Starts with a version a five-year-old could follow.',
    entry: 'drawing-engine/index.html',
    count: (dir) => {
      const n = sectionAnchors(join(dir, 'index.html')).length;
      return n ? `${n} sections` : null;
    },
    insideOpen: true,
    inside: (dir) =>
      sectionAnchors(join(dir, 'index.html')).map(({ id, label }) => ({
        label,
        href: `drawing-engine/index.html#${id}`,
      })),
  },
};

// YYYY-MM-DD — locale-independent so the index is byte-stable across machines
// except for the dates themselves.
const fmtDate = (d) => d.toISOString().slice(0, 10);

// Latest mtime anywhere under a path.
function latestMtime(path) {
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtime;
  let newest = st.mtime;
  for (const name of readdirSync(path)) {
    const m = latestMtime(join(path, name));
    if (m > newest) newest = m;
  }
  return newest;
}

// When a collection last changed. Git's commit date is the truthful answer — a
// checkout gives every file the same mtime — so ask git first and fall back to
// mtimes only where the path is not tracked (a test fixture, a fresh publish).
// The publish script's --check compares fresh output against the committed page
// with every "Updated <date>" stamp masked, so a shallow CI clone reporting a
// different date cannot fail the drift guard.
function updatedOn(path) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', path], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out;
  } catch {
    // Not a git checkout, or a path outside it: fall through to mtimes.
  }
  return fmtDate(latestMtime(path));
}

// Every report page under a type dir (depth-first), relative to the scrapbook
// root, skipping assets/ support folders — used for the unknown-type fallback
// list. Surfaces .html (Pages renders these) and .md (linked to their rendered
// GitHub blob view); raw data (.json, …), assets/, and a nested README.md (a run
// dir's own readme — scaffolding, not a report) stay unsurfaced.
function pagesUnder(dir, rel, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name === 'assets') continue;
    // A run dir's own README.md is scaffolding, not a report page — skip it at
    // any depth (a nested index.html, by contrast, is a legitimate entry page).
    if (entry.isFile() && entry.name === 'README.md') continue;
    const full = join(dir, entry.name);
    const r = `${rel}/${entry.name}`;
    if (entry.isDirectory()) pagesUnder(full, r, out);
    else if (entry.name.endsWith('.html')) out.push({ rel: r, ext: 'html' });
    else if (entry.name.endsWith('.md')) out.push({ rel: r, ext: 'md' });
  }
  return out;
}

// Top-level collection dirs that would produce no card — no linkable .html/.md
// page anywhere beneath. When non-empty the index's "N collections" chip would
// exceed the cards it shows; the scrapbook:check guard fails on it so nothing
// published silently vanishes from the index.
export function collectionsMissingEntry(scrapbookDir) {
  return readdirSync(scrapbookDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SCAFFOLDING.has(e.name))
    .map((e) => e.name)
    .sort()
    .filter((t) => pagesUnder(join(scrapbookDir, t), t).length === 0);
}

export function coloringBookProofSheetHubProblems(proofSheetsDir) {
  const hub = readFileSync(join(proofSheetsDir, 'index.html'), 'utf8');
  const categoriesSource = hub.match(/const CATEGORIES = \[([\s\S]*?)\];/)[1];
  const categories = [...categoriesSource.matchAll(/\{\s*id:\s*'([^']+)'[^}]*pages:\s*(\d+)/g)].map(
    ([, id, pages]) => ({ id, pages: Number(pages) })
  );
  const sheetIds = readdirSync(proofSheetsDir)
    .filter((name) => name.endsWith('.html') && name !== 'index.html')
    .map((name) => name.slice(0, -'.html'.length))
    .sort();
  const categoryIds = categories.map(({ id }) => id);
  const problems = [
    ...sheetIds
      .filter((id) => !categoryIds.includes(id))
      .map((id) => `Sibling proof sheet ${id}.html has no matching hub category.`),
    ...categoryIds
      .filter((id) => !sheetIds.includes(id))
      .map((id) => `Hub category "${id}" has no sibling proof sheet ${id}.html.`),
  ];

  for (const { id, pages } of categories) {
    if (!sheetIds.includes(id)) continue;
    const sheet = readFileSync(join(proofSheetsDir, `${id}.html`), 'utf8');
    const marker = 'window.__COLORING_BOOK_PROOF_SHEET__ = ';
    const dataStart = sheet.indexOf(marker) + marker.length;
    const dataEnd = sheet.indexOf(';</script>', dataStart);
    const cells = JSON.parse(sheet.slice(dataStart, dataEnd)).cells;
    const sheetPages = new Set(cells.map((cell) => cell.id)).size;
    if (pages !== sheetPages) {
      problems.push(
        `Hub category "${id}" declares ${pages} pages, but ${id}.html contains ${sheetPages} distinct page IDs across ${cells.length} cells.`
      );
    }
  }

  return problems;
}

function insideList(meta, dir) {
  const links = meta.inside(dir);
  if (!links.length) return '';
  const items = links
    .map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`)
    .join('');
  return `<details class="inside"${meta.insideOpen ? ' open' : ''}>
          <summary>What's inside</summary>
          <ul class="inside-links">${items}</ul>
        </details>`;
}

function card(type, meta, scrapbookDir) {
  const dir = join(scrapbookDir, type);
  const entryExists = existsSync(join(scrapbookDir, meta.entry));
  if (!entryExists) return fallbackCard(type, dir);
  const countLabel = meta.count(dir);
  const updated = updatedOn(dir);
  return `<article class="card" style="--hue:var(--c-${meta.hue})">
      <a class="card-hit" href="${esc(meta.entry)}" aria-label="${esc(meta.title)}"></a>
      <div class="card-top"></div>
      <div class="card-body">
        <div class="glyph" aria-hidden="true">${GLYPHS[meta.glyph]}</div>
        <div class="card-text">
          <h3>${esc(meta.title)}</h3>
          <p>${esc(meta.blurb)}</p>
        </div>
        ${insideList(meta, dir)}
        <div class="card-foot">
          <div class="card-meta">${countLabel ? `<span class="kind">${esc(countLabel)}</span>` : ''}<span class="date">Updated ${esc(updated)}</span></div>
          <span class="go">Open <span class="arrow" aria-hidden="true">→</span></span>
        </div>
      </div>
    </article>`;
}

function fallbackCard(type, dir) {
  const pages = pagesUnder(dir, type);
  if (!pages.length) return '';
  const rows = pages
    .map((p) => {
      const href = p.ext === 'md' ? REPO_BLOB_BASE + p.rel : p.rel;
      return `<li><a href="${esc(href)}">${esc(p.rel.slice(type.length + 1))}</a></li>`;
    })
    .join('');
  return `<article class="card card--plain" style="--hue:var(--c-green)">
      <div class="card-top"></div>
      <div class="card-body">
        <div class="card-text">
          <h3>${esc(type)}</h3>
          <ul class="plain-list">${rows}</ul>
        </div>
        <div class="card-foot">
          <div class="card-meta"><span class="kind">${pages.length} page${pages.length === 1 ? '' : 's'}</span><span class="date">Updated ${esc(updatedOn(dir))}</span></div>
        </div>
      </div>
    </article>`;
}

function themeSwitch() {
  const choices = [
    ['auto', 'Auto'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];
  return `<div class="theme" role="group" aria-label="Color theme">${choices
    .map(
      ([value, label]) =>
        `<button type="button" data-theme-choice="${value}" aria-pressed="${value === 'auto'}">${label}</button>`
    )
    .join('')}</div>`;
}

// Applies the saved theme before first paint so a dark-mode reader never sees a
// light flash. Runs in <head>; the button wiring below runs after the DOM exists.
const THEME_BOOT_SCRIPT = `<script>
(function(){
  var saved = null;
  try { saved = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); } catch (e) {}
  if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
})();
</script>`;

const THEME_SWITCH_SCRIPT = `<script>
(function(){
  var KEY = ${JSON.stringify(THEME_STORAGE_KEY)};
  var root = document.documentElement;
  var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-theme-choice]'));
  function apply(choice){
    if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice);
    else root.removeAttribute('data-theme');
    buttons.forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-choice') === choice)); });
  }
  buttons.forEach(function(b){
    b.addEventListener('click', function(){
      var choice = b.getAttribute('data-theme-choice');
      try { if (choice === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, choice); } catch (e) {}
      apply(choice);
    });
  });
  apply(root.getAttribute('data-theme') || 'auto');
})();
</script>`;

const PAGE_CSS = `
.masthead .shell{padding-bottom:clamp(22px,4vw,38px)}
.masthead-deco{top:34px}
.brand-row{display:flex; align-items:center; gap:14px; flex-wrap:wrap}
.brand-name a{color:inherit}
.brand-name a:hover{color:var(--accent-ink); text-decoration:none}
.theme{margin-left:auto; display:inline-flex; padding:3px; border-radius:999px; background:var(--card); border:1px solid var(--hair); position:relative; z-index:1}
.theme button{
  appearance:none; border:0; background:transparent; color:var(--muted); font:inherit; font-size:.76rem; font-weight:650;
  padding:4px 11px; border-radius:999px; cursor:pointer; transition:background .12s, color .12s;
}
.theme button:hover{color:var(--ink)}
.theme button[aria-pressed=true]{background:var(--accent-wash); color:var(--accent-ink)}
.theme button:focus-visible{outline:2px solid var(--accent); outline-offset:1px}
.masthead-body{max-width:64ch}
.tagline{max-width:none}
.stat-row a.chip:hover{text-decoration:none; border-color:var(--hair-strong); color:var(--ink)}

.group + .group{margin-top:clamp(34px,5vw,54px)}
.section-head{margin:0 0 14px}
.card-grid{display:flex; flex-wrap:wrap; gap:clamp(14px,2vw,20px)}
.card{flex:1 1 250px; max-width:100%; container-type:inline-size}
.card-body{padding:18px 18px 16px; gap:12px}
.glyph{
  --glyph-paper:var(--card); --glyph-ink:var(--ink); --glyph-hair:var(--hair-strong);
  width:64px; height:64px; border-radius:16px; display:grid; place-items:center; flex:0 0 auto;
  background:color-mix(in srgb,var(--hue) 14%, var(--card-2));
  border:1px solid color-mix(in srgb,var(--hue) 28%, var(--hair));
  color:color-mix(in srgb,var(--hue) 78%, var(--ink));
}
@media (prefers-color-scheme:dark){.glyph{color:color-mix(in srgb,var(--hue) 88%, white)}}
:root[data-theme=light] .glyph{color:color-mix(in srgb,var(--hue) 78%, var(--ink))}
:root[data-theme=dark] .glyph{color:color-mix(in srgb,var(--hue) 88%, white)}
.glyph svg{width:48px; height:48px; display:block}
.card-text{display:flex; flex-direction:column; gap:6px}
.card h3{margin:0; font-size:1.1rem; line-height:1.25}
.card p{max-width:60ch}
.card-foot{display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:auto}
.card-meta{margin:0; display:flex; flex-wrap:wrap; gap:2px 10px}
.card-meta .date{white-space:nowrap}
.card .go{margin:0}

.inside{position:relative; z-index:2; font-size:.84rem}
.inside summary{
  list-style:none; cursor:pointer; display:inline-flex; align-items:center; gap:6px;
  color:var(--muted); font-weight:600; padding:3px 0; border-radius:6px;
}
.inside summary::-webkit-details-marker{display:none}
.inside summary::before{
  content:""; width:6px; height:6px; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor;
  transform:rotate(-45deg) translateY(1px); transition:transform .14s ease; margin-right:2px;
}
.inside[open] summary::before{transform:rotate(45deg) translateY(-1px)}
.inside summary:hover{color:var(--ink)}
.inside summary:focus-visible{outline:2px solid var(--accent); outline-offset:2px}
.inside-links{list-style:none; margin:8px 0 0; padding:0; display:flex; flex-wrap:wrap; gap:6px}
.inside-links a{
  display:inline-block; padding:3px 10px; border-radius:999px; font-weight:600; font-size:.8rem;
  background:var(--card-2); border:1px solid var(--hair); color:var(--ink);
}
.inside-links a:hover{text-decoration:none; border-color:color-mix(in srgb,var(--hue) 50%, var(--hair-strong)); color:var(--accent-ink)}

@container (min-width:520px){
  .card-body{display:grid; grid-template-columns:auto 1fr; column-gap:20px; row-gap:12px; align-items:start}
  .glyph{grid-row:1 / span 3}
  .card-text,.inside,.card-foot{grid-column:2}
  .card-foot{margin-top:2px}
}

.plain-list{list-style:none; margin:2px 0; padding:0; display:flex; flex-direction:column; gap:4px; font-size:.9rem}
.plain-list a{color:var(--accent-ink); position:relative; z-index:2}
.card--plain:hover{transform:none; box-shadow:var(--shadow-sm); border-color:var(--hair)}

.site-foot .shell{gap:10px 18px}
.site-foot .links{display:flex; gap:14px; margin-left:auto}

@media (max-width:640px){
  .theme{margin-left:0}
  .card{flex-basis:100%}
  .section-head{display:block}
  .section-head .desc{display:block; margin-top:2px}
}
`;

function crayons(size) {
  const hues = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
  return (
    `<span class="crayons crayons-${size}" aria-hidden="true">` +
    hues.map((h) => `<i style="background:var(--c-${h})"></i>`).join('') +
    `</span>`
  );
}

function groupSection(id, group, cards) {
  if (!cards.length) return '';
  return `<section class="group" aria-labelledby="group-${id}">
    <div class="section-head">
      <h2 id="group-${id}">${esc(group.title)}</h2>
      <span class="desc">${esc(group.desc)}</span>
    </div>
    <div class="card-grid">
      ${cards.join('\n      ')}
    </div>
  </section>`;
}

export function buildScrapbookIndex(scrapbookDir) {
  const entries = readdirSync(scrapbookDir, { withFileTypes: true });
  const typeDirs = entries
    .filter((e) => e.isDirectory() && !SCAFFOLDING.has(e.name))
    .map((e) => e.name)
    .sort();

  // Known types first (registry order, grouped), then any unknown dirs as
  // fallback cards in a group of their own.
  const known = Object.keys(REGISTRY).filter((t) => typeDirs.includes(t));
  const unknown = typeDirs.filter((t) => !REGISTRY[t]);

  const sections = Object.entries(GROUPS).map(([id, group]) =>
    groupSection(
      id,
      group,
      known
        .filter((t) => REGISTRY[t].group === id)
        .map((t) => card(t, REGISTRY[t], scrapbookDir))
        .filter(Boolean)
    )
  );
  const unknownCards = unknown.map((t) => fallbackCard(t, join(scrapbookDir, t))).filter(Boolean);
  sections.push(
    groupSection('other', { title: 'Other', desc: 'Published without a card of its own' }, unknownCards)
  );

  // Loose root-level HTML files (rare) get a plain section so they stay reachable.
  const looseHtml = entries
    .filter((e) => e.isFile() && !SCAFFOLDING.has(e.name) && e.name.endsWith('.html'))
    .map((e) => e.name);
  if (looseHtml.length) {
    sections.push(
      groupSection('loose', { title: 'Loose files', desc: 'Pages at the top of the folder' }, [
        `<article class="card card--plain"><div class="card-top"></div><div class="card-body"><ul class="plain-list">${looseHtml
          .map((f) => `<li><a href="${esc(f)}">${esc(f)}</a></li>`)
          .join('')}</ul></div></article>`,
      ])
    );
  }

  const cardCount = sections.join('').split('<article class="card').length - 1;
  const newest = typeDirs.map((t) => updatedOn(join(scrapbookDir, t))).sort().at(-1);

  const stats = [
    `<span class="chip accent"><b>${typeDirs.length}</b> collection${typeDirs.length === 1 ? '' : 's'}</span>`,
    newest ? `<span class="chip">Updated ${esc(newest)}</span>` : '',
    `<a class="chip" href="${REPO_URL}/tree/main/scrapbook">Source folder on GitHub</a>`,
  ].join('');

  const tagline =
    `Reports, galleries, and reference sheets made while building ` +
    `<a href="${APP_URL}">Splotch</a>, a drawing app for toddlers. Each one is a finished result ` +
    `checked into the repo, so it stays readable long after the work that produced it is done.`;

  const content = cardCount
    ? sections.filter(Boolean).join('\n    ')
    : `<p class="empty">Nothing published yet. Run <code>npm run scrapbook:publish -- &lt;source&gt; &lt;type&gt;/&lt;name&gt;</code>.</p>`;

  const body = `<header class="masthead">
  <div class="masthead-deco" aria-hidden="true">${inlineIcon('splotchy')}</div>
  <div class="shell">
    <div class="brand-row">
      <span class="brand">${crayons('lg')}<span class="brand-name"><a href="${APP_URL}">Splotch</a><span class="brand-sub">Scrapbook</span></span></span>
      ${themeSwitch()}
    </div>
    <div class="masthead-body">
      <h1>Scrapbook</h1>
      <p class="tagline">${tagline}</p>
      <div class="stat-row">${stats}</div>
    </div>
  </div>
</header>
<main>
  <div class="shell">
    ${content}
  </div>
</main>
<footer class="site-foot">
  <div class="shell">
    ${crayons('sm')}
    <p>This site is the <code>scrapbook/</code> folder of the Splotch repository, published with GitHub Pages.</p>
    <span class="links"><a href="${REPO_URL}">Repository</a><a href="${APP_URL}">splotch.art</a></span>
  </div>
</footer>
${THEME_SWITCH_SCRIPT}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Splotch scrapbook</title>
<meta name="description" content="Reports, galleries, and reference sheets made while building Splotch, a drawing app for toddlers."/>
${THEME_BOOT_SCRIPT}
${chromeStyle(PAGE_CSS)}
</head>
<body>
${body}
</body>
</html>
`;
}
