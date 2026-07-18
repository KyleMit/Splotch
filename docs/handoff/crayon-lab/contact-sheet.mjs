// Build the committed crayon-iteration contact sheet for the handoff. Composites
// the per-variant battery renders (captured by perf:brush across the design
// rounds, saved under perf-profiles/) plus the Gemini references and the final
// v12 design scenes into one labelled PNG — via an HTML grid screenshotted with
// Playwright (no ImageMagick in the container).
//
//   node crayon-lab/contact-sheet.mjs
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT, chromiumExecutablePath } from '../scripts/lib/utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'docs/handoff');
mkdirSync(OUT, { recursive: true });

const dataUri = (path) =>
  existsSync(path) ? `data:image/png;base64,${readFileSync(path).toString('base64')}` : null;
const pp = (rel) => join(ROOT, 'perf-profiles', rel);
const lab = (name) => join(HERE, 'out', name);

// One render per design-iteration variant (same synthetic battery), captured
// across the perf:brush runs, with the one-line verdict from ADR-0065.
const journey = [
  ['v1', 'plain solid — pen baseline', pp('2026-07-18T12-06-51-563Z-brush-crayon/crayon-v1.png')],
  [
    'v2',
    'jittered multi-pass — 1st shipped; periodic beads + blurry',
    pp('2026-07-18T12-06-51-563Z-brush-crayon/crayon-v2.png'),
  ],
  [
    'v3',
    'offscreen grain-stamp — near-solid, 20–70× slower',
    pp('2026-07-18T12-06-51-563Z-brush-crayon/crayon-v3.png'),
  ],
  ['v4', 'tinted-grain pattern — flat', pp('2026-07-18T12-06-51-563Z-brush-crayon/crayon-v4.png')],
  [
    'v5',
    'canvas-anchored pattern — periodic tile',
    pp('2026-07-18T13-49-50-298Z-brush-crayon/crayon-v5.png'),
  ],
  [
    'v6',
    'offscreen ragged dest-out — expensive',
    pp('2026-07-18T13-49-50-298Z-brush-crayon/crayon-v6.png'),
  ],
  ['v7', 'stippled scumble', pp('2026-07-18T13-49-50-298Z-brush-crayon/crayon-v7.png')],
  [
    'v8',
    'waxy stipple — approved look…',
    pp('2026-07-18T13-59-59-638Z-brush-crayon/crayon-v8.png'),
  ],
  [
    'v9',
    'fast pattern — 96px tile repeat (autocorrelation)',
    pp('2026-07-18T14-09-27-205Z-brush-crayon/crayon-v9.png'),
  ],
  [
    'v10',
    'two coprime tiles — WORSE periodicity',
    pp('2026-07-18T14-20-15-562Z-brush-crayon/crayon-v10.png'),
  ],
  [
    'v11',
    'coarse hashed wax — shipped, then "gritty/starburst/snap"',
    pp('2026-07-18T14-27-35-513Z-brush-crayon/crayon-v11.png'),
  ],
  [
    'v12',
    'WINNER — wax body + tooth holes (offscreen)',
    pp('2026-07-18T16-03-23-241Z-brush-crayon/crayon-v12.png'),
  ],
];

const refs = [
  ['REF single', 'real crayon (Gemini) — target', lab('ref-single.png')],
  ['REF overlap', 'real crayon — buildup target', lab('ref-overlap.png')],
  ['REF scribble', 'real crayon — fill target', lab('ref-scribble.png')],
];
const scenes = [
  ['v12 single', 'waxy body, fine tooth, contained', lab('v12-single.png')],
  ['v12 doubled', 'same stroke ×2 → fills to solid, same hue (BUILDUP)', lab('v12-doubled.png')],
  ['v12 cross', 'two strokes cross → denser at same hue', lab('v12-cross.png')],
];

const cell = ([tag, cap, path]) => {
  const uri = dataUri(path);
  const img = uri ? `<img src="${uri}">` : `<div class="missing">missing</div>`;
  return `<figure><div class="tag">${tag}</div>${img}<figcaption>${cap}</figcaption></figure>`;
};

const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; padding: 24px; background: #fff; font: 13px system-ui, sans-serif; color: #111; width: 1500px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 10px; color: #444; }
  p.sub { margin: 0 0 8px; color: #666; }
  .grid { display: grid; gap: 12px; }
  .g4 { grid-template-columns: repeat(4, 1fr); }
  .g3 { grid-template-columns: repeat(3, 1fr); }
  figure { margin: 0; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #fafafa; }
  figure img { display: block; width: 100%; height: 150px; object-fit: cover; object-position: center; background: #f2f2f2; }
  .missing { height: 150px; display: grid; place-items: center; color: #b00; }
  .tag { font-weight: 700; padding: 5px 8px; background: #1f2937; color: #fff; }
  figcaption { padding: 6px 8px; color: #333; min-height: 32px; }
  .win .tag { background: #15803d; }
  .ref .tag { background: #7c3aed; }
</style>
<h1>Splotch crayon brush — design iteration (ADR-0065)</h1>
<p class="sub">Branch <code>claude/brush-modes-selector-z1rek0</code>. Each battery cell is the same synthetic strokes (squiggles + overlapping cluster + dashes) rendered by one variant. Only v1, v2, v12 remain in code; v3–v11 were pruned (history here + in the ADR).</p>
<h2>1 · Variant journey</h2>
<div class="grid g4">${journey.map((r) => `<div class="${r[0] === 'v12' ? 'win' : ''}">${cell(r)}</div>`).join('')}</div>
<h2>2 · Real-crayon references (Gemini image model) — the target look</h2>
<div class="grid g3">${refs.map((r) => `<div class="ref">${cell(r)}</div>`).join('')}</div>
<h2>3 · Final v12 against the acceptance scenes</h2>
<p class="sub">Buildup is the key: a single pass shows paper tooth; a second separate pass fills it toward solid at the SAME hue (coverage buildup, live — not multiply/darkening).</p>
<div class="grid g3">${scenes.map((r) => `<div class="win">${cell(r)}</div>`).join('')}</div>`;

const browser = await chromium.launch({
  headless: true,
  executablePath: chromiumExecutablePath(chromium),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1548, height: 1400 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(200);
  const out = join(OUT, 'crayon-iterations-contact-sheet.png');
  await page.locator('body').screenshot({ path: out });
  console.log('wrote', out);
} finally {
  await browser.close();
}
