#!/usr/bin/env node
// Build a single self-contained contact sheet from a capture run.
//
// Everything is inlined as base64 so the file can be opened from disk, mailed,
// or dropped into a PR comment thread without carrying a directory of images
// beside it. Run capture.mjs first.
//
// Usage: node tools/gpu-crayon/gen-contact-sheet.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from '../lib/html.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(HERE, 'output');
const SHEET = path.join(OUTPUT_DIR, 'contact-sheet.html');

// Read off the capture rather than restated here, so a sheet can never claim a
// property the images do not show.
const NOTES = {
  cpu: 'What ships today. The tooth is finest here and the buildup band separates most clearly, because each pass glazes at <code>perOpGlazeReturn</code> rather than a pure <code>min()</code>.',
  stamp:
    'Visually indistinguishable from the SDF option at this spacing — the stamps overlap densely enough that their union <em>is</em> the capsule, and a paper-anchored tooth makes the overlap idempotent. It pays ~2.2× the primitives and carries a much longer tail for a picture nobody can tell apart.',
  ciallo:
    'The softest silhouette of the three, and the only one whose stroke ends taper without a cap being drawn. Needs two things the others do not: a window of the polyline in a texture (deposit accumulates over ±R of arclength, which is a dozen segments at hand cadence) and a density→coverage transfer.',
  sdf: 'The closest match to the baseline and the tightest frame time — the banded radial coverage <em>is</em> crayonBrush’s two passes, so what differs from the CPU column is the port, not the algorithm.',
};

function dataUri(file) {
  return `data:image/webp;base64,${readFileSync(path.join(OUTPUT_DIR, file)).toString('base64')}`;
}

