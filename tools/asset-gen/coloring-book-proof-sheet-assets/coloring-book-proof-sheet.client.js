// Client runtime for the coloring-book proof sheet. The generator injects the cell
// data as `window.__COLORING_BOOK_PROOF_SHEET__` (a JSON blob) ahead of this script,
// so nothing here is string-interpolated at build time — this file is plain, lintable
// JS that reads its inputs from that global. See ../docs/coloring-book-proof-sheet.md
// for the layer model.
const { cells: CELLS, source: SOURCE } = window.__COLORING_BOOK_PROOF_SHEET__;
const RENDER_MAX = 640;
const OUTLINE_LUMA = 150; // asset-gen's punch threshold (lib/punch-fill.mjs)
const PAPER = { dark: '#211f29', light: '#fcfbf8' };
const BLEND = { dark: 'screen', light: 'multiply' };
const INVERT = { dark: true, light: false };
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

// Fills-only fill for `--source samples` ONLY: fresh Gemini takes still carry
// their outlines, so punch them with the line art as a mask (luma<OUTLINE_LUMA
// -> transparent), approximating the punch asset-gen bakes into shipped fills
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

// A tile is one themed half of a pair — its theme is fixed (light or dark);
// only its view changes. The dark half's line art is the CHALK outline
// (ink-on-white, same polarity as the pen) where the page has one, falling
// back to the pen — matching DrawingCanvas's themed overlay swap.
function render(tile) {
  const { canvas, theme, imgs } = tile;
  const view = tile.view || gView;
  const fill = theme === 'dark' ? imgs.night : imgs.light;
  const lineArt = theme === 'dark' ? imgs.chalk || imgs.lineArt : imgs.lineArt;
  const ref = fill || lineArt || imgs.light || imgs.night;
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
    // Punch the lined fill (samples take, or a git-mode raw-fill fallback) so its
    // baked-in outline doesn't double the composited line art; shipped fills-only
    // webps draw as-is (re-punching them dots a ring around every line).
    if (SOURCE === 'samples' || tile.rawFill) {
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

function keepClass(keep) {
  return keep >= 99 ? 'good' : keep >= 96 ? 'ok' : 'warn';
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
  const nm = document.createElement('span');
  nm.className = 'name';
  nm.textContent = cell.id + '-' + cell.orient;
  cap.appendChild(nm);
  if (theme === 'light' && cell.keep != null) {
    const k = document.createElement('span');
    k.className = 'keep ' + keepClass(cell.keep);
    k.textContent = 'outline ' + cell.keep.toFixed(1) + '%';
    cap.appendChild(k);
  }
  if (theme === 'dark' && !cell.night) {
    const note = document.createElement('span');
    note.className = 'note';
    note.textContent = 'no night fill';
    cap.appendChild(note);
  }
  if (theme === 'dark' && !cell.chalk) {
    const note = document.createElement('span');
    note.className = 'note';
    note.textContent = 'no chalk (inverted pen)';
    cap.appendChild(note);
  }
  if (theme === 'dark' ? cell.nightRaw : cell.lightRaw) {
    const note = document.createElement('span');
    note.className = 'note';
    note.textContent = 'raw fill (pre-fork fallback)';
    cap.appendChild(note);
  }
  const pill = document.createElement('span');
  pill.className = 'pill ' + (theme === 'dark' ? 'night' : 'light');
  pill.textContent = theme === 'dark' ? 'NIGHT' : 'LIGHT';
  cap.appendChild(pill);
  fig.appendChild(frame);
  fig.appendChild(cap);
  pair.appendChild(fig);

  imgsP.then(([night, lineArt, light, chalk]) => {
    // A raw-fill half still carries its own outline, so it must be punched in the
    // combined view (like a fresh sample take) rather than drawn as-is.
    const rawFill = theme === 'dark' ? !!cell.nightRaw : !!cell.lightRaw;
    const tile = {
      canvas,
      theme,
      vlabel: vl,
      imgs: { night, lineArt, light, chalk },
      view: null,
      rawFill,
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
