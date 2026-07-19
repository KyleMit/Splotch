// Builds the landing page for the committed /artifacts tree (ADR-0059). Pure:
// scans the directory, returns an HTML string — the publish script and the
// artifacts:index script both call this. No network, no build step; GitHub Pages
// serves the result as-is (.nojekyll).
//
// The page is a curated card grid: each artifact "type" (top-level folder) that
// the registry below knows about becomes a card linking to its entry page; any
// unknown type falls back to a plain list of its HTML pages so nothing published
// ever goes missing from the index. The look comes from the shared chrome in
// ./artifact-chrome.mjs.

import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './utils.mjs';
import { esc, chromeStyle, masthead, siteFooter } from './artifact-chrome.mjs';

// Not artifacts — the index's own scaffolding.
const SCAFFOLDING = new Set(['index.html', 'README.md', '.nojekyll', '.gitkeep']);

const ICONS_DIR = join(ROOT, 'web/src/lib/icons');

// Inline one of the app's own icons (its real design language, not an emoji),
// stripping the root width/height so CSS sizes it. Colors are kept as-is for the
// colorful spot icons.
function inlineIcon(name) {
  const svg = readFileSync(join(ICONS_DIR, `${name}.svg`), 'utf8');
  return svg.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, ''));
}

// Curated presentation for the known artifact types. `entry` is the page a card
// links to; `count` derives a short unit label from the type's file list.
const REGISTRY = {
  'coloring-book-proof-sheets': {
    icon: 'shapes',
    hue: 'orange',
    title: 'Coloring-book proof sheets',
    blurb:
      'Every coloring page reviewed as one unit — line art, chalk, and the light + night fills side by side, plus the composited canvas view. Tabbed by category.',
    entry: 'coloring-book-proof-sheets/index.html',
    kind: 'Proof sheets',
    count: (files) => {
      const n = files.filter((f) => f.endsWith('.html') && f !== 'index.html').length;
      return n ? `${n} categories` : null;
    },
  },
  'model-eval': {
    icon: 'wand-stars',
    hue: 'blue',
    title: 'Image-model bake-off',
    blurb:
      'A/B comparison of the candidate production image models over the real coloring corpus — cost, latency, and a tap-to-flip quality gallery under the exact production request config.',
    entry: 'model-eval/report/index.html',
    kind: 'Comparison report',
    count: () => null,
  },
  'crayon-brush-samples': {
    icon: 'more-colors',
    hue: 'red',
    title: 'Crayon brush — reference strokes',
    blurb:
      'AI-generated acceptance-criteria art for the crayon brush mode: what a waxy crayon stroke should look like, built up stage by stage — single lines, same-color buildup, cross-color layering, scribble types, and fills.',
    entry: 'crayon-brush-samples/index.html',
    kind: 'Reference sheet',
    count: (files) => {
      const n = files.filter((f) => f.endsWith('.webp')).length;
      return n ? `${n} samples` : null;
    },
  },
  icons: {
    icon: 'more-colors',
    hue: 'purple',
    title: 'Icon gallery',
    blurb:
      'Every icon shipped in the app, rendered at size and split into the colorful spot illustrations and the monochrome UI glyphs that follow the current text color.',
    entry: 'icons/index.html',
    kind: 'Reference sheet',
    count: null,
  },
};

// YYYY-MM-DD — locale-independent so the index is byte-stable across machines
// except for the dates themselves.
const fmtDate = (d) => d.toISOString().slice(0, 10);

// Latest mtime anywhere under a path (a type's freshness = its newest file).
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

// Every .html page under a type dir (depth-first), relative to the artifacts root,
// skipping assets/ support folders — used for the unknown-type fallback list.
function htmlPagesUnder(dir, rel, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name === 'assets') continue;
    const full = join(dir, entry.name);
    const r = `${rel}/${entry.name}`;
    if (entry.isDirectory()) htmlPagesUnder(full, r, out);
    else if (entry.name.endsWith('.html')) out.push(r);
  }
  return out;
}

function card(type, meta, dir) {
  const files = readdirSync(dir);
  const countLabel = typeof meta.count === 'function' ? meta.count(files) : null;
  const updated = fmtDate(latestMtime(dir));
  const entryExists = existsSync(join(dir, '..', meta.entry));
  const href = entryExists ? meta.entry : `${type}/${files.find((f) => f.endsWith('.html')) ?? ''}`;
  return `<article class="card" style="--hue:var(--c-${meta.hue})">
      <a class="card-hit" href="${esc(href)}" aria-label="${esc(meta.title)}"></a>
      <div class="card-top"></div>
      <div class="card-body">
        <div class="card-emoji" aria-hidden="true">${inlineIcon(meta.icon)}</div>
        <h3>${esc(meta.title)}</h3>
        <p>${esc(meta.blurb)}</p>
        <div class="card-meta"><span class="kind">${esc(meta.kind)}</span>${countLabel ? ` · ${esc(countLabel)}` : ''} · Updated ${esc(updated)}</div>
        <span class="go">Open <span class="arrow" aria-hidden="true">→</span></span>
      </div>
    </article>`;
}

