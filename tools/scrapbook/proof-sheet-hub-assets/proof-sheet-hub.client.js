// Browser runtime for the coloring-book proof-sheet hub. The generator emits the
// category registry as a `CATEGORIES` global ahead of this script. Each category's
// sheet (<id>.html, built by tools/asset-gen/coloring/gen-book-proof-sheet.mjs) is
// fetched on demand and the JSON it embeds as `window.__COLORING_BOOK_PROOF_SHEET__`
// is cut out of the HTML text — the same contract tools/scrapbook/lib/scrapbook-index.mjs
// reads at check time — so the hub draws the sheet's tiles itself instead of framing
// the sheet. The compositing mirrors the sheet's own client runtime
// (coloring-book-proof-sheet.client.js) and DrawingCanvas.svelte.

const SHEET_DATA_MARKER = 'window.__COLORING_BOOK_PROOF_SHEET__ = ';
// The bracket is escaped so the closing tag cannot end the inline script this file
// is embedded in.
const SHEET_DATA_END = ';\x3c/script>';

const PAPER = { light: '#fcfbf8', dark: '#211f29' };
const BLEND = { light: 'multiply', dark: 'screen' };
const VIEWS = ['outline', 'fill', 'combined'];
const VIEW_LABEL = { outline: 'Outline', fill: 'Fill', combined: 'Combined' };
const SHOWS = ['both', 'light', 'night'];
const THEME_LABEL = { light: 'Light', dark: 'Night' };
const ORIENTS = ['wide', 'tall'];

// Tile canvases render at 640 CSS px on the long edge, scaled by the device pixel
// ratio up to a cap that keeps 24 canvases per category inside mobile memory.
const TILE_RENDER_BASE_PX = 640;
const TILE_RENDER_MAX_PX = 1024;
const ZOOM_RENDER_MAX_PX = 1536;
// Luma below which a line-art pixel counts as outline when punching a fresh
// sample fill (asset-gen lib/punch-fill.mjs); shipped fills are drawn as-is.
const OUTLINE_LUMA = 150;
const SCORE_GOOD_PCT = 99;
const SCORE_OK_PCT = 96;
const BACK_TO_TOP_AFTER_PX = 600;
const PROGRESS_HOLD_BEFORE_PARSE = 0.99;
const BYTES_PER_MB = 1024 * 1024;

const tabsEl = document.getElementById('tabs');
const viewSegEl = document.getElementById('viewSeg');
const showSegEl = document.getElementById('showSeg');
const toolbarEl = document.getElementById('toolbar');
const sheetEl = document.getElementById('sheet');
const catTitleEl = document.getElementById('catTitle');
const catMetaEl = document.getElementById('catMeta');
const catOpenEl = document.getElementById('catOpen');
const pagesNavEl = document.getElementById('pagesNav');
const pagesEl = document.getElementById('pages');
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('statusText');
const progressEl = document.getElementById('progress');
const progressBarEl = progressEl.firstElementChild;
const toTopEl = document.getElementById('toTop');
const legendEl = document.getElementById('legend');
const zoomEl = document.getElementById('zoom');
const zoomTitleEl = document.getElementById('zoomTitle');
const zoomSegEl = document.getElementById('zoomSeg');
const zoomCanvas = document.getElementById('zoomCanvas');
const zoomStageEl = document.getElementById('zoomStage');

const tabButtons = CATEGORIES.map((cat, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = cat.name;
  b.id = `tab-${cat.id}`;
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-controls', 'sheet');
  b.setAttribute('aria-selected', 'false');
  b.addEventListener('click', () => selectCategory(i));
  tabsEl.appendChild(b);
  return b;
});

const state = { category: -1, view: 'combined', show: 'both', loadToken: 0 };
const sheetCache = new Map();
let tiles = [];
let zoomTile = null;
let zoomView = null;

// ---- Fetching a sheet -------------------------------------------------------

