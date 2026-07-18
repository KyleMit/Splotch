// Visual contact sheet for the brush-render variants (ADR-0065). Renders every
// variant of a textured brush across a battery of small multi-colour example
// drawings — some with overlapping strokes of different colours, some without —
// through the REAL engine on /dev/engine, then composites a labelled grid
// (rows = variants, columns = drawings) and screenshots it to a PNG.
//
//   node scripts/perf/brush-contact-sheet.mjs            (crayon + watercolor)
//   node scripts/perf/brush-contact-sheet.mjs --no-build
//
// Writes contact-<brush>.png to perf-profiles/<stamp>-brush-contact-sheet/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT, chromiumExecutablePath } from '../lib/utils.mjs';
import { buildAndPreview } from './preview.mjs';

const args = process.argv.slice(2);
const build = !args.includes('--no-build');
const port = Number((args.find((a) => a.startsWith('--port=')) || '').split('=')[1] || 4173);
// When set, write a single self-contained HTML page (data-URI images inline) to
// this path instead of the per-brush PNG screenshots.
const htmlPath = (args.find((a) => a.startsWith('--html=')) || '').split('=')[1] || null;

const CELL_W = 380;
const CELL_H = 260;
const STROKE = 15;

// Splotch-palette hexes for the example strokes.
const C = {
  red: '#EC534E',
  blue: '#62A2E9',
  yellow: '#FFC43D',
  green: '#66BB6A',
  purple: '#AB71E1',
  orange: '#FF8A3D',
  teal: '#31C4B3',
  pink: '#F072B0',
};

// Each drawing = ordered list of { color, pts } in normalized 0..1 coords. The
// `overlap` flag drives the column tag so the sheet shows both cases explicitly.
const DRAWINGS = [
  {
    name: 'Rainbow bands',
    overlap: false,
    strokes: [
      {
        color: C.red,
        pts: [
          [0.08, 0.16],
          [0.92, 0.16],
        ],
      },
      {
        color: C.orange,
        pts: [
          [0.08, 0.31],
          [0.92, 0.31],
        ],
      },
      {
        color: C.yellow,
        pts: [
          [0.08, 0.46],
          [0.92, 0.46],
        ],
      },
      {
        color: C.green,
        pts: [
          [0.08, 0.61],
          [0.92, 0.61],
        ],
      },
      {
        color: C.blue,
        pts: [
          [0.08, 0.76],
          [0.92, 0.76],
        ],
      },
      {
        color: C.purple,
        pts: [
          [0.08, 0.91],
          [0.92, 0.91],
        ],
      },
    ],
  },
  {
    name: 'Colour cross',
    overlap: true,
    strokes: [
      {
        color: C.red,
        pts: [
          [0.1, 0.5],
          [0.9, 0.5],
        ],
      },
      {
        color: C.blue,
        pts: [
          [0.5, 0.1],
          [0.5, 0.9],
        ],
      },
      {
        color: C.yellow,
        pts: [
          [0.15, 0.15],
          [0.85, 0.85],
        ],
      },
      {
        color: C.green,
        pts: [
          [0.85, 0.15],
          [0.15, 0.85],
        ],
      },
    ],
  },
  {
    name: 'Scribble',
    overlap: true,
    strokes: [
      {
        color: C.purple,
        pts: Array.from({ length: 40 }, (_, i) => {
          const t = i / 39;
          return [0.15 + t * 0.7, 0.5 + Math.sin(t * 22) * 0.32];
        }),
      },
      {
        color: C.orange,
        pts: Array.from({ length: 40 }, (_, i) => {
          const t = i / 39;
          return [0.15 + t * 0.7, 0.5 + Math.cos(t * 20) * 0.3];
        }),
      },
    ],
  },
  {
    name: 'Flower',
    overlap: true,
    strokes: [
      ...Array.from({ length: 6 }, (_, k) => {
        const a = (k / 6) * Math.PI * 2;
        const cx = 0.5;
        const cy = 0.5;
        return {
          color: [C.pink, C.red, C.orange][k % 3],
          pts: Array.from({ length: 16 }, (_, i) => {
            const t = (i / 15) * Math.PI * 2;
            const rx = 0.09 + 0.02 * Math.cos(t);
            const ry = 0.22;
            const px = Math.cos(t) * rx;
            const py = Math.sin(t) * ry - ry;
            return [
              cx + px * Math.cos(a) - py * Math.sin(a),
              cy + px * Math.sin(a) + py * Math.cos(a),
            ];
          }),
        };
      }),
      {
        color: C.yellow,
        pts: [
          [0.5, 0.5],
          [0.5, 0.51],
        ],
      },
    ],
  },
  {
    name: 'Dots & dashes',
    overlap: false,
    strokes: Array.from({ length: 15 }, (_, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = 0.15 + col * 0.175;
      const y = 0.22 + row * 0.28;
      return {
        color: [C.red, C.blue, C.green, C.purple, C.orange][col],
        pts: [
          [x, y],
          [x + 0.06, y + 0.05],
        ],
      };
    }),
  },
  {
    name: 'Layered hills',
    overlap: true,
    strokes: [C.teal, C.green, C.blue].map((color, k) => ({
      color,
      pts: Array.from({ length: 24 }, (_, i) => {
        const t = i / 23;
        return [0.05 + t * 0.9, 0.7 - k * 0.12 - Math.sin(t * Math.PI) * 0.28];
      }),
    })),
  },
];

