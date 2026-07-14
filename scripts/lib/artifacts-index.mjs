// Builds the self-contained landing page for the committed /artifacts tree
// (ADR-0059). Pure: scans a directory, returns an HTML string — the publish
// script and the artifacts:index script both call this. No network, no build
// step; GitHub Pages serves the result as-is (.nojekyll).

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Not listed as artifacts — they are the index's own scaffolding.
const SCAFFOLDING = new Set(['index.html', 'README.md', '.nojekyll', '.gitkeep']);

// Every file under `dir`, depth-first, as { rel, mtime } relative to `dir`.
function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (base === dir && SCAFFOLDING.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, base));
    } else {
      out.push({ rel: relative(base, full).split('\\').join('/'), mtime: statSync(full).mtime });
    }
  }
  return out;
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// YYYY-MM-DD HH:MM UTC — locale-independent so the index is byte-stable across
// machines except for the timestamps themselves.
const fmtDate = (d) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

// Group files by their top-level directory (the artifact "type"); files sitting
// directly in artifacts/ fall under "(root)".
function groupByType(files) {
  const groups = new Map();
  for (const file of files) {
    const slash = file.rel.indexOf('/');
    const type = slash === -1 ? '(root)' : file.rel.slice(0, slash);
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(file);
  }
  for (const list of groups.values()) list.sort((a, b) => a.rel.localeCompare(b.rel));
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function buildArtifactsIndex(artifactsDir) {
  const groups = groupByType(walk(artifactsDir));
  const total = groups.reduce((n, [, list]) => n + list.length, 0);

  const sections = groups
    .map(([type, list]) => {
      const rows = list
        .map(
          (f) =>
            `        <li><a href="./${escapeHtml(f.rel)}">${escapeHtml(f.rel)}</a>` +
            `<time>${fmtDate(f.mtime)}</time></li>`
        )
        .join('\n');
      return `      <section>\n        <h2>${escapeHtml(type)}</h2>\n        <ul>\n${rows}\n        </ul>\n      </section>`;
    })
    .join('\n');

  const body = total
    ? sections
    : '      <p class="empty">No artifacts published yet. Run <code>npm run artifacts:publish</code>.</p>';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Splotch artifacts</title>
    <style>
      :root { color-scheme: light dark; --fg: #1a1a1a; --muted: #6a6a6a; --link: #0b5fff; --line: #e2e2e2; --bg: #fff; }
      @media (prefers-color-scheme: dark) {
        :root { --fg: #e8e8e8; --muted: #9a9a9a; --link: #6ea8ff; --line: #333; --bg: #16171a; }
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--fg);
        font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        padding: 2rem 1.25rem; }
      main { max-width: 60rem; margin: 0 auto; }
      h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
      .sub { color: var(--muted); margin: 0 0 2rem; }
      h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: .04em;
        color: var(--muted); margin: 2rem 0 .5rem; }
      ul { list-style: none; margin: 0; padding: 0; }
      li { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline;
        padding: .5rem 0; border-top: 1px solid var(--line); }
      a { color: var(--link); text-decoration: none; word-break: break-all; }
      a:hover { text-decoration: underline; }
      time { color: var(--muted); font-size: .85rem; white-space: nowrap; }
      .empty { color: var(--muted); }
      code { background: color-mix(in srgb, var(--fg) 10%, transparent);
        padding: .1em .4em; border-radius: 4px; font-size: .9em; }
    </style>
  </head>
  <body>
    <main>
      <h1>Splotch artifacts</h1>
      <p class="sub">Committed run outputs — contact sheets, Lighthouse reports, model &amp; prompt tests. See <code>artifacts/README.md</code>.</p>
${body}
    </main>
  </body>
</html>
`;
}