function fitInto(w, h, maxPx) {
  const s = Math.min(1, maxPx / Math.max(w, h));
  return [Math.round(w * s), Math.round(h * s)];
}

function formatMb(bytes) {
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}

async function fetchSheetText(cat, onProgress) {
  const res = await fetch(`${cat.id}.html`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (!res.body) return res.text();
  // The sheet is served gzip-encoded, so the response's Content-Length is the
  // compressed size while the reader yields decompressed bytes; the byte count
  // recorded at build time is the right denominator.
  const total = cat.bytes || Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(total ? Math.min(received / total, PROGRESS_HOLD_BEFORE_PARSE) : null);
  }
  const all = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(all);
}

function parseSheet(html) {
  const at = html.indexOf(SHEET_DATA_MARKER);
  if (at === -1) throw new Error('the sheet has no embedded proof-sheet data');
  const from = at + SHEET_DATA_MARKER.length;
  const to = html.indexOf(SHEET_DATA_END, from);
  return JSON.parse(html.slice(from, to));
}

function loadSheet(cat, onProgress) {
  if (!sheetCache.has(cat.id)) {
    const p = fetchSheetText(cat, onProgress)
      .then(parseSheet)
      .catch((err) => {
        sheetCache.delete(cat.id);
        throw err;
      });
    sheetCache.set(cat.id, p);
    return p;
  }
  onProgress(1);
  return sheetCache.get(cat.id);
}

function loadImage(uri) {
  return new Promise((resolve) => {
    if (!uri) {
      resolve(null);
      return;
    }
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = uri;
  });
}

// ---- Compositing --------------------------------------------------------------

// Fresh sample fills still carry their outline; cut it away with the line art as
// a mask so the outline layer drawn on top is the only outline. Shipped fills are
// already fills-only and re-cutting them stitches a dotted ring around every line.
function punchedFill(fill, lineArt, w, h) {
  const fc = document.createElement('canvas');
  fc.width = w;
  fc.height = h;
  const fx = fc.getContext('2d');
  fx.drawImage(fill, 0, 0, w, h);
  if (!lineArt) return fc;
  const mc = document.createElement('canvas');
  mc.width = w;
  mc.height = h;
  const mx = mc.getContext('2d', { willReadFrequently: true });
  mx.drawImage(lineArt, 0, 0, w, h);
  const px = mx.getImageData(0, 0, w, h);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i + 3] = luma < OUTLINE_LUMA ? 255 : 0;
  }
  mx.putImageData(px, 0, 0);
  fx.globalCompositeOperation = 'destination-out';
  fx.drawImage(mc, 0, 0);
  return fc;
}

// Night paper takes white lines: the chalk asset is drawn ink-on-white like the
// pen, so it is inverted before the screen blend. Canvas filters are the cheap
// path; a pixel pass covers engines without them.
function invertedImage(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  const px = cx.getImageData(0, 0, w, h);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
  cx.putImageData(px, 0, 0);
  return c;
}

function drawLineArt(ctx, lineArt, theme, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = BLEND[theme];
  if (theme === 'dark') {
    if (typeof ctx.filter === 'string') {
      ctx.filter = 'invert(1)';
      ctx.drawImage(lineArt, 0, 0, w, h);
    } else {
      ctx.drawImage(invertedImage(lineArt, w, h), 0, 0);
    }
  } else {
    ctx.drawImage(lineArt, 0, 0, w, h);
  }
  ctx.restore();
}

function layersFor(tile) {
  const { theme, imgs } = tile;
  return {
    fill: theme === 'dark' ? imgs.night : imgs.light,
    lineArt: theme === 'dark' ? imgs.chalk || imgs.lineArt : imgs.lineArt,
  };
}