// Variant metadata per brush: id/name, the perf numbers measured by perf:brush
// (draw avg ms per op · full-battery undo ms, 4× CPU throttle), and the verdict
// used for the HTML page's state chip. `winner` marks the shipped default.
const VARIANTS = {
  crayon: [
    {
      v: 1,
      id: 'v1',
      name: 'solid',
      metric: '0.12 · 4',
      verdict: 'baseline',
      label: 'v1 solid (baseline)',
    },
    {
      v: 2,
      id: 'v2',
      name: 'jittered',
      metric: '0.13 · 15',
      verdict: 'winner',
      winner: true,
      label: 'v2 jittered',
    },
    {
      v: 3,
      id: 'v3',
      name: 'grain-stamp',
      metric: '3.3 · 298',
      verdict: 'slow',
      label: 'v3 grain-stamp',
    },
    {
      v: 4,
      id: 'v4',
      name: 'tinted-grain',
      metric: '0.07 · 15',
      verdict: 'flat',
      label: 'v4 tinted-grain',
    },
  ],
  watercolor: [
    {
      v: 1,
      id: 'v1',
      name: 'solid',
      metric: '0.23 · 8',
      verdict: 'baseline',
      label: 'v1 solid (baseline)',
    },
    {
      v: 2,
      id: 'v2',
      name: 'multiply wash',
      metric: '0.10 · 25',
      verdict: 'shift',
      label: 'v2 multiply wash',
    },
    {
      v: 3,
      id: 'v3',
      name: 'feathered',
      metric: '0.06 · 27',
      verdict: 'winner',
      winner: true,
      label: 'v3 feathered',
    },
    {
      v: 4,
      id: 'v4',
      name: 'blurred stamp',
      metric: '3.4 · 326',
      verdict: 'slow',
      label: 'v4 blurred stamp',
    },
  ],
};

// Human-readable verdict chips for the HTML page: [short label, semantic kind].
const VERDICTS = {
  winner: ['shipped', 'good'],
  baseline: ['baseline', 'neutral'],
  slow: ['too slow', 'bad'],
  flat: ['no texture', 'warn'],
  shift: ['colour shift', 'warn'],
};

