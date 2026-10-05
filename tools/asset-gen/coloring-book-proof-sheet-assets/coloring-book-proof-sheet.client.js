// Client runtime for the coloring-book proof sheet. The generator injects the cell
// data as `window.__COLORING_BOOK_PROOF_SHEET__` (a JSON blob) ahead of this script,
// so nothing here is string-interpolated at build time — this file is plain, lintable
// JS that reads its inputs from that global. See ../docs/coloring-book-proof-sheet.md
// for the layer model.
const {
  cells: CELLS,
  source: SOURCE,
  outlineLuma: OUTLINE_LUMA,
  lineArtAlpha: LINE_ART_ALPHA,
} = window.__COLORING_BOOK_PROOF_SHEET__;
const RENDER_MAX = 640;
const PAPER = { dark: '#211f29', light: '#fcfbf8' };
// BLEND and INVERT composite only raster-era line art; see drawRasterLineArt.
const BLEND = { dark: 'screen', light: 'multiply' };
const INVERT = { dark: true, light: false };
// The inverted pen: a night tile whose page has no chalk draws the pen in the
// white the chalk SVGs bake in.
const NIGHT_PEN_INK = '#fff';
const VIEWS = ['outline', 'color', 'combined'];

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

// Fills-only fill for a lined fill — a `--source samples` take or a git-mode
// raw-fill fallback still carries its outline — punched wherever the tile's line
// art has ink, approximating the punch asset-gen bakes into shipped fills
// (lib/punch-fill.mjs). Shipped fills are already fills-only (opaque, outline
// pixels inpainted) and MUST be drawn as-is: re-cutting them here with a binary
// mask at render resolution punches paper-holes whose resample phase never
// matches the line art's — a dotted dark ring around every line in dark mode
// (see tools/asset-gen/docs/inpainted-fill-punch.md).
function buildFills(fill, lineArt, w, h) {
  const fc = document.createElement('canvas');
  fc.width = w;
  fc.height = h;
  const fx = fc.getContext('2d');
  fx.drawImage(fill, 0, 0, w, h);
  if (lineArt) {
    const mc = document.createElement('canvas');
    mc.width = w;
    mc.height = h;
    const mx = mc.getContext('2d', { willReadFrequently: true });
    mx.drawImage(lineArt.img, 0, 0, w, h);
    const px = mx.getImageData(0, 0, w, h);
    // Bundle boundary: this self-contained browser runtime cannot import the Node
    // pipeline modules. image-stats.test.mjs guards both ink tests and their
    // injected thresholds against the pipeline convention.
    if (lineArt.kind === 'vector') maskVectorInk(px.data);
    else maskRasterInk(px.data);
    mx.putImageData(px, 0, 0);
    fx.globalCompositeOperation = 'destination-out';
    fx.drawImage(mc, 0, 0);
    fx.globalCompositeOperation = 'source-over';
  }
  return fc;
}

// A canonical SVG carries its ink in alpha: lineArtMask's test in lib/line-art.mjs.
function maskVectorInk(d) {
  for (let i = 0; i < d.length; i += 4) {
    d[i + 3] = d[i + 3] > LINE_ART_ALPHA ? 255 : 0;
  }
}

// A raster-era master is opaque ink-on-white, so its ink is the dark pixels.
function maskRasterInk(d) {
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i + 3] = l < OUTLINE_LUMA ? 255 : 0;
  }
}

function drawLineArt(ctx, lineArt, theme, w, h) {
  if (lineArt.kind === 'vector') drawVectorLineArt(ctx, lineArt, theme, w, h);
  else drawRasterLineArt(ctx, lineArt, theme, w, h);
}

// Vector overlays composite the way the app presents them (ADR-0129): plain
// source-over, the pen's black ink on light paper and the chalk's white ink on
// dark paper. Only the pen standing in for a missing chalk needs recolouring.
function drawVectorLineArt(ctx, lineArt, theme, w, h) {
  const inverted = theme === 'dark' && lineArt.role === 'pen';
  ctx.drawImage(inverted ? inked(lineArt.img, NIGHT_PEN_INK, w, h) : lineArt.img, 0, 0, w, h);
}

// The image's coverage filled with one flat ink colour.
function inked(img, ink, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, w, h);
  cx.globalCompositeOperation = 'source-in';
  cx.fillStyle = ink;
  cx.fillRect(0, 0, w, h);
  return c;
}

// A raster-era master is opaque ink-on-white, so it blends instead of covering:
// multiply keeps its dark ink on light paper; on dark paper invert(1) turns the
// ink white and screen drops the inverted, now black, background.
function drawRasterLineArt(ctx, lineArt, theme, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = BLEND[theme];
  if (INVERT[theme]) ctx.filter = 'invert(1)';
  ctx.drawImage(lineArt.img, 0, 0, w, h);
  ctx.restore();
}

// The app's themed overlay swap: the pen on light paper, the chalk on dark, and
// the pen again on dark when the page has no chalk.
function lineArtLayer(cell, theme, imgs) {
  if (theme === 'dark' && imgs.chalk) {
    return { img: imgs.chalk, kind: cell.chalkKind, role: 'chalk' };
  }
  if (!imgs.lineArt) return null;
  return { img: imgs.lineArt, kind: cell.lineArtKind, role: 'pen' };
}