function drawView(canvas, tile, view, maxPx) {
  const { fill, lineArt } = layersFor(tile);
  const ref = fill || lineArt;
  if (!ref) return false;
  const [w, h] = fitInto(ref.naturalWidth, ref.naturalHeight, maxPx);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (view === 'fill') {
    if (fill) ctx.drawImage(fill, 0, 0, w, h);
    else {
      ctx.fillStyle = PAPER[tile.theme];
      ctx.fillRect(0, 0, w, h);
    }
    return true;
  }
  ctx.fillStyle = PAPER[tile.theme];
  ctx.fillRect(0, 0, w, h);
  if (view === 'combined' && fill) {
    if (tile.source === 'samples') ctx.drawImage(punchedFill(fill, lineArt, w, h), 0, 0);
    else ctx.drawImage(fill, 0, 0, w, h);
  }
  if (lineArt) drawLineArt(ctx, lineArt, tile.theme, w, h);
  return true;
}

function tileRenderMaxPx() {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(TILE_RENDER_MAX_PX, Math.round(TILE_RENDER_BASE_PX * dpr));
}

function renderTile(tile) {
  if (!tile.imgs) return;
  const view = tile.view || state.view;
  drawView(tile.canvas, tile, view, tileRenderMaxPx());
  // The badge marks a tile whose view was cycled away from the toolbar's.
  tile.tag.hidden = !tile.view;
  tile.tag.textContent = VIEW_LABEL[view];
  tile.frame.classList.remove('pending');
}

function renderAllTiles() {
  for (const t of tiles) renderTile(t);
}

// ---- Building a category --------------------------------------------------------

function groupPages(cells) {
  const pages = [];
  const byId = new Map();
  for (const cell of cells) {
    let page = byId.get(cell.id);
    if (!page) {
      page = { id: cell.id, name: cell.name, cells: {} };
      byId.set(cell.id, page);
      pages.push(page);
    }
    page.cells[cell.orient] = cell;
  }
  return pages;
}

function scoreClass(pct) {
  return pct >= SCORE_GOOD_PCT ? 'good' : pct >= SCORE_OK_PCT ? 'ok' : 'warn';
}

function zoomIcon() {
  return (
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/></svg>'
  );
}

function tileLabel(tile) {
  return `${tile.cell.name} ${tile.cell.orient}, ${THEME_LABEL[tile.theme].toLowerCase()}`;
}

function buildTile(cell, theme, source, imgsPromise) {
  const fig = document.createElement('figure');
  fig.className = `tile ${cell.orient} ${theme === 'dark' ? 'night' : 'light'}`;
  fig.dataset.theme = theme;
  const wrap = document.createElement('div');
  wrap.className = 'frame-wrap';
  const frame = document.createElement('button');
  frame.type = 'button';
  frame.className = 'frame pending';
  const canvas = document.createElement('canvas');
  const tag = document.createElement('span');
  tag.className = 'view-tag';
  tag.hidden = true;
  frame.append(canvas, tag);
  const zoom = document.createElement('button');
  zoom.type = 'button';
  zoom.className = 'zoom';
  zoom.innerHTML = zoomIcon();
  wrap.append(frame, zoom);

  const cap = document.createElement('figcaption');
  const themeTag = document.createElement('span');
  themeTag.className = `theme-tag ${theme === 'dark' ? 'night' : 'light'}`;
  themeTag.textContent = THEME_LABEL[theme];
  const name = document.createElement('span');
  name.className = 'cell-name';
  name.textContent = `${cell.id}-${cell.orient}`;
  cap.append(themeTag, name);
  if (theme === 'light' && cell.keep != null) {
    const score = document.createElement('span');
    score.className = `score ${scoreClass(cell.keep)}`;
    score.textContent = `outline ${cell.keep.toFixed(1)}%`;
    score.title = `${cell.keep.toFixed(1)}% of the pen outline survives in the light fill`;
    cap.appendChild(score);
  }
  if (theme === 'dark' && !cell.night) cap.appendChild(missingNote('no night fill'));
  if (theme === 'dark' && !cell.chalk) cap.appendChild(missingNote('no chalk outline'));
  fig.append(wrap, cap);

  const tile = { el: fig, frame, canvas, tag, cell, theme, source, imgs: null, view: null };
  frame.setAttribute('aria-label', `${tileLabel(tile)}: cycle view`);
  zoom.setAttribute('aria-label', `${tileLabel(tile)}: zoom`);
  frame.addEventListener('click', () => {
    const cur = tile.view || state.view;
    tile.view = VIEWS[(VIEWS.indexOf(cur) + 1) % VIEWS.length];
    renderTile(tile);
  });
  zoom.addEventListener('click', () => openZoom(tile));
  imgsPromise.then((imgs) => {
    tile.imgs = imgs;
    renderTile(tile);
  });
  return tile;
}

