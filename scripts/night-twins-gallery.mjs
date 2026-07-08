// Build a self-contained HTML contact sheet of night twins for one or more
// coloring categories, so they can be reviewed in a browser / published as an
// Artifact. Images are embedded as base64 data URIs (no external file refs), so
// the page renders anywhere — including the Artifact sandbox, whose CSP blocks
// linking to local files.
//
//   node --experimental-strip-types --disable-warning=ExperimentalWarning \
//     scripts/night-twins-gallery.mjs <category...> [--source samples|shipped] [--out FILE]
//
//   --source samples  (default) read fresh takes from .coloring-samples-dark/
//   --source shipped  read the live assets from web/static/coloring/*.night.webp
//   --out FILE        output path (default .coloring-samples-dark/night-gallery.html)
//
// Page IDs come from the real catalog (books.ts), so the sheet always matches
// what will ship. Missing images are shown as a placeholder, not a crash.
import { parseArgs } from 'node:util';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT, fail } from './lib/utils.mjs';
import { BOOKS } from '../web/src/lib/state/books.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string' },
    out: { type: 'string' },
  },
});
const source = values.source ?? 'samples';
if (!['samples', 'shipped'].includes(source)) fail('--source must be samples or shipped');
if (!positionals.length) fail('give one or more category ids, e.g. "farm dinosaur"');

const OUT = values.out ?? join(ROOT, '.coloring-samples-dark', 'night-gallery.html');

// samples: .coloring-samples-dark/{cat}/{id}-{orient}.webp
// shipped: web/static/coloring/{cat}/{id}-{orient}.night.webp
function twinPath(cat, id, orient) {
  return source === 'samples'
    ? join(ROOT, '.coloring-samples-dark', cat, `${id}-${orient}.webp`)
    : join(ROOT, 'web', 'static', 'coloring', cat, `${id}-${orient}.night.webp`);
}
function dataUri(p) {
  if (!existsSync(p)) return null;
  return `data:image/webp;base64,${readFileSync(p).toString('base64')}`;
}

const cell = (cat, id, name, orient) => {
  const uri = dataUri(twinPath(cat, id, orient));
  const inner = uri
    ? `<img src="${uri}" alt="${id} ${orient}" loading="lazy">`
    : `<div class="missing">missing<br>${id}-${orient}</div>`;
  return `<figure class="cell ${orient}"><span class="olabel">${orient}</span>${inner}<figcaption>${name}</figcaption></figure>`;
};

let sections = '';
let counts = [];
for (const catId of positionals) {
  const book = BOOKS.find((b) => b.id === catId);
  if (!book) {
    console.warn(`(skip) no book "${catId}"`);
    continue;
  }
  const cells = book.pages
    .map((p) => `${cell(catId, p.id, p.name, 'tall')}${cell(catId, p.id, p.name, 'wide')}`)
    .join('');
  sections += `<h2>${book.name} <span class="cat-id">${catId}</span></h2><div class="grid">${cells}</div>`;
  counts.push(`${book.name} (${book.pages.length})`);
}

const html = `<style>
  :root{--ground:#131019;--panel:#1c1826;--panel2:#241f31;--border:#322b45;--text:#ece9f3;--muted:#9c96ac;--accent:#f0c674;}
  *{box-sizing:border-box}body{margin:0}
  .wrap{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--ground);color:var(--text);min-height:100vh;padding:40px clamp(16px,4vw,56px) 72px;line-height:1.5}
  h1{font-size:clamp(24px,3.4vw,32px);margin:0 0 8px;letter-spacing:-.01em}
  .sub{color:var(--muted);margin:0 0 8px;max-width:64ch}
  .accent{color:var(--accent)}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:600;margin:44px 0 16px;padding-bottom:8px;border-bottom:1px solid var(--border)}
  .cat-id{opacity:.5;font-weight:400;text-transform:none;letter-spacing:0}
  .grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
  .cell{margin:0;position:relative;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:10px}
  .cell img{width:100%;display:block;border-radius:8px;background:var(--panel2)}
  .cell.tall img{aspect-ratio:2/3;object-fit:cover}
  .cell.wide img{aspect-ratio:3/2;object-fit:cover}
  .olabel{position:absolute;top:16px;left:16px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);background:rgba(20,17,26,.72);padding:2px 7px;border-radius:999px}
  figcaption{font-size:13px;color:var(--muted);margin-top:8px;text-align:center}
  .missing{aspect-ratio:2/3;display:flex;align-items:center;justify-content:center;text-align:center;color:#c98;border:1px dashed var(--border);border-radius:8px;font-size:12px}
</style>
<div class="wrap">
  <h1>Night twins &mdash; <span class="accent">${source}</span> review</h1>
  <p class="sub">Categories: ${counts.join(' · ')}. Each page shows its portrait + landscape night twin. Check for: a genuine night/evening background (no daytime sky-blue), natural face/skin/animal colors (no ghostly grey), and no invented shapes.</p>
  ${sections}
</div>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(
  `wrote ${OUT}  (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB, source=${source})`
);
