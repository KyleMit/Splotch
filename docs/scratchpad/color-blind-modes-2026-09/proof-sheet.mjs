// Renders proof-sheet.html: both Splotch palettes as a person with normal,
// protan, deutan or tritan vision would see them, with each hex badged by how
// many OTHER-family hexes it becomes confusable with, plus the reduced
// red-green grid the README proposes. Run from the repo root:
//   node docs/scratchpad/color-blind-modes-2026-09/proof-sheet.mjs
import { writeFileSync } from 'node:fs';
import {
  DEFICIENCIES,
  deltaE,
  gridSwatches,
  labOf,
  loadCrayonPalette,
  loadHexFamilies,
  rgbToHex,
  simulate,
} from './cvd-lib.mjs';

const CONFUSABLE_DE = 10;
const VISIONS = ['normal', ...DEFICIENCIES];
const VISION_TITLES = {
  normal: 'Typical vision',
  protan: 'Protanopia (no L cone)',
  deutan: 'Deuteranopia (no M cone)',
  tritan: 'Tritanopia (no S cone)',
};
// The whole-family subset the README proposes for the mode: the largest set
// whose every pair stays ΔE ≥ 10 apart under protan, deutan AND tritan
// simulation at once (audit.out.txt, "Largest set of whole families"). It keeps
// the same worst-pair margin as the red-green-only answer, so covering tritan
// costs nothing.
const MODE_FAMILIES = ['yellows', 'greens', 'purples', 'greys'];
// The greedy "one crayon set for all three deficiencies" result from the audit,
// as a feasibility exhibit, not a curated palette (audit.out.txt, last section).
const UNIVERSAL_CRAYONS = [
  '#AB71E1',
  '#4FC4C0',
  '#8CC864',
  '#BEDD40',
  '#B5835A',
  '#0a0b10',
  '#D62828',
  '#6A040F',
  '#F77F00',
  '#2D6A4F',
  '#023E8A',
  '#03045E',
  '#E0AAFF',
  '#7209B7',
  '#FFFFFF',
];

const crayons = loadCrayonPalette();
const families = loadHexFamilies();
const grid = gridSwatches(families);

const seen = (hex, vision) => rgbToHex(simulate(hex, vision));

function crossFamilyCollisions(vision, swatches) {
  const labs = swatches.map((s) => labOf(s.hex, vision));
  return swatches.map((s, i) =>
    swatches.reduce(
      (count, other, j) =>
        count + (other.family !== s.family && deltaE(labs[i], labs[j]) < CONFUSABLE_DE ? 1 : 0),
      0
    )
  );
}