function missingNote(text) {
  const note = document.createElement('span');
  note.className = 'missing';
  note.textContent = text;
  return note;
}

function buildPage(page, source) {
  const section = document.createElement('section');
  section.className = 'page';
  section.id = `page-${page.id}`;
  const head = document.createElement('div');
  head.className = 'page-head';
  const h3 = document.createElement('h3');
  h3.textContent = page.name;
  head.appendChild(h3);
  if (page.id !== page.name.toLowerCase()) {
    const id = document.createElement('span');
    id.className = 'id';
    id.textContent = page.id;
    head.appendChild(id);
  }
  const body = document.createElement('div');
  body.className = 'page-body';
  const built = [];
  for (const orient of ORIENTS) {
    const cell = page.cells[orient];
    if (!cell) continue;
    const imgs = Promise.all([
      loadImage(cell.lineArt),
      loadImage(cell.chalk),
      loadImage(cell.light),
      loadImage(cell.night),
    ]).then(([lineArt, chalk, light, night]) => ({ lineArt, chalk, light, night }));
    for (const theme of ['light', 'dark']) {
      const tile = buildTile(cell, theme, source, imgs);
      body.appendChild(tile.el);
      built.push(tile);
    }
  }
  section.append(head, body);
  return { el: section, tiles: built };
}

function buildSkeleton(cat) {
  pagesEl.replaceChildren();
  for (let i = 0; i < cat.pages; i++) {
    const section = document.createElement('section');
    section.className = 'page';
    const body = document.createElement('div');
    body.className = 'page-body';
    for (const orient of ORIENTS) {
      for (const theme of ['light', 'dark']) {
        const fig = document.createElement('figure');
        fig.className = `tile ${orient} ${theme === 'dark' ? 'night' : 'light'}`;
        const frame = document.createElement('div');
        frame.className = 'frame pending';
        fig.appendChild(frame);
        body.appendChild(fig);
      }
    }
    section.appendChild(body);
    pagesEl.appendChild(section);
  }
}

function renderCategory(cat, data) {
  const pages = groupPages(data.cells);
  const tileCount = data.cells.length * 2;
  const files = data.source === 'samples' ? 'sample files' : 'shipped files';
  catMetaEl.textContent = `${pages.length} pages · ${tileCount} tiles · ${files}`;
  pagesNavEl.replaceChildren(
    ...pages.map((p) => {
      const a = document.createElement('a');
      a.href = `#${cat.id}/${p.id}`;
      a.textContent = p.name;
      return a;
    })
  );
  tiles = [];
  pagesEl.replaceChildren();
  for (const page of pages) {
    const built = buildPage(page, data.source);
    pagesEl.appendChild(built.el);
    tiles.push(...built.tiles);
  }
}

function showStatus(text, fraction) {
  statusEl.hidden = false;
  statusTextEl.textContent = text;
  progressEl.hidden = fraction === undefined;
  progressEl.classList.toggle('indeterminate', fraction === null);
  progressBarEl.style.width = fraction ? `${Math.round(fraction * 100)}%` : '0';
}

