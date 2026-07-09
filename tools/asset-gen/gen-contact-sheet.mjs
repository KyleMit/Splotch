// Build a self-contained HTML contact sheet of the coloring twins for one or
// more categories, so they can be reviewed in a browser / published as an
// Artifact. Covers both the dark "night" twins and the light `.color.webp`
// twins (toggle in the sheet). Images are embedded as base64 data URIs (no
// external file refs), so the page renders anywhere — including the Artifact
// sandbox, whose CSP blocks linking to local files.
//
//   node --experimental-strip-types --disable-warning=ExperimentalWarning \
//     tools/asset-gen/gen-contact-sheet.mjs <target...> [--source samples|shipped]
//       [--theme dark|light] [--out FILE]
//
//   <target>          a whole category ("nature") OR a single page/cell to focus
//                     the sheet on: "nature/ant" (both orientations) or
//                     "nature/ant-wide" (one cell). Mix freely.
//   --source samples  (default) read fresh takes from .coloring-samples-dark/
//   --source shipped  read the live assets from web/static/coloring/*.night.webp
//   --theme dark      (default) open in dark; --theme light opens the light-twin
//                     review (the .color.webp under black lines — the magic-brush look)
//   --out FILE        output path (default .coloring-samples-dark/contact-sheet.html)
//
// Each cell embeds THREE layers so the sheet can reproduce what a child actually
// sees, not just the raw generated twin:
//   • color   — the generated colored twin alone (night twin in dark, light
//               `.color.webp` twin in light).
//   • outline — the page line art rendered as the canvas renders it (white
//               "chalk" on dark paper in dark mode; black lines on light paper
//               in light mode).
//   • combined — the real canvas composite: the fills-only twin (its own
//               outlines punched with the line art as a mask, exactly like
//               magicBrush.buildFillsSheet) under the line-art layer, over the
//               paper. This is the view to trust when judging a twin — a bug
//               like blown-out eyes only shows once the layers are merged.
// A per-tile tap cycles color → outline → combined; a top toolbar sets the view
// for every tile and toggles light/dark (defaulting to dark, the mode we debug).
// The compositing mirrors DrawingCanvas.svelte + magicBrush.ts (ADR-0043/0052).
//
// Page IDs come from the real catalog (books.ts), so the sheet always matches
// what will ship. Missing images are shown as a placeholder, not a crash.
import { parseArgs } from 'node:util';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { COLORING_DIR, SAMPLES_DARK_DIR, fail } from './lib/paths.mjs';
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
if (!positionals.length) fail('give one or more targets, e.g. "farm" or "nature/ant-wide"');

// A target is a whole category ("nature") or a page/cell filter ("nature/ant",
// "nature/ant-wide"). Split them: bare ids expand to the whole book, slashed ids
// keep only the matching page (or page+orientation) of their category.
const categories = new Set(positionals.filter((p) => !p.includes('/')));
const pageFilters = positionals.filter((p) => p.includes('/'));
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
const lineArtPath = (cat, id, orient) => join(staticDir, cat, `${id}-${orient}.webp`);
const lightPath = (cat, id, orient) => join(staticDir, cat, `${id}-${orient}.color.webp`);

function dataUri(p) {
  if (!existsSync(p)) return null;
  return `data:image/webp;base64,${readFileSync(p).toString('base64')}`;
}

