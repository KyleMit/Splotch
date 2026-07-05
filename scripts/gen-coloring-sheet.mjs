// Builds a self-contained HTML review sheet for the colored page twins produced
// by gen-coloring-fills.mjs. Each card shows the black-and-white page; tap it to
// flip instantly to the colored version (and back) so you can eyeball that the
// fill lines up with the original outline. Both images are embedded as data URIs
// and stacked, so the A/B flip is instant with no reload flash.
//
//   npm run gen:coloring-sheet                     every colored twin found
//   npm run gen:coloring-sheet -- creatures dinosaur   just these categories
//
// Writes .coloring-samples/review-sheet.html (gitignored). Open it in a browser.
import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { join, relative, dirname, basename } from 'node:path';
import sharp from 'sharp';
import { ROOT, fail } from './lib/utils.mjs';

const COLORING_DIR = join(ROOT, 'web', 'static', 'coloring');
const OUT_DIR = join(ROOT, '.coloring-samples');
const OUT = join(OUT_DIR, 'review-sheet.html');

// Fraction of the source outline preserved in the twin, within ±TOL px — the
// same tolerant score gen-coloring-fills reports, recomputed here for display.
const MASK_W = 512;
const THRESHOLD = 110;
const TOL = 2;
async function mask(buf) {
  const { data } = await sharp(buf)
    .grayscale()
    .resize(MASK_W, MASK_W, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const m = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) m[i] = data[i] < THRESHOLD ? 1 : 0;
  return m;
}
function near(m, i, r) {
  const x = i % MASK_W;
  const y = (i / MASK_W) | 0;
  for (let dy = -r; dy <= r; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= MASK_W) continue;
    for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx;
      if (xx < 0 || xx >= MASK_W) continue;
      if (m[yy * MASK_W + xx]) return true;
    }
  }
  return false;
}
async function outlineKeep(sourceBuf, coloredBuf) {
  const s = await mask(sourceBuf);
  const f = await mask(coloredBuf);
  let sc = 0;
  let cov = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i]) {
      sc++;
      if (near(f, i, TOL)) cov++;
    }
  }
  return sc ? (cov / sc) * 100 : 0;
}

const { positionals } = parseArgs({ allowPositionals: true });

// Find every X.color.webp, optionally limited to the given category dirs.
async function pairs() {
  const roots = positionals.length ? positionals : [''];
  const found = [];
  for (const root of roots) {
    const cwd = root ? join(COLORING_DIR, root) : COLORING_DIR;
    for await (const entry of glob('**/*.color.webp', { cwd })) {
      const colored = join(cwd, entry);
      const source = colored.replace(/\.color\.webp$/, '.webp');
      found.push({ colored, source });
    }
  }
  return found.sort((a, b) => a.source.localeCompare(b.source));
}

const list = await pairs();
if (!list.length) fail('No *.color.webp twins found. Run gen:coloring-fills first.');

const uri = async (p) => `data:image/webp;base64,${(await readFile(p)).toString('base64')}`;

// Group cards by category (top-level dir under coloring/).
const groups = new Map();
let lowest = 100;
for (const { source, colored } of list) {
  const rel = relative(COLORING_DIR, source);
  const category = rel.split('/')[0];
  const name = basename(source, '.webp');
  const orient = name.endsWith('-tall') ? 'tall' : 'wide';
  const keep = await outlineKeep(await readFile(source), await readFile(colored));
  lowest = Math.min(lowest, keep);
  const card = `
      <figure class="card ${orient}" tabindex="0" data-state="bw" aria-label="${name}, showing outline. Tap to flip.">
        <div class="frame">
          <img class="bw" src="${await uri(source)}" alt="${name} outline" />
          <img class="col" src="${await uri(colored)}" alt="${name} colored" />
          <span class="flip">tap to flip</span>
        </div>
        <figcaption>
          <span class="name">${name}</span>
          <span class="keep ${keep >= 99 ? 'good' : keep >= 96 ? 'ok' : 'warn'}">outline ${keep.toFixed(1)}%</span>
        </figcaption>
      </figure>`;
  if (!groups.has(category)) groups.set(category, []);
  groups.get(category).push(card);
}

const sections = [...groups.entries()]
  .map(
    ([cat, cards]) => `
    <section class="cat">
      <h2>${cat} <span class="count">${cards.length}</span></h2>
      <div class="grid">${cards.join('')}</div>
    </section>`
  )
  .join('');

