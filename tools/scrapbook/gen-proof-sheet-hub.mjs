import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { ROOT } from '../lib/proc.mjs';
import { chromeStyle, compactTopbar, siteFooter } from './lib/scrapbook-chrome.mjs';

export const PROOF_SHEET_HUB_PATH = join(
  ROOT,
  'scrapbook',
  'coloring-book-proof-sheets',
  'index.html'
);

// The look (CSS) and the browser runtime (client JS) live in real files under
// proof-sheet-hub-assets/ so they get editor highlighting, Prettier, and ESLint;
// this module only assembles the shell around them.
const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'proof-sheet-hub-assets');
const css = readFileSync(join(ASSETS_DIR, 'proof-sheet-hub.css'), 'utf8');
const clientJs = readFileSync(join(ASSETS_DIR, 'proof-sheet-hub.client.js'), 'utf8');

// The category registry. `pages` is the distinct page count each sibling sheet
// carries; tools/scrapbook/lib/scrapbook-index.mjs parses this literal back out of
// the built page (`const CATEGORIES = [ { id: '…', …, pages: N } ]`) and fails the
// scrapbook check when a sheet disagrees, so keep that shape when editing.
const CATEGORIES = [
  { id: 'farm', name: 'Farm', pages: 6 },
  { id: 'dinosaur', name: 'Dinosaurs', pages: 6 },
  { id: 'creatures', name: 'Creatures', pages: 6 },
  { id: 'nature', name: 'Nature', pages: 6 },
  { id: 'objects', name: 'Objects', pages: 6 },
  { id: 'shapes', name: 'Shapes', pages: 6 },
  { id: 'space', name: 'Space', pages: 6 },
  { id: 'vehicles', name: 'Vehicles', pages: 6 },
];

// Each sheet's size on disk drives the hub's download progress bar: the server
// gzips the sheet, so the response's own Content-Length is the compressed size.
function sheetBytes(id) {
  try {
    return statSync(join(dirname(PROOF_SHEET_HUB_PATH), `${id}.html`)).size;
  } catch {
    return null;
  }
}

function categoriesLiteral() {
  const rows = CATEGORIES.map(
    (c) =>
      `        { id: '${c.id}', name: '${c.name}', pages: ${c.pages}, bytes: ${sheetBytes(c.id)} },`
  );
  return `[\n${rows.join('\n')}\n      ]`;
}

function seg(id, label, options) {
  const buttons = options
    .map(([value, text]) => `<button type="button" data-value="${value}">${text}</button>`)
    .join('');
  return `<div class="seg" id="${id}" role="group" aria-label="${label}">${buttons}</div>`;
}

const VIEW_OPTIONS = [
  ['outline', 'Outline'],
  ['fill', 'Fill'],
  ['combined', 'Combined'],
];
const SHOW_OPTIONS = [
  ['both', 'Both'],
  ['light', 'Light'],
  ['night', 'Night'],
];

const swatches = (hues) =>
  `<span class="swatches" aria-hidden="true">${hues.map((h) => `<i style="background:var(--c-${h})"></i>`).join('')}</span>`;

export function buildColoringBookProofSheetHub() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Coloring-book proof sheets · Splotch</title>
    ${chromeStyle(css)}
  </head>
  <body>
    <header class="hub-head">
      <div class="shell">
        <div class="topbar">
          ${compactTopbar({
            home: '../index.html',
            crumbs: [
              { label: 'Scrapbook', href: '../index.html' },
              { label: 'Coloring-book proof sheets' },
            ],
          })}
        </div>
        <div class="intro">
          <h1>Coloring-book proof sheets</h1>
          <p class="lede">
            Every coloring page in the app, drawn from the image files that ship with it.
            Each page comes in a <b>wide</b> and a <b>tall</b> version, and each version has
            four layers: a pen outline, a chalk outline for night mode, and one colored fill
            per theme. Pick a category, then switch views to check each layer on its own or
            stacked the way the app draws it.
          </p>
          <details class="legend-wrap" id="legend" open>
            <summary>How to read a tile</summary>
            <div class="legend">
            <div><b><span class="key">1</span>Outline</b>The line art alone: black pen on light paper, white chalk on night paper.</div>
            <div><b><span class="key">2</span>Fill</b>The colored fill alone. Shipped fills carry no outline pixels; the app draws the outline on top.</div>
            <div><b><span class="key">3</span>Combined</b>Fill under outline, over paper. This is what a child sees, so judge a page here.</div>
            <div><b>Outline % ${swatches(['green', 'yellow', 'red'])}</b>How much of the pen outline the light fill keeps, scored on the raw fill before its outline pixels were removed. Green from 99%, yellow from 96%, red below.</div>
            </div>
          </details>
          <p class="keys">
            <kbd>←</kbd> <kbd>→</kbd> category<span class="sep">·</span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> view<span class="sep">·</span><kbd>B</kbd> <kbd>L</kbd> <kbd>N</kbd> both / light / night<span class="sep">·</span>click a tile to cycle its view alone
          </p>
        </div>
      </div>
    </header>
    <div class="toolbar" id="toolbar">
      <div class="shell">
        <div class="tabs" id="tabs" role="tablist" aria-label="Coloring categories"></div>
        <div class="segs">
          ${seg('viewSeg', 'View', VIEW_OPTIONS)}
          ${seg('showSeg', 'Show', SHOW_OPTIONS)}
        </div>
      </div>
    </div>
    <main>
      <section class="shell sheet" id="sheet" role="tabpanel" data-show="both">
        <div class="cat-head">
          <h2 id="catTitle"></h2>
          <span class="meta" id="catMeta"></span>
          <a class="open" id="catOpen" href="#"></a>
        </div>
        <nav class="pages-nav" id="pagesNav" aria-label="Pages in this category"></nav>
        <div class="status" id="status" role="status" hidden>
          <span id="statusText"></span>
          <div class="progress" id="progress" aria-hidden="true"><i></i></div>
        </div>
        <div id="pages"></div>
      </section>
    </main>
    ${siteFooter({ home: '../index.html' })}
    <button class="to-top" id="toTop" type="button" aria-label="Back to top" hidden>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>
    </button>
    <dialog class="zoom-dialog" id="zoom" aria-label="Zoomed tile">
      <div class="zoom-bar">
        <span class="title" id="zoomTitle"></span>
        ${seg('zoomSeg', 'View', VIEW_OPTIONS)}
        <button class="close" id="zoomClose" type="button" aria-label="Close">&#x2715;</button>
      </div>
      <div class="zoom-stage" id="zoomStage"><canvas id="zoomCanvas"></canvas></div>
      <button class="zoom-step prev" id="zoomPrev" type="button" aria-label="Previous tile">&#8592;</button>
      <button class="zoom-step next" id="zoomNext" type="button" aria-label="Next tile">&#8594;</button>
    </dialog>
    <script>
      const CATEGORIES = ${categoriesLiteral()};
    </script>
    <script>
${clientJs}    </script>
  </body>
</html>
`;
}

export function writeColoringBookProofSheetHub() {
  writeFileSync(PROOF_SHEET_HUB_PATH, buildColoringBookProofSheetHub());
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeColoringBookProofSheetHub();
  console.log(`Rebuilt ${PROOF_SHEET_HUB_PATH}`);
}