// A tile is one themed half of a pair — its theme is fixed (light or dark);
// only its view changes.
function render(tile) {
  const { canvas, theme, imgs, lineArt } = tile;
  const view = tile.view || gView;
  const fill = theme === 'dark' ? imgs.night : imgs.light;
  const ref = fill || lineArt?.img || imgs.light || imgs.night;
  if (!ref) {
    return;
  }
  const [w, h] = fit(ref.naturalWidth, ref.naturalHeight);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  if (view === 'color') {
    if (fill) ctx.drawImage(fill, 0, 0, w, h);
    else {
      ctx.fillStyle = PAPER[theme];
      ctx.fillRect(0, 0, w, h);
    }
    tile.vlabel.textContent = 'color';
    return;
  }

  ctx.fillStyle = PAPER[theme];
  ctx.fillRect(0, 0, w, h);

  if (view === 'combined' && fill) {
    // Punch the lined fill so its baked-in outline doesn't double the composited
    // line art; shipped fills-only webps draw as-is (re-punching them dots a ring
    // around every line).
    if (tile.linedFill) {
      if (!tile.fills) tile.fills = buildFills(fill, lineArt, w, h);
      ctx.drawImage(tile.fills, 0, 0, w, h);
    } else {
      ctx.drawImage(fill, 0, 0, w, h);
    }
  }
  if (lineArt) drawLineArt(ctx, lineArt, theme, w, h);
  tile.vlabel.textContent = view;
}

const tiles = [];
function renderAll() {
  for (const t of tiles) render(t);
}

// Review buckets are deliberately stricter than the `KEEP_THRESHOLD` ship gate in
// lib/outline-match.mjs (not importable — this file is browser-side plain JS) — a
// page can pass the pipeline gate and still show yellow/red here.
const KEEP_GOOD = 99;
const KEEP_OK = 96;
function keepClass(keep) {
  return keep >= KEEP_GOOD ? 'good' : keep >= KEEP_OK ? 'ok' : 'warn';
}

function buildHalf(pair, cell, theme, imgsP) {
  const fig = document.createElement('figure');
  fig.className = 'half';
  const frame = document.createElement('div');
  frame.className = 'frame';
  const canvas = document.createElement('canvas');
  const vl = document.createElement('span');
  vl.className = 'vlabel';
  vl.textContent = gView;
  frame.appendChild(canvas);
  frame.appendChild(vl);
  const cap = document.createElement('figcaption');
  const chip = (cls, text) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    cap.appendChild(s);
    return s;
  };
  chip('name', cell.id + '-' + cell.orient);
  if (theme === 'light' && cell.keep != null) {
    chip('keep ' + keepClass(cell.keep), 'outline ' + cell.keep.toFixed(1) + '%');
  }
  if (theme === 'dark' && !cell.night) chip('note', 'no night fill');
  if (theme === 'dark' && !cell.chalk) chip('note', 'no chalk (inverted pen)');
  if (theme === 'dark' ? cell.nightRaw : cell.lightRaw) {
    chip('note', 'raw fill (pre-fork fallback)');
  }
  chip('pill ' + (theme === 'dark' ? 'night' : 'light'), theme === 'dark' ? 'NIGHT' : 'LIGHT');
  fig.appendChild(frame);
  fig.appendChild(cap);
  pair.appendChild(fig);

  imgsP.then(([night, lineArt, light, chalk]) => {
    // A lined fill still carries its own outline, so the combined view punches it:
    // a `--source samples` night take, or a git-mode raw-fill fallback. Light fills
    // always come from web/static, so a samples sheet's light half is shipped.
    const linedFill = theme === 'dark' ? SOURCE === 'samples' || !!cell.nightRaw : !!cell.lightRaw;
    const imgs = { night, lineArt, light, chalk };
    const tile = {
      canvas,
      theme,
      vlabel: vl,
      imgs,
      lineArt: lineArtLayer(cell, theme, imgs),
      view: null,
      linedFill,
    };
    tiles.push(tile);
    frame.addEventListener('click', () => {
      const cur = tile.view || gView;
      tile.view = VIEWS[(VIEWS.indexOf(cur) + 1) % VIEWS.length];
      render(tile);
    });
    render(tile);
  });
}

function build() {
  const root = document.getElementById('pairs');
  for (const c of CELLS) {
    const pair = document.createElement('div');
    pair.className = 'pair ' + c.orient;
    // git mode: tag each pair before/after so the old-vs-new stack reads at a glance.
    if (c.era) {
      pair.classList.add(c.era === 'current' ? 'after' : 'before');
      const tag = document.createElement('div');
      tag.className = 'era';
      tag.textContent = c.era === 'current' ? 'AFTER · current' : 'BEFORE · ' + c.era;
      pair.appendChild(tag);
    }
    root.appendChild(pair);
    const imgsP = Promise.all([load(c.night), load(c.lineArt), load(c.light), load(c.chalk)]);
    buildHalf(pair, c, 'light', imgsP);
    buildHalf(pair, c, 'dark', imgsP);
  }
}

document.getElementById('viewSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  gView = b.dataset.view;
  for (const x of e.currentTarget.children) x.classList.toggle('on', x === b);
  for (const t of tiles) t.view = null; // clear per-tile overrides
  renderAll();
});

build();