const html = `<title>Coloring twins — tap to verify overlap</title>
<style>
  :root {
    --paper:#f7f5f0; --card:#fff; --ink:#24222b; --muted:#6c6875; --hair:#e4e0d7;
    --c-blue:#62a2e9; --c-green:#8cc864; --c-purple:#ab71e1;
    --c-red:#ec534e; --c-orange:#f89c45; --c-yellow:#f9d24f;
    --shadow:0 1px 2px rgba(30,28,40,.06), 0 8px 24px rgba(30,28,40,.07);
  }
  @media (prefers-color-scheme: dark) {
    :root { --paper:#17161b; --card:#201f26; --ink:#ecebf0; --muted:#a29eab; --hair:#322f3a;
      --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.35); }
  }
  :root[data-theme="light"] { --paper:#f7f5f0; --card:#fff; --ink:#24222b; --muted:#6c6875; --hair:#e4e0d7;
    --shadow:0 1px 2px rgba(30,28,40,.06), 0 8px 24px rgba(30,28,40,.07); }
  :root[data-theme="dark"] { --paper:#17161b; --card:#201f26; --ink:#ecebf0; --muted:#a29eab; --hair:#322f3a;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.35); }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink);
    font-family:ui-rounded,"SF Pro Rounded",system-ui,-apple-system,"Segoe UI",sans-serif; line-height:1.5; }
  .wrap { max-width:1180px; margin:0 auto; padding:clamp(20px,4vw,48px); }
  .crayons { display:flex; gap:6px; margin-bottom:16px; }
  .crayons span { width:26px; height:8px; border-radius:99px; }
  h1 { font-size:clamp(1.7rem,3.6vw,2.4rem); margin:0 0 6px; letter-spacing:-.02em; text-wrap:balance; }
  .lede { color:var(--muted); max-width:64ch; margin:0 0 4px; }
  .lede b { color:var(--ink); font-weight:650; }
  .cat { margin-top:clamp(30px,5vw,52px); }
  .cat h2 { font-size:1.35rem; margin:0 0 18px; text-transform:capitalize; letter-spacing:-.01em;
    padding-bottom:12px; border-bottom:1px solid var(--hair); display:flex; align-items:center; gap:10px; }
  .count { font-size:.8rem; color:var(--muted); background:color-mix(in srgb,var(--c-blue) 14%,transparent);
    padding:2px 9px; border-radius:99px; font-weight:600; }
  .grid { display:grid; gap:clamp(16px,2.2vw,24px); grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); }
  figure { margin:0; }
  .card { cursor:pointer; -webkit-tap-highlight-color:transparent; }
  .card:focus-visible { outline:3px solid var(--c-blue); outline-offset:4px; border-radius:16px; }
  .frame { position:relative; background:#fff; border:1px solid var(--hair); border-radius:14px;
    overflow:hidden; box-shadow:var(--shadow); aspect-ratio:3/2; }
  .card.tall .frame { aspect-ratio:2/3; }
  .frame img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block; }
  .frame .col { opacity:0; }
  .card[data-state="color"] .frame .col { opacity:1; }
  .flip { position:absolute; left:8px; bottom:8px; font-size:.66rem; letter-spacing:.06em; text-transform:uppercase;
    background:rgba(20,18,26,.6); color:#fff; padding:3px 8px; border-radius:99px; backdrop-filter:blur(4px);
    transition:opacity .15s; }
  .card[data-state="color"] .flip { background:color-mix(in srgb,var(--c-green) 88%,#000); }
  .card:hover .flip { opacity:.4; }
  figcaption { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-top:9px; }
  .name { font-weight:600; font-size:.92rem; font-variant-numeric:tabular-nums; }
  .keep { font-size:.72rem; padding:2px 8px; border-radius:99px; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .keep.good { background:color-mix(in srgb,var(--c-green) 18%,transparent); color:color-mix(in srgb,var(--c-green) 80%,var(--ink)); }
  .keep.ok { background:color-mix(in srgb,var(--c-yellow) 22%,transparent); color:color-mix(in srgb,var(--c-orange) 78%,var(--ink)); }
  .keep.warn { background:color-mix(in srgb,var(--c-red) 18%,transparent); color:color-mix(in srgb,var(--c-red) 82%,var(--ink)); }
  footer { margin-top:44px; padding-top:20px; border-top:1px solid var(--hair); color:var(--muted); font-size:.85rem; }
  code { background:color-mix(in srgb,var(--c-blue) 12%,transparent); padding:1px 6px; border-radius:6px; font-size:.85em; }
</style>

<div class="wrap">
  <header>
    <div class="crayons">
      <span style="background:var(--c-red)"></span><span style="background:var(--c-orange)"></span>
      <span style="background:var(--c-yellow)"></span><span style="background:var(--c-green)"></span>
      <span style="background:var(--c-blue)"></span><span style="background:var(--c-purple)"></span>
    </div>
    <h1>Colored twins — tap to verify the overlap</h1>
    <p class="lede">Each card shows the black-and-white page. <b>Tap (or focus + Enter)</b> to flip instantly to
    the colored version and back — the outline should sit exactly where it was, with color only filling the
    white space. <b>outline %</b> is how much of the original line art the fill preserves.</p>
    <p class="lede">Lowest in this set: <b>${lowest.toFixed(1)}%</b> · ${list.length} pages.</p>
  </header>
  ${sections}
  <footer>Generated with <code>npm run gen:coloring-sheet</code> · tap flips B&amp;W ⇄ colored.</footer>
</div>

<script>
  for (const card of document.querySelectorAll('.card')) {
    const toggle = () => {
      card.dataset.state = card.dataset.state === 'color' ? 'bw' : 'color';
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  }
</script>`;

await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT, html);
console.log(`Wrote ${relative(ROOT, OUT)} (${(html.length / 1024 / 1024).toFixed(1)} MB, ${list.length} pages).`);