function showError(cat, err) {
  statusEl.hidden = true;
  pagesEl.replaceChildren();
  const box = document.createElement('div');
  box.className = 'error';
  box.innerHTML = `<b>Could not load ${cat.name}.</b>`;
  const p = document.createElement('span');
  p.textContent = `${err.message}. `;
  const a = document.createElement('a');
  a.href = `${cat.id}.html`;
  a.textContent = `Open ${cat.id}.html directly`;
  box.append(p, a, document.createTextNode('.'));
  pagesEl.appendChild(box);
}

// ---- Category selection -------------------------------------------------------------

// The hash is `#<category>` or `#<category>/<page>`.
function hashParts() {
  const [category, page] = location.hash.replace(/^#/, '').split('/');
  return { category, page };
}

function indexFromHash() {
  const i = CATEGORIES.findIndex((c) => c.id === hashParts().category);
  return i === -1 ? 0 : i;
}

function scrollToHashPage() {
  const { page } = hashParts();
  const target = page && document.getElementById(`page-${page}`);
  if (target) target.scrollIntoView({ block: 'start' });
}

async function selectCategory(i, { fromHash = false, initial = false } = {}) {
  i = (i + CATEGORIES.length) % CATEGORIES.length;
  if (i === state.category) return;
  state.category = i;
  const cat = CATEGORIES[i];
  const token = ++state.loadToken;

  tabButtons.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
  tabButtons[i].scrollIntoView({ block: 'nearest', inline: 'center' });
  sheetEl.setAttribute('aria-labelledby', tabButtons[i].id);
  sheetEl.dataset.sheet = `${cat.id}.html`;
  document.title = `${cat.name} — Coloring-book proof sheets · Splotch`;
  if (!fromHash && hashParts().category !== cat.id) {
    if (initial) history.replaceState(null, '', `#${cat.id}`);
    else location.hash = `#${cat.id}`;
  }
  if (!initial) sheetEl.scrollIntoView({ block: 'start' });
  if (zoomEl.open) zoomEl.close();

  catTitleEl.textContent = cat.name;
  catMetaEl.textContent = `${cat.pages} pages`;
  catOpenEl.href = `${cat.id}.html`;
  catOpenEl.textContent = `Open ${cat.id}.html`;
  pagesNavEl.replaceChildren();
  tiles = [];
  buildSkeleton(cat);
  const size = cat.bytes ? ` (${formatMb(cat.bytes)})` : '';
  showStatus(`Loading ${cat.name}${size}…`, cat.bytes ? 0 : null);

  try {
    const data = await loadSheet(cat, (fraction) => {
      if (token === state.loadToken) showStatus(`Loading ${cat.name}${size}…`, fraction);
    });
    if (token !== state.loadToken) return;
    statusEl.hidden = true;
    renderCategory(cat, data);
    scrollToHashPage();
  } catch (err) {
    if (token === state.loadToken) showError(cat, err);
  }
}

window.addEventListener('hashchange', async () => {
  await selectCategory(indexFromHash(), { fromHash: true });
  scrollToHashPage();
});

// ---- View + show controls ------------------------------------------------------------

function setSeg(segEl, value) {
  for (const b of segEl.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.value === value));
  }
}

function setView(view) {
  state.view = view;
  setSeg(viewSegEl, view);
  for (const t of tiles) t.view = null;
  renderAllTiles();
}

function setShow(show) {
  state.show = show;
  setSeg(showSegEl, show);
  sheetEl.dataset.show = show;
}

viewSegEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setView(b.dataset.value);
});
showSegEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setShow(b.dataset.value);
});

// ---- Zoom dialog -----------------------------------------------------------------

function visibleTiles() {
  if (state.show === 'both') return tiles;
  const theme = state.show === 'night' ? 'dark' : 'light';
  return tiles.filter((t) => t.theme === theme);
}