async function main() {
  process.env.PUBLIC_ENABLE_DEV_HARNESS = 'true';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(ROOT, 'perf-profiles', `${stamp}-brush-contact-sheet`);
  mkdirSync(outDir, { recursive: true });

  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto(`${base}dev/engine`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__engineReady === true);
    await page.evaluate(([w, h]) => window.__engine.resizeTo(w, h), [CELL_W, CELL_H]);

    // sheets[brush] = grid[variantIndex][drawingIndex] = PNG data URL, rendered
    // through the real engine on the app's paper.
    const sheets = {};
    for (const brush of Object.keys(VARIANTS)) {
      const grid = [];
      for (const variant of VARIANTS[brush]) {
        const row = [];
        for (const drawing of DRAWINGS) {
          const url = await page.evaluate(
            ({ brush, v, drawing, stroke, expW }) => {
              const eng = window.__engine;
              const canvas = document.getElementById('engineCanvas');
              const rect = canvas.getBoundingClientRect();
              // A true wipe to a blank canvas — clearCanvas() alone (undoing it
              // would replay the previous drawing straight back).
              if (!eng.isCanvasEmpty()) eng.clearCanvas();
              eng.setStrokeWidth(stroke);
              eng.setBrush(brush);
              eng.setBrushVariant(brush, v);
              const abs = (p) => ({ x: p[0] * rect.width, y: p[1] * rect.height });
              for (const s of drawing.strokes) {
                eng.setColor(s.color);
                eng.strokeSync(s.pts.map(abs), 'pen');
              }
              // Full-res for the PNG path; downscale for the inline-HTML path so
              // the self-contained page stays a sane size (the strokes still read
              // crisply at the ~300px display width).
              if (!expW) return canvas.toDataURL('image/png');
              const ex = document.createElement('canvas');
              ex.width = expW;
              ex.height = Math.round((expW * canvas.height) / canvas.width);
              const ectx = ex.getContext('2d');
              ectx.imageSmoothingEnabled = true;
              ectx.imageSmoothingQuality = 'high';
              ectx.drawImage(canvas, 0, 0, ex.width, ex.height);
              return ex.toDataURL('image/png');
            },
            { brush, v: variant.v, drawing, stroke: STROKE, expW: htmlPath ? 380 : 0 }
          );
          row.push(url);
        }
        grid.push(row);
      }
      sheets[brush] = grid;
    }

    if (htmlPath) {
      writeFileSync(htmlPath, buildArtifactPage(sheets));
      console.log(`\nContact-sheet page: ${htmlPath}`);
    } else {
      for (const brush of Object.keys(sheets)) {
        await page.setContent(simpleSheetDoc(brush, sheets[brush]), { waitUntil: 'networkidle' });
        await page.locator('body').screenshot({ path: join(outDir, `contact-${brush}.png`) });
      }
      console.log(`\nContact sheets: ${outDir}`);
    }
  } finally {
    await browser.close();
    stop();
  }
}

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );

