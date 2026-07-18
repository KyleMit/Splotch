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

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT, chromiumExecutablePath } from '../lib/utils.mjs';
import { buildAndPreview } from './preview.mjs';

const args = process.argv.slice(2);
const build = !args.includes('--no-build');
const port = Number((args.find((a) => a.startsWith('--port=')) || '').split('=')[1] || 4173);

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

// Variant label + whether it's the shipped winner, per brush.
const VARIANTS = {
  crayon: [
    { v: 1, label: 'v1 solid (baseline)' },
    { v: 2, label: 'v2 jittered', winner: true },
    { v: 3, label: 'v3 grain-stamp' },
    { v: 4, label: 'v4 tinted-grain' },
  ],
  watercolor: [
    { v: 1, label: 'v1 solid (baseline)' },
    { v: 2, label: 'v2 multiply wash' },
    { v: 3, label: 'v3 feathered', winner: true },
    { v: 4, label: 'v4 blurred stamp' },
  ],
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

    for (const brush of Object.keys(VARIANTS)) {
      // grid[variantIndex][drawingIndex] = dataURL
      const grid = [];
      for (const variant of VARIANTS[brush]) {
        const row = [];
        for (const drawing of DRAWINGS) {
          const url = await page.evaluate(
            ({ brush, v, drawing, stroke }) => {
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
              return canvas.toDataURL('image/png');
            },
            { brush, v: variant.v, drawing, stroke: STROKE }
          );
          row.push(url);
        }
        grid.push(row);
      }

      // Compose a labelled HTML grid and screenshot it.
      const title = brush === 'crayon' ? 'Crayon' : 'Watercolor';
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        :root { --paper:#f4f1ea; }
        * { box-sizing: border-box; margin: 0; }
        body { background: #ffffff; font-family: system-ui, sans-serif; color: #222; padding: 24px; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        .sub { color:#666; font-size:13px; margin-bottom:16px; }
        table { border-collapse: collapse; }
        th.col { font-size:13px; font-weight:600; padding:6px 8px; text-align:center; }
        th.col .tag { display:block; font-weight:500; font-size:11px; margin-top:2px; }
        th.col .ov { color:#c0392b; } th.col .no { color:#2e7d32; }
        td.rowlabel { font-size:13px; font-weight:600; padding:0 12px 0 4px; text-align:right; white-space:nowrap; }
        td.rowlabel .win { display:block; font-size:11px; color:#8e44ad; font-weight:600; }
        td.cell { padding:5px; }
        .frame { width:${CELL_W}px; height:${CELL_H}px; background: var(--paper);
                 border:1px solid #ddd; border-radius:8px; overflow:hidden;
                 box-shadow: inset 0 0 0 1px rgba(0,0,0,0.02); }
        .frame img { width:100%; height:100%; display:block; }
        tr.winner td.cell .frame { border-color:#8e44ad; box-shadow:0 0 0 2px rgba(142,68,173,.35); }
      </style></head><body>
        <h1>${title} — brush variant contact sheet</h1>
        <div class="sub">Rows = render variants · columns = example drawings · rendered through the real engine on paper. ★ = shipped winner.</div>
        <table>
          <thead><tr><th></th>${DRAWINGS.map(
            (d) =>
              `<th class="col">${d.name}<span class="tag ${d.overlap ? 'ov' : 'no'}">${
                d.overlap ? 'overlapping' : 'no overlap'
              }</span></th>`
          ).join('')}</tr></thead>
          <tbody>${VARIANTS[brush]
            .map(
              (variant, ri) =>
                `<tr class="${variant.winner ? 'winner' : ''}"><td class="rowlabel">${
                  variant.label
                }${variant.winner ? '<span class="win">★ shipped</span>' : ''}</td>${grid[ri]
                  .map((url) => `<td class="cell"><div class="frame"><img src="${url}"></div></td>`)
                  .join('')}</tr>`
            )
            .join('')}</tbody>
        </table>
      </body></html>`;

      await page.setContent(html, { waitUntil: 'networkidle' });
      const table = page.locator('body');
      await table.screenshot({ path: join(outDir, `contact-${brush}.png`) });
      // Restore the harness for the next brush.
      await page.goto(`${base}dev/engine`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__engineReady === true);
      await page.evaluate(([w, h]) => window.__engine.resizeTo(w, h), [CELL_W, CELL_H]);
    }
  } finally {
    await browser.close();
    stop();
  }
  console.log(`\nContact sheets: ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