function renderZoom() {
  if (!zoomTile || !zoomTile.imgs) return;
  drawView(zoomCanvas, zoomTile, zoomView, ZOOM_RENDER_MAX_PX);
  setSeg(zoomSegEl, zoomView);
  zoomTitleEl.innerHTML = '';
  zoomTitleEl.append(
    `${zoomTile.cell.name} · ${zoomTile.cell.orient}`,
    Object.assign(document.createElement('span'), { textContent: THEME_LABEL[zoomTile.theme] })
  );
}

function openZoom(tile) {
  zoomTile = tile;
  zoomView = tile.view || state.view;
  renderZoom();
  if (!zoomEl.open) zoomEl.showModal();
}

function zoomStep(delta) {
  const list = visibleTiles();
  const at = list.indexOf(zoomTile);
  if (at === -1 || !list.length) return;
  zoomTile = list[(at + delta + list.length) % list.length];
  renderZoom();
}

function zoomSetView(view) {
  zoomView = view;
  renderZoom();
}

zoomSegEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) zoomSetView(b.dataset.value);
});
zoomStageEl.addEventListener('click', (e) => {
  if (e.target !== zoomCanvas) {
    zoomEl.close();
    return;
  }
  zoomSetView(VIEWS[(VIEWS.indexOf(zoomView) + 1) % VIEWS.length]);
});
document.getElementById('zoomPrev').addEventListener('click', () => zoomStep(-1));
document.getElementById('zoomNext').addEventListener('click', () => zoomStep(1));
document.getElementById('zoomClose').addEventListener('click', () => zoomEl.close());

// ---- Keyboard ---------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const viewIndex = ['1', '2', '3'].indexOf(e.key);
  if (zoomEl.open) {
    if (e.key === 'ArrowLeft') zoomStep(-1);
    else if (e.key === 'ArrowRight') zoomStep(1);
    else if (viewIndex !== -1) zoomSetView(VIEWS[viewIndex]);
    else return;
    e.preventDefault();
    return;
  }
  if (e.key === 'ArrowLeft') selectCategory(state.category - 1);
  else if (e.key === 'ArrowRight') selectCategory(state.category + 1);
  else if (viewIndex !== -1) setView(VIEWS[viewIndex]);
  else if (e.key === 'l' || e.key === 'n' || e.key === 'b') {
    setShow(SHOWS[['b', 'l', 'n'].indexOf(e.key)]);
  }
});

// ---- Legend, sticky bar height, back to top --------------------------------------------

// The legend is a full screen of cards on a phone, so it starts folded there.
const NARROW_VIEWPORT = '(max-width: 640px)';
if (window.matchMedia(NARROW_VIEWPORT).matches) legendEl.open = false;

function syncBarHeight() {
  document.documentElement.style.setProperty('--bar-h', `${toolbarEl.offsetHeight}px`);
}
if ('ResizeObserver' in window) new ResizeObserver(syncBarHeight).observe(toolbarEl);
syncBarHeight();

// Fade the edge of the tab strip that still hides tabs.
function syncTabsFade() {
  const hiddenRight = tabsEl.scrollLeft + tabsEl.clientWidth < tabsEl.scrollWidth - 1;
  tabsEl.classList.toggle('fade-l', tabsEl.scrollLeft > 1);
  tabsEl.classList.toggle('fade-r', hiddenRight);
}
tabsEl.addEventListener('scroll', syncTabsFade, { passive: true });
window.addEventListener('resize', syncTabsFade);
syncTabsFade();

function syncToTop() {
  toTopEl.hidden = window.scrollY < BACK_TO_TOP_AFTER_PX;
}
window.addEventListener('scroll', syncToTop, { passive: true });
toTopEl.addEventListener('click', () => window.scrollTo({ top: 0 }));
syncToTop();

setView(state.view);
setShow(state.show);
selectCategory(indexFromHash(), { initial: true });
