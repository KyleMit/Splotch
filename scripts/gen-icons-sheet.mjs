// Builds the icon-gallery scrapbook page (ADR-0059): every icon shipped in the
// app, rendered at size and split into the colorful "spot" illustrations and the
// monochrome UI glyphs. Self-contained HTML (SVGs inlined) so it renders live on
// GitHub Pages and via the Artifact tool.
//
//   node scripts/gen-icons-sheet.mjs [--out FILE]
//
// Classification is by chroma: an icon is "spot" if it paints any genuinely
// saturated hue (a fixed color that does not follow the theme); otherwise it is
// "plain" — currentColor, near-black (#1f1f1f), white, or grey — and follows the
// text color. Plain icons get their hardcoded ink rewritten to currentColor for
// the gallery copy only, so they stay legible in both light and dark.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/utils.mjs';
import { esc, chromeStyle, masthead, siteFooter } from './lib/scrapbook-chrome.mjs';

const ICONS_DIR = join(ROOT, 'web/src/lib/icons');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT =
  outIdx !== -1 && args[outIdx + 1]
    ? args[outIdx + 1]
    : join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '.scrapbook-scratch',
        'icons',
        'index.html'
      );

// #rgb / #rrggbb (with optional alpha) -> {s, l} in 0..1. Returns null for the
// grey axis (r==g==b) so pure black/white/grey never register as a hue.
function chroma(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = h.replace(/./g, (c) => c + c);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

// An icon is colorful when it paints at least one saturated, mid-range hue.
function isSpot(svg) {
  const hexes = svg.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  return hexes.some((hx) => {
    const c = chroma(hx);
    return c.s >= 0.35 && c.l >= 0.14 && c.l <= 0.93;
  });
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The concrete fill/stroke colors an SVG paints, as lowercased tokens — hex or
// the `white`/`black` keywords — ignoring `none`/`transparent`/`currentColor`
// and any color tucked inside a `var(...)` fallback (those stay theme-driven).
function inkColors(svg) {
  const set = new Set();
  for (const m of svg.matchAll(/(?:fill|stroke)\s*[:=]\s*"?\s*(#[0-9a-fA-F]{3,8}|white|black)\b/gi))
    set.add(m[1].toLowerCase());
  return set;
}

// Inline-ready copy: strip the root width/height (CSS sizes it, viewBox scales)
// and tag it. A plain glyph painted in a SINGLE ink color — whatever that color
// is (black `#1f1f1f`, or a white Material export like trash.svg) — has that one
// ink remapped to currentColor so it follows the theme and stays legible on the
// card. Two-tone plain icons (e.g. the grey eraser-size rings) keep their colors.
function inlineSvg(svg, spot) {
  let out = svg.replace(/<svg\b[^>]*>/, (tag) => {
    let t = tag.replace(/\s(width|height)="[^"]*"/g, '');
    if (/\sclass="/.test(t)) t = t.replace(/\sclass="/, ' class="ic ');
    else t = t.replace(/<svg\b/, '<svg class="ic"');
    return t;
  });
  if (!spot) {
    const inks = inkColors(out);
    if (inks.size === 1) {
      const ink = escapeRe([...inks][0]);
      out = out
        .replace(new RegExp(`((?:fill|stroke)\\s*=\\s*")${ink}(")`, 'gi'), '$1currentColor$2')
        .replace(new RegExp(`((?:fill|stroke)\\s*:\\s*)${ink}\\b`, 'gi'), '$1currentColor');
    }
  }
  return out;
}

const files = readdirSync(ICONS_DIR)
  .filter((f) => f.endsWith('.svg'))
  .sort();

const spot = [];
const plain = [];
for (const file of files) {
  const svg = readFileSync(join(ICONS_DIR, file), 'utf8');
  const name = file.replace(/\.svg$/, '');
  const entry = { name, html: inlineSvg(svg, isSpot(svg)) };
  (isSpot(svg) ? spot : plain).push(entry);
}

const tile = (it) => `<figure class="tile">
      <div class="art">${it.html}</div>
      <figcaption>${esc(it.name)}</figcaption>
    </figure>`;

const section = (id, title, blurb, items) => `<div class="section-head">
      <h2 id="${id}">${esc(title)}</h2>
    </div>
    <p class="lead">${esc(blurb)}</p>
    <div class="tile-grid">
      ${items.map(tile).join('\n      ')}
    </div>`;

const EXTRA_CSS = `
.lead{max-width:70ch;color:var(--muted);margin:0 0 18px}
.tile-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:14px}
.tile{margin:0;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);overflow:hidden;box-shadow:var(--shadow-sm);transition:transform .12s ease,box-shadow .12s ease,border-color .12s}
.tile:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);border-color:var(--hair-strong)}
.tile .art{display:grid;place-items:center;height:92px;padding:14px;background:linear-gradient(180deg,var(--card),var(--card-2));color:var(--ink)}
.tile .art .ic{width:auto;height:auto;max-width:52px;max-height:52px;display:block}
.tile figcaption{font-size:.72rem;color:var(--muted);text-align:center;padding:8px 6px;min-height:3.1em;display:flex;align-items:center;justify-content:center;border-top:1px solid var(--hair);word-break:break-word;font-variant-numeric:tabular-nums;background:var(--card)}
.jump{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
@media (max-width:560px){.tile-grid{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}}
`;

const tagline =
  `Every icon shipped in the app, rendered at size. The <b>spot</b> icons are fixed-color ` +
  `illustrations; the <b>plain</b> glyphs are monochrome and follow the current text color. ` +
  `Source lives in <code>web/src/lib/icons/</code>.`;

const stats =
  `<span class="chip accent"><b>${files.length}</b> icons</span>` +
  `<span class="chip"><b>${spot.length}</b> spot</span>` +
  `<span class="chip"><b>${plain.length}</b> plain</span>`;

const body = `${masthead({
  title: 'Icon gallery',
  tagline,
  home: '../index.html',
  crumbs: [{ label: 'Scrapbook', href: '../index.html' }, { label: 'Icon gallery' }],
  stats,
})}
<main>
  <div class="shell">
    ${section('spot', 'Colorful · spot icons', 'Multi-color illustrations with fixed palettes — the playful, toy-like icons a toddler taps. These do not adapt to light/dark; they render the same in every theme.', spot)}
    ${section('plain', 'Plain · UI glyphs', 'Monochrome interface icons that inherit the current text color, so they read correctly in both light and dark. Shown here recolored to the page ink.', plain)}
  </div>
</main>
${siteFooter({ home: '../index.html' })}`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Splotch icons — ${files.length} icons</title>
${chromeStyle(EXTRA_CSS)}
</head>
<body>
${body}
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(
  `wrote ${OUT}  (${files.length} icons: ${spot.length} spot, ${plain.length} plain, ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`
);