const cells = [];
let counts = [];
const catIds = BOOKS.map((b) => b.id).filter(wantsCategory);
for (const named of positionals) {
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

const CELLS_JSON = JSON.stringify(cells);

const html = `<title>Splotch contact sheet — ${source}${counts.length ? ` · ${counts.join(', ')}` : ''}</title>
<style>
  :root{
    --render-max:520px;
    --ground:#131019;--panel:#1c1826;--border:#322b45;--text:#ece9f3;--muted:#9c96ac;--accent:#f0c674;
    --tileground:#0f0d15;
  }
  :root[data-ui="light"]{
    --ground:#f4f2ee;--panel:#ffffff;--border:#e0dcd4;--text:#221f29;--muted:#6b6577;--accent:#b1780a;
    --tileground:#eceae4;
  }
  *{box-sizing:border-box}body{margin:0}
  .wrap{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--ground);color:var(--text);min-height:100vh;padding:0 clamp(16px,4vw,56px) 72px;line-height:1.5;transition:background .15s,color .15s}
  header.bar{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--ground) 88%,transparent);backdrop-filter:blur(8px);padding:16px 0 12px;margin-bottom:8px;border-bottom:1px solid var(--border)}
  h1{font-size:clamp(20px,3vw,28px);margin:0 0 4px;letter-spacing:-.01em}
  .sub{color:var(--muted);margin:0 0 12px;max-width:74ch;font-size:13px}
  .accent{color:var(--accent)}
  .controls{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center}
  .seg{display:inline-flex;border:1px solid var(--border);border-radius:999px;overflow:hidden}
  .seg button{appearance:none;border:0;background:transparent;color:var(--muted);font:inherit;font-size:13px;padding:6px 14px;cursor:pointer}
  .seg button.on{background:var(--accent);color:#1a1206;font-weight:600}
  .seg-label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-right:2px}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:600;margin:36px 0 16px;padding-bottom:8px;border-bottom:1px solid var(--border)}
  .cat-id{opacity:.5;font-weight:400;text-transform:none;letter-spacing:0}
  .grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
  figure.cell{margin:0;position:relative;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:10px;cursor:pointer}
  .frame{position:relative;border-radius:8px;overflow:hidden;background:var(--tileground)}
  .cell canvas{width:100%;display:block}
  .olabel{position:absolute;top:8px;left:8px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#ece9f3;background:rgba(10,8,14,.66);padding:2px 7px;border-radius:999px;pointer-events:none}
  .vlabel{position:absolute;top:8px;right:8px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#1a1206;background:var(--accent);padding:2px 7px;border-radius:999px;pointer-events:none;font-weight:600}
  figcaption{font-size:13px;color:var(--muted);margin-top:8px;text-align:center}
  .missing{aspect-ratio:2/3;display:flex;align-items:center;justify-content:center;text-align:center;color:#c98;border:1px dashed var(--border);border-radius:8px;font-size:12px}
  .hint{font-size:11px;color:var(--muted);margin:2px 0 0}
</style>
<div class="wrap">
  <header class="bar">
    <h1>Coloring twins &mdash; <span class="accent">${source}</span> contact sheet</h1>
    <p class="sub">Categories: ${counts.join(' · ')}. <strong>Combined</strong> reproduces the real canvas: fills-only twin under the themed line-art layer over the paper (magicBrush.buildFillsSheet + DrawingCanvas compositing). Judge twins here — blown-out or black-on-black eyes only show once the layers merge. Tap any tile to cycle its own view.</p>
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
<script>
const CELLS = ${CELLS_JSON};
const RENDER_MAX = 520;
const OUTLINE_LUMA = 150; // magicBrush.OUTLINE_LUMA_THRESHOLD
const PAPER = { dark:'#211f29', light:'#fcfbf8' };
const BLEND = { dark:'screen', light:'multiply' };
const INVERT = { dark:true, light:false };
const VIEWS = ['color','outline','combined'];

let gTheme = ${JSON.stringify(theme)};
let gView = 'combined';

// Decode a data URI into an <img>, or null.
function load(uri){
  return new Promise((res)=>{
    if(!uri){res(null);return;}
    const im = new Image();
    im.onload=()=>res(im); im.onerror=()=>res(null); im.src=uri;
  });
}

// Fit long edge to RENDER_MAX, keep aspect.
function fit(w,h){ const s=Math.min(1, RENDER_MAX/Math.max(w,h)); return [Math.round(w*s), Math.round(h*s)]; }

// Fills-only twin: punch the twin's own outline pixels using the line art as a
// mask (luma<OUTLINE_LUMA -> transparent) — mirrors magicBrush.buildFillsSheet.
function buildFills(twin, lineArt, w, h){
  const fc=document.createElement('canvas'); fc.width=w; fc.height=h;
  const fx=fc.getContext('2d'); fx.drawImage(twin,0,0,w,h);
  if(lineArt){
    const mc=document.createElement('canvas'); mc.width=w; mc.height=h;
    const mx=mc.getContext('2d',{willReadFrequently:true}); mx.drawImage(lineArt,0,0,w,h);
    const px=mx.getImageData(0,0,w,h), d=px.data;
    for(let i=0;i<d.length;i+=4){ const l=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; d[i+3]= l<OUTLINE_LUMA?255:0; }
    mx.putImageData(px,0,0);
    fx.globalCompositeOperation='destination-out'; fx.drawImage(mc,0,0); fx.globalCompositeOperation='source-over';
  }
  return fc;
}

// Draw the line-art layer the way DrawingCanvas does: invert(1) in dark so black
// lines become white, then blend (screen dark / multiply light) over the paper.
function drawLineArt(ctx, lineArt, theme, w, h){
  ctx.save();
  ctx.globalCompositeOperation = BLEND[theme];
  if(INVERT[theme]) ctx.filter = 'invert(1)';
  ctx.drawImage(lineArt,0,0,w,h);
  ctx.restore();
}

function render(tile){
  const { canvas, imgs } = tile;
  const theme = gTheme;
  const view = tile.view || gView;
  const twin = theme==='dark' ? imgs.night : imgs.light;
  const ref = twin || imgs.lineArt || imgs.light || imgs.night;
  if(!ref){ return; }
  const [w,h] = fit(ref.naturalWidth, ref.naturalHeight);
  canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,w,h);

  if(view==='color'){
    if(twin) ctx.drawImage(twin,0,0,w,h);
    else { ctx.fillStyle=PAPER[theme]; ctx.fillRect(0,0,w,h); }
    tile.vlabel.textContent='color';
    return;
  }

  ctx.fillStyle=PAPER[theme]; ctx.fillRect(0,0,w,h);

  if(view==='combined' && twin){
    const key = theme;
    if(!tile.fills) tile.fills={};
    if(!tile.fills[key]) tile.fills[key]=buildFills(twin, imgs.lineArt, w, h);
    ctx.drawImage(tile.fills[key],0,0,w,h);
  }
  if(imgs.lineArt) drawLineArt(ctx, imgs.lineArt, theme, w, h);
  tile.vlabel.textContent=view;
}

const tiles=[];
function renderAll(){ for(const t of tiles) render(t); }

async function build(){
  document.documentElement.dataset.ui = gTheme;
  const secEl = document.getElementById('sections');
  // Group cells by category, preserving order.
  const groups=[];
  for(const c of CELLS){
    let g=groups.find(x=>x.cat===c.cat);
    if(!g){ g={cat:c.cat, cells:[]}; groups.push(g); }
    g.cells.push(c);
  }
  for(const g of groups){
    const h2=document.createElement('h2');
    h2.innerHTML = g.cat.charAt(0).toUpperCase()+g.cat.slice(1)+' <span class="cat-id">'+g.cat+'</span>';
    secEl.appendChild(h2);
    const grid=document.createElement('div'); grid.className='grid'; secEl.appendChild(grid);
    for(const c of g.cells){
      const fig=document.createElement('figure'); fig.className='cell';
      const missing = !c.night && !c.light && !c.lineArt;
      if(missing){
        fig.innerHTML='<div class="missing">missing<br>'+c.id+'-'+c.orient+'</div><figcaption>'+c.name+'</figcaption>';
        grid.appendChild(fig); continue;
      }
      const frame=document.createElement('div'); frame.className='frame';
      const canvas=document.createElement('canvas');
      const ol=document.createElement('span'); ol.className='olabel'; ol.textContent=c.orient;
      const vl=document.createElement('span'); vl.className='vlabel'; vl.textContent=gView;
      frame.appendChild(canvas); frame.appendChild(ol); frame.appendChild(vl);
      const cap=document.createElement('figcaption'); cap.textContent=c.name + (c.night?'':' (no night twin)');
      fig.appendChild(frame); fig.appendChild(cap);
      grid.appendChild(fig);
      const [night,lineArt,light]=await Promise.all([load(c.night),load(c.lineArt),load(c.light)]);
      const tile={ canvas, vlabel:vl, imgs:{night,lineArt,light}, view:null, cat:c.cat };
      tiles.push(tile);
      fig.addEventListener('click',()=>{
        const cur = tile.view || gView;
        tile.view = VIEWS[(VIEWS.indexOf(cur)+1)%VIEWS.length];
        render(tile);
      });
      render(tile);
    }
  }
}

document.getElementById('themeSeg').addEventListener('click',(e)=>{
  const b=e.target.closest('button'); if(!b) return;
  gTheme=b.dataset.theme;
  for(const x of e.currentTarget.children) x.classList.toggle('on', x===b);
  document.documentElement.dataset.ui=gTheme;
  renderAll();
});
document.getElementById('viewSeg').addEventListener('click',(e)=>{
  const b=e.target.closest('button'); if(!b) return;
  gView=b.dataset.view;
  for(const x of e.currentTarget.children) x.classList.toggle('on', x===b);
  for(const t of tiles) t.view=null; // clear per-tile overrides
  renderAll();
});

build();
</script>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(
  `wrote ${OUT}  (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB, source=${source}, ${cells.length} cells)`
);
