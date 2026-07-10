// Client runtime for the contact sheet. The generator injects the cell data and
// initial theme as `window.__CONTACT_SHEET__` (a JSON blob) ahead of this
// script, so nothing here is string-interpolated at build time — this file is
// plain, lintable JS that reads its inputs from that global.
const { cells: CELLS, theme: INITIAL_THEME } = window.__CONTACT_SHEET__;
const RENDER_MAX = 520;
const OUTLINE_LUMA = 150; // magicBrush.OUTLINE_LUMA_THRESHOLD
const PAPER = { dark: '#211f29', light: '#fcfbf8' };
const BLEND = { dark: 'screen', light: 'multiply' };
const INVERT = { dark: true, light: false };
const VIEWS = ['color', 'outline', 'combined'];

let gTheme = INITIAL_THEME;
let gView = 'combined';

// Decode a data URI into an <img>, or null.
function load(uri) {
  return new Promise((res) => {
    if (!uri) {
      res(null);
      return;
    }
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = uri;
  });
}

// Fit long edge to RENDER_MAX, keep aspect.
function fit(w, h) {
  const s = Math.min(1, RENDER_MAX / Math.max(w, h));
  return [Math.round(w * s), Math.round(h * s)];
}

// Fills-only twin: punch the twin's own outline pixels using the line art as a
// mask (luma<OUTLINE_LUMA -> transparent) — mirrors magicBrush.buildFillsSheet.
function buildFills(twin, lineArt, w, h) {
  const fc = document.createElement('canvas');
  fc.width = w;
  fc.height = h;
  const fx = fc.getContext('2d');
  fx.drawImage(twin, 0, 0, w, h);
  if (lineArt) {
    const mc = document.createElement('canvas');
    mc.width = w;
    mc.height = h;
    const mx = mc.getContext('2d', { willReadFrequently: true });
    mx.drawImage(lineArt, 0, 0, w, h);
    const px = mx.getImageData(0, 0, w, h),
      d = px.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i + 3] = l < OUTLINE_LUMA ? 255 : 0;
    }
    mx.putImageData(px, 0, 0);
    fx.globalCompositeOperation = 'destination-out';
    fx.drawImage(mc, 0, 0);
    fx.globalCompositeOperation = 'source-over';
  }
  return fc;
}

// Draw the line-art layer the way DrawingCanvas does: invert(1) in dark so black
// lines become white, then blend (screen dark / multiply light) over the paper.
function drawLineArt(ctx, lineArt, theme, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = BLEND[theme];
  if (INVERT[theme]) ctx.filter = 'invert(1)';
  ctx.drawImage(lineArt, 0, 0, w, h);
  ctx.restore();
}

function render(tile) {
  const { canvas, imgs } = tile;
  const theme = gTheme;
  const view = tile.view || gView;
  const twin = theme === 'dark' ? imgs.night : imgs.light;
  const ref = twin || imgs.lineArt || imgs.light || imgs.night;
  if (!ref) {
    return;
  }
  const [w, h] = fit(ref.naturalWidth, ref.naturalHeight);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  if (view === 'color') {
    if (twin) ctx.drawImage(twin, 0, 0, w, h);
    else {
      ctx.fillStyle = PAPER[theme];
      ctx.fillRect(0, 0, w, h);
    }
    tile.vlabel.textContent = 'color';
    return;
  }

  ctx.fillStyle = PAPER[theme];
  ctx.fillRect(0, 0, w, h);

  if (view === 'combined' && twin) {
    const key = theme;
    if (!tile.fills) tile.fills = {};
    if (!tile.fills[key]) tile.fills[key] = buildFills(twin, imgs.lineArt, w, h);
    ctx.drawImage(tile.fills[key], 0, 0, w, h);
  }
  if (imgs.lineArt) drawLineArt(ctx, imgs.lineArt, theme, w, h);
  tile.vlabel.textContent = view;
}

const tiles = [];
function renderAll() {
  for (const t of tiles) render(t);
}

async function build() {
  document.documentElement.dataset.ui = gTheme;
  const secEl = document.getElementById('sections');
  // Group cells by category, preserving order.
  const groups = [];
  for (const c of CELLS) {
    let g = groups.find((x) => x.cat === c.cat);
    if (!g) {
      g = { cat: c.cat, cells: [] };
      groups.push(g);
    }
    g.cells.push(c);
  }
  for (const g of groups) {
    const h2 = document.createElement('h2');
    h2.innerHTML =
      g.cat.charAt(0).toUpperCase() + g.cat.slice(1) + ' <span class="cat-id">' + g.cat + '</span>';
    secEl.appendChild(h2);
    const grid = document.createElement('div');
    grid.className = 'grid';
    secEl.appendChild(grid);
    for (const c of g.cells) {
      const fig = document.createElement('figure');
      fig.className = 'cell';
      const missing = !c.night && !c.light && !c.lineArt;
      if (missing) {
        fig.innerHTML =
          '<div class="missing">missing<br>' +
          c.id +
          '-' +
          c.orient +
          '</div><figcaption>' +
          c.name +
          '</figcaption>';
        grid.appendChild(fig);
        continue;
      }
      const frame = document.createElement('div');
      frame.className = 'frame';
      const canvas = document.createElement('canvas');
      const ol = document.createElement('span');
      ol.className = 'olabel';
      ol.textContent = c.orient;
      const vl = document.createElement('span');
      vl.className = 'vlabel';
      vl.textContent = gView;
      frame.appendChild(canvas);
      frame.appendChild(ol);
      frame.appendChild(vl);
      const cap = document.createElement('figcaption');
      cap.textContent = c.name + (c.night ? '' : ' (no night twin)');
      fig.appendChild(frame);
      fig.appendChild(cap);
      grid.appendChild(fig);
      const [night, lineArt, light] = await Promise.all([
        load(c.night),
        load(c.lineArt),
        load(c.light),
      ]);
      const tile = { canvas, vlabel: vl, imgs: { night, lineArt, light }, view: null, cat: c.cat };
      tiles.push(tile);
      fig.addEventListener('click', () => {
        const cur = tile.view || gView;
        tile.view = VIEWS[(VIEWS.indexOf(cur) + 1) % VIEWS.length];
        render(tile);
      });
      render(tile);
    }
  }
}

document.getElementById('themeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  gTheme = b.dataset.theme;
  for (const x of e.currentTarget.children) x.classList.toggle('on', x === b);
  document.documentElement.dataset.ui = gTheme;
  renderAll();
});
document.getElementById('viewSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  gView = b.dataset.view;
  for (const x of e.currentTarget.children) x.classList.toggle('on', x === b);
  for (const t of tiles) t.view = null; // clear per-tile overrides
  renderAll();
});

build();