function crayonCollisions(vision, list) {
  const labs = list.map((c) => labOf(c.hex, vision));
  return list.map((_, i) =>
    list.reduce((n, __, j) => n + (i !== j && deltaE(labs[i], labs[j]) < CONFUSABLE_DE ? 1 : 0), 0)
  );
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function crayonRow(vision, list) {
  const hits = crayonCollisions(vision, list);
  return `<div class="crayon-row"><span class="row-label">${VISION_TITLES[vision]}</span><div class="crayons">${list
    .map(
      (c, i) =>
        `<span class="crayon${hits[i] ? ' hit' : ''}" style="--c:${seen(c.hex, vision)}" title="${esc(c.label)} ${c.hex} → ${seen(c.hex, vision)}">${hits[i] ? `<b>${hits[i]}</b>` : ''}</span>`
    )
    .join('')}</div></div>`;
}

function hexGrid(vision, keepFamilies = null) {
  const swatches = keepFamilies ? grid.filter((s) => keepFamilies.includes(s.family)) : grid;
  const shown = keepFamilies ? families.filter((f) => keepFamilies.includes(f.name)) : families;
  const hits = crossFamilyCollisions(vision, swatches);
  const hit = new Map(swatches.map((s, i) => [s.label, hits[i]]));
  const rows = [];
  for (let s = 0; s < 9; s++) {
    rows.push(
      `<div class="hrow${s % 2 ? ' offset' : ''}">${shown
        .map((f) => {
          const hex = f.shades[s];
          const n = hit.get(`${f.name}-${s + 1}`) ?? 0;
          return `<span class="hex${n ? ' hit' : ''}" style="--c:${seen(hex, vision)}" title="${f.name} ${s + 1} ${hex} → ${seen(hex, vision)}">${n ? `<b>${n}</b>` : ''}</span>`;
        })
        .join('')}</div>`
    );
  }
  const total = hits.filter(Boolean).length;
  return `<figure class="grid-fig"><figcaption><span>${VISION_TITLES[vision]}</span><span class="count">${total} of ${swatches.length} hexes collide across families</span></figcaption><div class="honeycomb">${rows.join('')}</div></figure>`;
}

const universal = UNIVERSAL_CRAYONS.map((hex) => ({ hex, label: hex }));

const html = `<title>Splotch Color-Vision Proof Sheet</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Quicksand:wght@600;700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root {
    --bg: #f6f5f1; --ink: #1f1e26; --muted: #6d6b78; --rule: #dcdad3; --card: #fbfaf7; --badge: #1f1e26; --badge-ink: #fff;
    --display: 'Quicksand', 'Avenir Next', system-ui, sans-serif;
    --body: 'IBM Plex Sans', system-ui, sans-serif;
    --mono: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #17171d; --ink: #ecebf0; --muted: #9a99a6; --rule: #2d2c36; --card: #1f1f27; --badge: #ecebf0; --badge-ink: #17171d; } }
  :root[data-theme="dark"] { --bg: #17171d; --ink: #ecebf0; --muted: #9a99a6; --rule: #2d2c36; --card: #1f1f27; --badge: #ecebf0; --badge-ink: #17171d; }
  body { background: var(--bg); color: var(--ink); font-family: var(--body); font-size: 15px; line-height: 1.5; padding-block: 40px 64px; padding-inline: max(16px, 4vw); }
  header { max-width: 66ch; display: grid; gap: 10px; margin-bottom: 40px; }
  h1 { font-family: var(--display); font-weight: 700; font-size: clamp(28px, 4vw, 40px); line-height: 1.1; margin: 0; text-wrap: balance; }
  h2 { font-family: var(--display); font-weight: 700; font-size: 22px; margin: 0 0 6px; }
  .eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  p { margin: 0; color: var(--muted); max-width: 66ch; }
  code { font-family: var(--mono); font-size: 0.92em; }
  section { border-top: 1px solid var(--rule); padding-block: 32px; display: grid; gap: 18px; }
  .crayon-row { display: grid; grid-template-columns: 13rem 1fr; align-items: center; gap: 12px; }
  .row-label { font-family: var(--display); font-weight: 600; font-size: 14px; }
  .crayons { display: flex; flex-wrap: wrap; gap: 8px; }
  .crayon { position: relative; width: 38px; height: 38px; border-radius: 50%; background: var(--c); box-shadow: 0 2px 5px rgb(0 0 0 / 18%); }
  .crayon b, .hex b { position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--mono); font-weight: 500; font-size: 12px; color: var(--badge-ink); }
  .crayon b::before, .hex b::before { content: ''; position: absolute; width: 18px; height: 18px; border-radius: 50%; background: var(--badge); z-index: -1; }
  .crayon b, .hex b { isolation: isolate; }
  .grids { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
  .grid-fig { margin: 0; background: var(--card); border: 1px solid var(--rule); border-radius: 14px; padding: 14px 16px 18px; }
  figcaption { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-family: var(--display); font-weight: 600; font-size: 14px; margin-bottom: 12px; }
  .count { font-family: var(--mono); font-weight: 400; font-size: 12px; color: var(--muted); }
  .honeycomb { --w: 30px; display: grid; gap: 0; width: max-content; }
  .hrow { display: flex; margin-top: calc(var(--w) * -0.29); }
  .hrow:first-child { margin-top: 0; }
  .hrow.offset { margin-left: calc(var(--w) / 2); }
  .hex { position: relative; width: var(--w); height: calc(var(--w) * 1.155); flex-shrink: 0; background: var(--c); clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); margin-right: 1px; }
  .hex b { font-size: 10px; }
  .hex b::before { width: 15px; height: 15px; }
  .legend { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; color: var(--muted); align-items: center; }
  .legend .crayon { width: 22px; height: 22px; box-shadow: none; }
  .legend .crayon b { font-size: 10px; } .legend .crayon b::before { width: 15px; height: 15px; }
  @media (max-width: 560px) { .crayon-row { grid-template-columns: 1fr; gap: 6px; } }
</style>
<header>
  <span class="eyebrow">Splotch · color-blind modes spike · September 2026</span>
  <h1>Both palettes, seen through three kinds of color blindness</h1>
  <p>Every swatch is passed through the Machado et al. (2009) dichromacy simulation, the model Chrome DevTools uses. A badge counts how many <em>other</em> swatches it lands within ΔE&nbsp;10 of under that vision, so a badged hex is one a child with that deficiency cannot reliably tell from something else on the grid. Same-family shade neighbours are not counted: a ramp is meant to be close.</p>
  <div class="legend"><span class="crayon" style="--c:#62A2E9"></span> distinct <span class="crayon hit" style="--c:#62A2E9"><b>3</b></span> confusable with 3 other swatches</div>
</header>

<section>
  <div><span class="eyebrow">Crayon bar · palette.ts · 15 swatches</span><h2>The crayon bar loses a third of its colors to red-green blindness</h2>
  <p>Badges here count any other crayon within ΔE 10. Purple, the default selection, becomes Magenta under protanopia and Blue under deuteranopia; Lime and Yellow merge under both.</p></div>
  ${VISIONS.map((v) => crayonRow(v, crayons)).join('')}
</section>

<section>
  <div><span class="eyebrow">Hex picker · hexPickerLayout.ts · 9 families × 9 shades, landscape arrangement</span><h2>Under red-green blindness five of the nine columns are the same column</h2>
  <p>Reds, oranges, greens, browns and pinks fold into one warm ramp; purples fold into blues; pinks fold into greys. These are the hexes "removing spots" would remove.</p></div>
  <div class="grids">${VISIONS.map((v) => hexGrid(v)).join('')}</div>
</section>

<section>
  <div><span class="eyebrow">Proposal · one mode · whole families, not holes</span><h2>The largest family set that stays apart under all three deficiencies: ${MODE_FAMILIES.join(', ')}</h2>
  <p>Four columns of nine shades, 36 hexes, found by exhaustive search over the 512 family subsets (audit.out.txt); its worst pair is as far apart as the best red-green-only set's, so covering tritanopia costs nothing. Dropping whole families keeps the honeycomb interlocked and lets the existing positional trim ladders run unchanged; punching per-hex holes would not.</p></div>
  <div class="grids">${VISIONS.map((v) => hexGrid(v, MODE_FAMILIES)).join('')}</div>
</section>

<section>
  <div><span class="eyebrow">Feasibility · one crayon set for every deficiency</span><h2>Fifteen existing Splotch colors stay ΔE ≥ 15 apart under all three simulations at once</h2>
  <p>A greedy pick from the current crayons and grid, not a curated palette: it includes white, which the crayon bar excludes on purpose, and leans on dark blues and reds. It shows a same-count swap is possible, so the crayon bar's trim ladders, types and layout would not need to change.</p></div>
  ${VISIONS.map((v) => crayonRow(v, universal)).join('')}
</section>
`;

writeFileSync(new URL('proof-sheet.html', import.meta.url), html);
console.log('wrote proof-sheet.html');