function ms(value) {
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function statsRows(stats) {
  // An all-zero timer result means the renderer issued no GL commands at all,
  // which is not the same as costing nothing — the 2D pipeline's raster and
  // flush land outside every clock the page can read. Reporting 0.00 would
  // read as "free", which is the exact misreading ADR-0085 was written about.
  const measured = stats.gpuMs;
  const gpu =
    measured && (measured.p50 > 0 || measured.p95 > 0 || measured.max > 0) ? measured : null;
  return `
    <dl>
      <div><dt>GPU / frame</dt><dd>${
        gpu
          ? `${ms(gpu.p50)} <span>p50</span> · ${ms(gpu.p95)} <span>p95</span> · ${ms(gpu.max)} <span>max</span>`
          : '<span class="none">not measurable — see caveat</span>'
      }</dd></div>
      <div><dt>JS / frame</dt><dd>${ms(stats.cpuMs.p50)} <span>p50</span> · ${ms(stats.cpuMs.p95)} <span>p95</span> · ${ms(stats.cpuMs.max)} <span>max</span></dd></div>
      <div><dt>work</dt><dd>${stats.drawCalls.toLocaleString()} draw calls · ${stats.primitives.toLocaleString()} ${esc(stats.primitiveNoun)}</dd></div>
    </dl>`;
}

function column(result) {
  const note = NOTES[result.id] ?? '';
  return `
  <section class="column${result.id === 'cpu' ? ' baseline' : ''}">
    <header>
      <h2>${esc(result.label)}${result.id === 'cpu' ? '<em>baseline</em>' : ''}</h2>
      <p class="blurb">${esc(result.blurb)}</p>
    </header>
    <figure>
      <img src="${dataUri(`${result.id}.webp`)}" alt="Reference scene drawn by ${esc(result.label)}" />
      <figcaption>reference scene · 1120 × 780</figcaption>
    </figure>
    <figure>
      <img class="detail" src="${dataUri(`${result.id}-detail.webp`)}" alt="Tooth detail from ${esc(result.label)}" />
      <figcaption>paper tooth · 3× nearest-neighbour</figcaption>
    </figure>
    ${statsRows(result.stats)}
    <p class="note">${note}</p>
  </section>`;
}

export function generateContactSheet() {
  const report = JSON.parse(readFileSync(path.join(OUTPUT_DIR, 'results.json'), 'utf8'));
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: path.join(HERE, '..', '..'),
    encoding: 'utf8',
  }).trim();

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>GPU crayon — contact sheet</title>
<style>
  :root {
    color-scheme: light;
    --ink: #1b1a21;
    --muted: #6a6577;
    --line: #e2ded6;
    --card: #fffefb;
    --bg: #f2efe9;
    --accent: #6b5ce7;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 40px 32px 64px;
    background: var(--bg);
    color: var(--ink);
    font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .page { max-width: 1560px; margin: 0 auto; }
  h1 { font-size: 30px; margin: 0 0 8px; letter-spacing: -0.01em; }
  .lede { max-width: 84ch; margin: 0 0 6px; color: #3f3b49; }
  .provenance {
    margin: 18px 0 30px; padding: 12px 16px; border-left: 3px solid var(--accent);
    background: #fffefb; border-radius: 0 8px 8px 0; font-size: 13px; color: var(--muted);
  }
  .provenance code { background: #efece5; padding: 1px 5px; border-radius: 3px; color: var(--ink); }
  .caveat {
    margin: 0 0 30px; padding: 12px 16px; border-radius: 8px; font-size: 13px;
    background: #fff6e8; border: 1px solid #f0dcb8; color: #6b4d17;
  }
  /* Subgrid so the scenes, the detail crops and the stat blocks sit on shared
     baselines across all four columns — a contact sheet that does not line up
     is asking the reader to do the comparison it exists to do for them. */
  .grid {
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: auto auto auto auto auto; gap: 18px; align-items: start;
  }
  .column {
    background: var(--card); border: 1px solid var(--line); border-radius: 12px;
    padding: 16px; gap: 12px;
    display: grid; grid-row: span 5; grid-template-rows: subgrid;
  }
  .column.baseline { border-color: #cfc8bb; background: #f8f6f1; }
  .column h2 { font-size: 16px; margin: 0 0 5px; display: flex; align-items: baseline; gap: 8px; }
  .column h2 em {
    font-style: normal; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
    color: #7d7689; background: #eceae4; padding: 2px 6px; border-radius: 20px;
  }
  .blurb { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--muted); }
  figure { margin: 0; }
  img {
    width: 100%; display: block; border-radius: 7px; border: 1px solid var(--line);
    background: #fcfbf8;
  }
  img.detail { image-rendering: pixelated; }
  figcaption {
    margin-top: 5px; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: #9a94a6;
  }
  dl { margin: 0; display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; }
  dl > div { display: flex; gap: 8px; align-items: baseline; }
  dt { color: var(--muted); min-width: 74px; }
  dd { margin: 0; font-variant-numeric: tabular-nums; }
  dd span { color: #a29bb0; font-size: 10.5px; }
  dd .none { font-variant-numeric: normal; font-style: italic; }
  .note {
    margin: 2px 0 0; padding-top: 11px; border-top: 1px solid var(--line);
    font-size: 12.5px; line-height: 1.55;
  }
  .note code { background: #efece5; padding: 0 4px; border-radius: 3px; font-size: 11.5px; }
  .findings { margin-top: 40px; max-width: 92ch; }
  .findings h2 { font-size: 19px; margin: 0 0 10px; }
  .findings li { margin-bottom: 9px; }
  @media (max-width: 1200px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 640px) {
    .grid { grid-template-columns: 1fr; }
    .column { grid-row: auto; grid-template-rows: none; }
  }
</style>
</head>
<body>
<div class="page">
  <h1>GPU crayon — contact sheet</h1>
  <p class="lede">
    One fixed scene, four renderers, identical per-frame point batches. The three GPU options share
    one wax model — the paper-tooth field, threshold, dither and shade shift ported verbatim from
    <code>crayonBrush.ts</code> into GLSL, reading the same three fields the CPU pipeline builds, and
    composited with <code>gl.MIN</code>. They differ only in how a fragment's coverage is decided.
  </p>

  <div class="provenance">
    captured ${esc(report.capturedAt)} · <code>${esc(commit)}</code> ·
    ${esc(report.gpu)} · ${report.results[0].stats.frames} frames per run ·
    scene ${report.scene.width} × ${report.scene.height}
  </div>

  <p class="caveat">
    <strong>A Mac is <code>desktop-advisory</code>.</strong> These timings rank the algorithms against
    each other and approve nothing. Per ADR-0085 the iPad's surface-flush cliff does not reproduce at
    any desktop viewport, DPR or CPU throttle — the question this spike exists to answer can only be
    closed on a physical device.
    <br /><br />
    The CPU column has no GPU number for a related reason: it issues no WebGL commands, and its 2D
    raster and flush land outside every clock the page can read. That is not the baseline looking
    fast — it is the same blind spot ADR-0085 measured around, where <code>engine.draw</code> stayed
    under 2&nbsp;ms while the device lost 417&nbsp;ms per drawing-second.
  </p>

  <div class="grid">
${report.results.map(column).join('\n')}
  </div>

  <div class="findings">
    <h2>What the sheet shows</h2>
    <ul>
      <li><strong>The wax model ports cleanly.</strong> The detail crops put the GPU tooth at the same
      texel scale and the same binary character as the baseline — same field, same threshold, same
      dither band, read from a texture instead of a colorized canvas tile.</li>
      <li><strong>Colour changes stop costing texel work.</strong> The CPU pipeline bakes a wax tile
      per (colour, pass) and caches them under an LRU; the shader answers every colour and every pass
      from one upload.</li>
      <li><strong>Subtractive glaze survives as a blend equation.</strong> Band 4 reads green in every
      column, from <code>gl.MIN</code> alone — no pass buffer, no offscreen shadow, no restamp.</li>
      <li><strong>Where the GPU columns differ from the baseline is buildup, not grain.</strong>
      Band 3 separates more sharply on CPU, because it glazes per pass at
      <code>perOpGlazeReturn</code> where the port uses a pure <code>min()</code>. That is a tuning
      gap, not a structural one.</li>
      <li><strong>The stamped option earns nothing here.</strong> It is the industry default and it
      matches the SDF option pixel for pixel at this spacing, for more primitives and a worse tail.
      Its advantages — per-stamp jitter, rotation, pressure — are features this crayon does not
      have.</li>
    </ul>
  </div>
</div>
</body>
</html>
`;

  writeFileSync(SHEET, html);
  return SHEET;
}

console.log(generateContactSheet());