function fallbackCard(type, dir) {
  const pages = htmlPagesUnder(dir, type);
  if (!pages.length) return '';
  const rows = pages
    .map((p) => `<li><a href="${esc(p)}">${esc(p.slice(type.length + 1))}</a></li>`)
    .join('');
  return `<article class="card card--plain" style="--hue:var(--c-green)">
      <div class="card-top"></div>
      <div class="card-body">
        <div class="card-emoji is-emoji" aria-hidden="true">📄</div>
        <h3>${esc(type)}</h3>
        <ul class="plain-list">${rows}</ul>
        <div class="card-meta"><span class="kind">${pages.length} page${pages.length === 1 ? '' : 's'}</span> · Updated ${esc(fmtDate(latestMtime(dir)))}</div>
      </div>
    </article>`;
}

const EXTRA_CSS = `
.intro-cards{display:flex; flex-wrap:wrap; gap:8px}
.plain-list{list-style:none; margin:2px 0; padding:0; display:flex; flex-direction:column; gap:4px; font-size:.9rem}
.plain-list a{color:var(--accent-ink)}
.card--plain:hover{transform:none; box-shadow:var(--shadow-sm); border-color:var(--hair)}
.lead{max-width:70ch; color:var(--muted); margin:0 0 4px}
`;

export function buildArtifactsIndex(artifactsDir) {
  const entries = readdirSync(artifactsDir, { withFileTypes: true });
  const typeDirs = entries
    .filter((e) => e.isDirectory() && !SCAFFOLDING.has(e.name))
    .map((e) => e.name)
    .sort();

  // Known types first (registry order), then any unknown dirs as fallback cards.
  const known = Object.keys(REGISTRY).filter((t) => typeDirs.includes(t));
  const unknown = typeDirs.filter((t) => !REGISTRY[t]);

  const cards = [
    ...known.map((t) => card(t, REGISTRY[t], join(artifactsDir, t))),
    ...unknown.map((t) => fallbackCard(t, join(artifactsDir, t))),
  ].filter(Boolean);

  // Loose root-level HTML files (rare) get a plain section so they stay reachable.
  const looseHtml = entries
    .filter((e) => e.isFile() && !SCAFFOLDING.has(e.name) && e.name.endsWith('.html'))
    .map((e) => e.name);

  const stats = [
    `<span class="chip accent"><b>${typeDirs.length}</b> collection${typeDirs.length === 1 ? '' : 's'}</span>`,
    `<span class="chip">Served live on <b>GitHub&nbsp;Pages</b></span>`,
  ].join('');

  const grid = cards.length
    ? `<div class="card-grid">\n      ${cards.join('\n      ')}\n    </div>`
    : `<p class="empty">No artifacts published yet. Run <code>npm run artifacts:publish -- &lt;source&gt; &lt;type&gt;/&lt;name&gt;</code>.</p>`;

  const loose = looseHtml.length
    ? `<div class="section-head"><h2>Loose files</h2></div>
    <div class="card-grid"><article class="card card--plain"><div class="card-top"></div><div class="card-body"><ul class="plain-list">${looseHtml
      .map((f) => `<li><a href="${esc(f)}">${esc(f)}</a></li>`)
      .join('')}</ul></div></article></div>`
    : '';

  const tagline =
    `The keeper outputs of Splotch's generators — proof sheets, model bake-offs, and reference ` +
    `galleries — committed to the repo and served live so a result survives the session that made ` +
    `it, without spending API tokens to regenerate. Browse a collection below.`;

  const body = `${masthead({ title: 'Artifacts', tagline, home: 'index.html', stats, decoration: inlineIcon('splotchy') })}
<main>
  <div class="shell">
    <div class="section-head">
      <h2>Collections</h2>
      <span class="desc">${cards.length} published</span>
    </div>
    ${grid}
    ${loose}
  </div>
</main>
${siteFooter({ home: 'index.html' })}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Splotch artifacts</title>
${chromeStyle(EXTRA_CSS)}
</head>
<body>
${body}
</body>
</html>
`;
}