// The plain PNG-path document (screenshotted to contact-<brush>.png).
function simpleSheetDoc(brush, grid) {
  const title = brush === 'crayon' ? 'Crayon' : 'Watercolor';
  const cols = DRAWINGS.map(
    (d) =>
      `<th class="col">${esc(d.name)}<span class="tag ${d.overlap ? 'ov' : 'no'}">${
        d.overlap ? 'overlapping' : 'no overlap'
      }</span></th>`
  ).join('');
  const rows = VARIANTS[brush]
    .map(
      (variant, ri) =>
        `<tr class="${variant.winner ? 'winner' : ''}"><td class="rowlabel">${esc(variant.label)}${
          variant.winner ? '<span class="win">★ shipped</span>' : ''
        }</td>${grid[ri].map((url) => `<td class="cell"><div class="frame"><img src="${url}"></div></td>`).join('')}</tr>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { --paper:#f4f1ea; } * { box-sizing:border-box; margin:0; }
    body { background:#fff; font-family:system-ui,sans-serif; color:#222; padding:24px; }
    h1 { font-size:22px; margin-bottom:4px; } .sub { color:#666; font-size:13px; margin-bottom:16px; }
    table { border-collapse:collapse; }
    th.col { font-size:13px; font-weight:600; padding:6px 8px; text-align:center; }
    th.col .tag { display:block; font-weight:500; font-size:11px; margin-top:2px; }
    th.col .ov { color:#c0392b; } th.col .no { color:#2e7d32; }
    td.rowlabel { font-size:13px; font-weight:600; padding:0 12px 0 4px; text-align:right; white-space:nowrap; }
    td.rowlabel .win { display:block; font-size:11px; color:#8e44ad; font-weight:600; }
    td.cell { padding:5px; }
    .frame { width:${CELL_W}px; height:${CELL_H}px; background:var(--paper); border:1px solid #ddd;
             border-radius:8px; overflow:hidden; box-shadow:inset 0 0 0 1px rgba(0,0,0,.02); }
    .frame img { width:100%; height:100%; display:block; }
    tr.winner td.cell .frame { border-color:#8e44ad; box-shadow:0 0 0 2px rgba(142,68,173,.35); }
  </style></head><body>
    <h1>${title} — brush variant contact sheet</h1>
    <div class="sub">Rows = render variants · columns = example drawings · rendered through the real engine on paper. ★ = shipped winner.</div>
    <table><thead><tr><th></th>${cols}</tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
}

// The designed, self-contained artifact page (content fragment — the Artifact
// wrapper supplies <!doctype>/<head>/<body>). Data-URI images inline, both
// themes, a "lab specimen sheet" treatment: mono for the variant IDs/metrics
// (real data), the app's brand violet as the lone accent, and the app's actual
// paper for every sample frame.
function buildArtifactPage(sheets) {
  const specimen = (brush) => {
    const grid = sheets[brush];
    const title = brush === 'crayon' ? 'Crayon' : 'Watercolor';
    const win = VARIANTS[brush].find((v) => v.winner);
    const colHeads = DRAWINGS.map(
      (d) =>
        `<div class="colhead"><span class="cn">${esc(d.name)}</span><span class="tag ${
          d.overlap ? 'ov' : 'no'
        }">${d.overlap ? 'overlap' : 'no overlap'}</span></div>`
    ).join('');
    const rows = VARIANTS[brush]
      .map((variant, ri) => {
        const [vlabel, vkind] = VERDICTS[variant.verdict];
        const label = `<div class="rowlabel${variant.winner ? ' is-win' : ''}">
          <div class="rl-top"><span class="rl-id">${esc(variant.id)}</span><span class="rl-name">${esc(
            variant.name
          )}</span></div>
          <div class="rl-metric">${esc(variant.metric)}<span class="rl-unit"> ms/op · undo</span></div>
          <span class="chip ${vkind}">${variant.winner ? '★ ' : ''}${esc(vlabel)}</span>
        </div>`;
        const cells = grid[ri]
          .map(
            (url, j) =>
              `<div class="frame${variant.winner ? ' is-win' : ''}"><img loading="lazy" src="${url}" alt="${esc(
                title
              )} ${esc(variant.id)} — ${esc(DRAWINGS[j].name)}"></div>`
          )
          .join('');
        return label + cells;
      })
      .join('');
    return `<section class="specimen">
      <div class="specimen-head">
        <h2>${esc(title)}</h2>
        <p class="specimen-note">Winner <strong>${esc(win.id)} ${esc(win.name)}</strong> — shipped default.</p>
      </div>
      <div class="grid-scroll">
        <div class="grid">
          <div class="corner">variant \\ drawing</div>${colHeads}${rows}
        </div>
      </div>
    </section>`;
  };

  return `<style>
    :root {
      --bg:#f5f4f8; --panel:#ffffff; --panel-2:#efedf4; --ink:#211d29; --ink-soft:#6c6579;
      --line:#e4e1ec; --accent:#7c3aed; --accent-soft:#efe9fe; --paper:#f4f1ea; --paper-line:#dcd7ca;
      --good:#2f9e44; --warn:#b9760f; --bad:#d0432f; --neutral:#8a8494;
      --cell:300px; --label:238px;
      --mono:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
      --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    }
    @media (prefers-color-scheme:dark) {
      :root {
        --bg:#141119; --panel:#1d1926; --panel-2:#272232; --ink:#ece9f1; --ink-soft:#a79fb8;
        --line:#302a3c; --accent:#b794f6; --accent-soft:#2a2140; --paper-line:#cfc8b8;
        --good:#5bbf6a; --warn:#e0a44a; --bad:#e8776a; --neutral:#948da4;
      }
    }
    :root[data-theme="light"] {
      --bg:#f5f4f8; --panel:#ffffff; --panel-2:#efedf4; --ink:#211d29; --ink-soft:#6c6579;
      --line:#e4e1ec; --accent:#7c3aed; --accent-soft:#efe9fe; --paper-line:#dcd7ca;
      --good:#2f9e44; --warn:#b9760f; --bad:#d0432f; --neutral:#8a8494;
    }
    :root[data-theme="dark"] {
      --bg:#141119; --panel:#1d1926; --panel-2:#272232; --ink:#ece9f1; --ink-soft:#a79fb8;
      --line:#302a3c; --accent:#b794f6; --accent-soft:#2a2140; --paper-line:#cfc8b8;
      --good:#5bbf6a; --warn:#e0a44a; --bad:#e8776a; --neutral:#948da4;
    }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--sans);
      -webkit-font-smoothing:antialiased; line-height:1.5; }
    .wrap { max-width:1240px; margin:0 auto; padding:40px 28px 64px; }
    .masthead { border-bottom:1px solid var(--line); padding-bottom:26px; margin-bottom:30px;
      animation:rise .5s ease both; }
    .eyebrow { font-family:var(--mono); font-size:12px; letter-spacing:.16em; text-transform:uppercase;
      color:var(--accent); margin:0 0 12px; font-weight:600; }
    h1 { font-size:clamp(28px,4.4vw,40px); line-height:1.05; letter-spacing:-.02em; margin:0 0 14px;
      font-weight:800; text-wrap:balance; }
    .lede { max-width:66ch; margin:0; color:var(--ink-soft); font-size:15.5px; }
    .lede b { color:var(--ink); font-weight:600; }
    .legend { display:flex; flex-wrap:wrap; gap:10px 18px; margin-top:20px; font-size:12.5px;
      color:var(--ink-soft); align-items:center; }
    .legend .tag, .legend .chip { position:static; }
    .specimen { margin-top:44px; animation:rise .5s ease both; }
    .specimen-head { display:flex; align-items:baseline; gap:16px; flex-wrap:wrap; margin-bottom:14px; }
    .specimen-head h2 { font-size:23px; letter-spacing:-.01em; margin:0; font-weight:700; }
    .specimen-note { margin:0; color:var(--ink-soft); font-size:13.5px; }
    .specimen-note strong { color:var(--accent); font-weight:700; font-family:var(--mono); }
    .grid-scroll { overflow-x:auto; border:1px solid var(--line); border-radius:16px;
      background:var(--panel); box-shadow:0 1px 2px rgba(20,10,40,.04); scrollbar-width:thin; }
    .grid { display:grid; grid-template-columns:var(--label) repeat(${DRAWINGS.length},var(--cell)); }
    .corner { position:sticky; left:0; z-index:3; background:var(--panel-2); border-right:1px solid var(--line);
      border-bottom:1px solid var(--line); padding:12px 14px; font-family:var(--mono); font-size:11px;
      color:var(--ink-soft); display:flex; align-items:flex-end; letter-spacing:.02em; }
    .colhead { border-bottom:1px solid var(--line); border-left:1px solid var(--line); padding:12px 14px;
      display:flex; flex-direction:column; gap:5px; background:var(--panel); }
    .colhead .cn { font-size:13.5px; font-weight:650; }
    .tag { font-family:var(--mono); font-size:10.5px; letter-spacing:.02em; padding:2px 7px; border-radius:999px;
      width:max-content; border:1px solid transparent; }
    .tag.ov { color:var(--bad); background:color-mix(in srgb,var(--bad) 12%,transparent);
      border-color:color-mix(in srgb,var(--bad) 26%,transparent); }
    .tag.no { color:var(--good); background:color-mix(in srgb,var(--good) 12%,transparent);
      border-color:color-mix(in srgb,var(--good) 26%,transparent); }
    .rowlabel { position:sticky; left:0; z-index:2; background:var(--panel); border-right:1px solid var(--line);
      border-bottom:1px solid var(--line); padding:14px; display:flex; flex-direction:column; gap:8px; }
    .rowlabel.is-win { background:linear-gradient(90deg,var(--accent-soft),var(--panel) 82%);
      box-shadow:inset 3px 0 0 var(--accent); }
    .rl-top { display:flex; align-items:baseline; gap:8px; }
    .rl-id { font-family:var(--mono); font-size:15px; font-weight:700; color:var(--accent); }
    .rl-name { font-size:13.5px; font-weight:600; }
    .rl-metric { font-family:var(--mono); font-size:12.5px; color:var(--ink); font-variant-numeric:tabular-nums; }
    .rl-unit { color:var(--ink-soft); }
    .chip { font-family:var(--mono); font-size:10.5px; letter-spacing:.02em; padding:2px 8px; border-radius:999px;
      width:max-content; font-weight:600; }
    .chip.good { color:var(--good); background:color-mix(in srgb,var(--good) 14%,transparent); }
    .chip.warn { color:var(--warn); background:color-mix(in srgb,var(--warn) 15%,transparent); }
    .chip.bad { color:var(--bad); background:color-mix(in srgb,var(--bad) 13%,transparent); }
    .chip.neutral { color:var(--neutral); background:color-mix(in srgb,var(--neutral) 15%,transparent); }
    .frame { border-left:1px solid var(--line); border-bottom:1px solid var(--line); padding:9px;
      background:var(--panel); }
    .frame img { display:block; width:100%; aspect-ratio:${CELL_W}/${CELL_H}; object-fit:cover;
      background:var(--paper); border:1px solid var(--paper-line); border-radius:9px; }
    .frame.is-win img { border-color:color-mix(in srgb,var(--accent) 55%,var(--paper-line));
      box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 34%,transparent); }
    footer { margin-top:46px; padding-top:20px; border-top:1px solid var(--line); color:var(--ink-soft);
      font-size:12.5px; display:flex; flex-wrap:wrap; gap:6px 16px; align-items:center; }
    footer code { font-family:var(--mono); background:var(--panel-2); padding:2px 7px; border-radius:6px;
      color:var(--ink); }
    @keyframes rise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
    @media (prefers-reduced-motion:reduce) { .masthead,.specimen { animation:none; } }
  </style>
  <div class="wrap">
    <header class="masthead">
      <p class="eyebrow">Splotch · brush render lab</p>
      <h1>Brush variant contact sheet</h1>
      <p class="lede">Every render variant of the two textured brushes — <b>crayon</b> and
        <b>watercolor</b> — drawn through the real drawing engine on the app's paper, across six
        example drawings. Three use <b>overlapping strokes of different colours</b>, three don't, so
        each variant's pooling and colour behaviour is visible. Metrics are draw cost and undo-replay
        cost measured by <code style="font-family:var(--mono)">perf:brush</code> at 4× CPU throttle.</p>
      <div class="legend">
        <span class="tag ov">overlap</span><span class="tag no">no overlap</span>
        <span class="chip good">★ shipped</span>
        <span>rows = variants · columns = drawings · sample frames shown on the app's light paper</span>
      </div>
    </header>
    ${Object.keys(sheets).map(specimen).join('')}
    <footer>
      <span>Reproduce with <code>npm run perf:brush:sheet</code></span>
      <span>·</span>
      <span>ADR-0065 · per-op render dispatch</span>
    </footer>
  </div>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
