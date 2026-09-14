// Renders grids.html from grids.json: the proposed picker grid and crayon bar
// per deficiency, with a switch between the colors as authored and as a child
// with that deficiency sees them, and today's 9×9 under the same switch.
// Run from the repo root: node docs/scratchpad/color-blind-modes-2026-09/grids-sheet.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const { grids, today } = JSON.parse(readFileSync(new URL('grids.json', import.meta.url), 'utf8'));

const VISION_META = {
  protan: {
    name: 'Protanopia',
    short: 'Protan',
    cones: 'no L cone',
    left: 'blue',
    right: 'yellow',
  },
  deutan: {
    name: 'Deuteranopia',
    short: 'Deutan',
    cones: 'no M cone',
    left: 'blue',
    right: 'yellow',
  },
  tritan: { name: 'Tritanopia', short: 'Tritan', cones: 'no S cone', left: 'teal', right: 'red' },
};
const VISIONS = Object.keys(VISION_META);
const TODAY_FAMILIES = [...new Set(today.map((s) => s.family))];

const hex = (orig, seen, extra = '') =>
  `<span class="hex${extra}" style="--orig:${orig};--seen:${seen}" title="${orig} → ${seen}"></span>`;

function proposedGrid(vision) {
  const g = grids[vision];
  const rows = g.rowLightness.map((L, r) => {
    const cells = g.columnFractions.map((_, c) => {
      const cell = g.cells.find((x) => x.row === r && x.column === c);
      return cell ? hex(cell.hex, cell.seen) : '<span class="hex empty"></span>';
    });
    return `<div class="hrow"><span class="rowlabel">L ${L}</span>${cells.join('')}</div>`;
  });
  return `<div class="honeycomb main">${rows.join('')}</div>`;
}

function crayonBar(vision) {
  return `<div class="crayons">${grids[vision].crayons
    .map(
      (c) =>
        `<span class="crayon" style="--orig:${c.hex};--seen:${c.seen}" title="${c.hex} → ${c.seen}"></span>`
    )
    .join('')}</div>`;
}

function todayGrid(vision) {
  const rows = [];
  for (let shade = 1; shade <= 9; shade++) {
    const cells = TODAY_FAMILIES.map((family) => {
      const s = today.find((x) => x.family === family && x.shade === shade);
      return hex(s.hex, s.seen[vision]);
    });
    rows.push(`<div class="hrow">${cells.join('')}</div>`);
  }
  return `<div class="honeycomb small">${rows.join('')}</div>`;
}

const panels = VISIONS.map((v) => {
  const m = VISION_META[v];
  const s = grids[v].stats;
  return `<section class="panel" data-vision="${v}" hidden>
  <div class="card">
    <div class="card-head">
      <div><span class="eyebrow">${m.name} · ${m.cones}</span><h2>Picker grid</h2></div>
      <p class="stat"><b>${s.cellCount}</b> colors in <b>${s.columnCount}</b> columns · every non-neighbouring pair stays ΔE&nbsp;≥&nbsp;<b>${s.worstNonNeighbourDe}</b> apart as the child sees it</p>
    </div>
    <div class="axis"><span>${m.left} side</span><span>neutral</span><span>${m.right} side</span></div>
    ${proposedGrid(v)}
    <p class="note">Rows are lightness steps, columns are steps along the one color axis this vision keeps. Missing cells are colors the screen cannot make at that lightness, so the shape follows the gamut rather than punching holes.</p>
  </div>
  <div class="card">
    <div class="card-head"><div><span class="eyebrow">${m.name}</span><h2>Crayon bar</h2></div><p class="stat">15 picks from the grid, farthest-apart first, black ink seeded</p></div>
    ${crayonBar(v)}
  </div>
  <div class="card muted">
    <div class="card-head"><div><span class="eyebrow">For comparison</span><h2>Today's 9 × 9 under ${m.name.toLowerCase()}</h2></div><p class="stat">the same switch applies</p></div>
    ${todayGrid(v)}
  </div>
</section>`;
}).join('\n');

const html = `<title>Splotch Color-Vision Grids</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Quicksand:wght@600;700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root {
    --bg: #f6f5f1; --ink: #1f1e26; --muted: #6d6b78; --rule: #dcdad3; --card: #fbfaf7; --card-muted: #f1efe9;
    --control: #ecebe5; --control-on: #1f1e26; --control-on-ink: #fbfaf7; --focus: #7a74e7;
    --display: 'Quicksand', 'Avenir Next', system-ui, sans-serif;
    --body: 'IBM Plex Sans', system-ui, sans-serif;
    --mono: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #17171d; --ink: #ecebf0; --muted: #9a99a6; --rule: #2d2c36; --card: #1f1f27; --card-muted: #1b1b22; --control: #2a2a33; --control-on: #ecebf0; --control-on-ink: #17171d; } }
  :root[data-theme="dark"] { --bg: #17171d; --ink: #ecebf0; --muted: #9a99a6; --rule: #2d2c36; --card: #1f1f27; --card-muted: #1b1b22; --control: #2a2a33; --control-on: #ecebf0; --control-on-ink: #17171d; }
  body { background: var(--bg); color: var(--ink); font-family: var(--body); font-size: 15px; line-height: 1.5; padding-block: 36px 64px; padding-inline: max(16px, 4vw); }
  header { max-width: 66ch; display: grid; gap: 10px; margin-bottom: 24px; }
  h1 { font-family: var(--display); font-weight: 700; font-size: clamp(28px, 4vw, 38px); line-height: 1.1; margin: 0; text-wrap: balance; }
  h2 { font-family: var(--display); font-weight: 700; font-size: 20px; margin: 2px 0 0; }
  .eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  p { margin: 0; color: var(--muted); max-width: 66ch; }
  .controls { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 12px 28px; align-items: center; padding-block: 12px; margin-bottom: 20px; background: var(--bg); border-bottom: 1px solid var(--rule); }
  .group { display: flex; align-items: center; gap: 10px; }
  .group-label { font-family: var(--display); font-weight: 600; font-size: 13px; color: var(--muted); }
  .seg { display: inline-flex; background: var(--control); border-radius: 999px; padding: 3px; gap: 2px; }
  .seg button { font: inherit; font-family: var(--display); font-weight: 600; font-size: 14px; color: var(--ink); background: transparent; border: 0; border-radius: 999px; padding: 6px 14px; cursor: pointer; transition: background-color 160ms ease, color 160ms ease; }
  .seg button[aria-pressed="true"] { background: var(--control-on); color: var(--control-on-ink); }
  .seg button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .kbd { font-family: var(--mono); font-size: 12px; color: var(--muted); }
  .panel { display: grid; gap: 18px; }
  .panel[hidden] { display: none; }
  .card { background: var(--card); border: 1px solid var(--rule); border-radius: 16px; padding: 18px 20px 20px; }
  .card.muted { background: var(--card-muted); }
  .card-head { display: flex; justify-content: space-between; align-items: end; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
  .stat { font-size: 13px; }
  .stat b { color: var(--ink); font-weight: 500; font-variant-numeric: tabular-nums; }
  .axis { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); width: max-content; min-width: calc(var(--w) * 5 + 3.6rem); margin-left: 3.2rem; margin-bottom: 8px; --w: 52px; }
  .honeycomb { --w: 52px; display: grid; width: max-content; max-width: 100%; }
  .honeycomb.small { --w: 30px; }
  .hrow { display: flex; align-items: center; margin-top: calc(var(--w) * -0.29); }
  .hrow:first-child { margin-top: 0; }
  .hrow:nth-child(even) { --shift: calc(var(--w) / 2); }
  .rowlabel + .hex, .small .hrow > .hex:first-child { margin-left: var(--shift, 0px); }
  .rowlabel { width: 3.2rem; font-family: var(--mono); font-size: 11px; color: var(--muted); flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .hex { position: relative; width: var(--w); height: calc(var(--w) * 1.155); flex-shrink: 0; margin-right: 1px; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); background: var(--orig); transition: background-color 380ms ease; }
  .hex.empty { background: transparent; }
  body.simulated .hex, body.simulated .crayon { background: var(--seen); }
  .crayons { display: flex; flex-wrap: wrap; gap: 10px; }
  .crayon { width: 44px; height: 44px; border-radius: 50%; background: var(--orig); box-shadow: 0 2px 5px rgb(0 0 0 / 18%); transition: background-color 380ms ease; }
  .note { font-size: 13px; margin-top: 12px; }
  footer { margin-top: 32px; padding-top: 18px; border-top: 1px solid var(--rule); display: grid; gap: 8px; }
  code { font-family: var(--mono); font-size: 0.92em; }
  @media (prefers-reduced-motion: reduce) { .hex, .crayon, .seg button { transition: none; } }
  @media (max-width: 560px) { .honeycomb.main { --w: 38px; } .axis { --w: 38px; } .controls { gap: 10px 16px; } }
</style>
<header>
  <span class="eyebrow">Splotch · color-blind modes spike · September 2026</span>
  <h1>The picker grids that would ship, per color vision</h1>
  <p>Each grid is laid out on the two dimensions that vision keeps: lightness down the rows, and the one surviving color axis across the columns. Every cell is a real, vivid color chosen because it lands on that spot when simulated, and no two non-neighbouring cells come within ΔE&nbsp;12 of each other as the child sees them. Flip the switch to see the same cells through the child's eyes.</p>
</header>
<div class="controls" role="toolbar" aria-label="View options">
  <div class="group"><span class="group-label">Vision</span>
    <div class="seg" id="visionSeg">${VISIONS.map((v, i) => `<button type="button" id="vision-${v}" data-vision="${v}" aria-pressed="${i === 0}">${VISION_META[v].name}</button>`).join('')}</div>
  </div>
  <div class="group"><span class="group-label">Show</span>
    <div class="seg" id="viewSeg"><button type="button" id="view-original" data-view="original" aria-pressed="true">Original colors</button><button type="button" id="view-simulated" data-view="simulated" aria-pressed="false">As the child sees it</button></div>
    <span class="kbd">space toggles</span>
  </div>
</div>
${panels}
<footer>
  <p>Built by <code>design-grids.mjs</code> in <code>docs/scratchpad/color-blind-modes-2026-09/</code>: the sRGB gamut is sampled every 6 levels, simulated with the Machado et al. (2009) dichromacy matrices, and projected onto each vision's principal color axis. Columns sit at fixed fractions of the axis range the gamut reaches at each lightness, which is why the warm column runs yellow through orange to maroon: those are one ramp to a red-green-blind child. Within a column the hue may drift 30° per row, so each column stays one family for a parent. Candidates are scored by vividness (capped), docked for how far their appearance drifts between parent and child, and the neutral column always keeps white and black.</p>
  <p>Hover any cell for its authored hex and simulated hex. The simulation is full dichromacy, the worst case; most affected children see somewhat more difference than shown.</p>
</footer>
<script>
  (function () {
    var body = document.body;
    var state = { vision: 'protan', simulated: false };
    try {
      var saved = JSON.parse(localStorage.getItem('splotch-cvd-grids') || 'null');
      if (saved && saved.vision && document.querySelector('.panel[data-vision="' + saved.vision + '"]')) state = saved;
    } catch (e) {}
    function render() {
      document.querySelectorAll('.panel').forEach(function (p) { p.hidden = p.dataset.vision !== state.vision; });
      document.querySelectorAll('#visionSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.vision === state.vision)); });
      body.classList.toggle('simulated', state.simulated);
      document.querySelectorAll('#viewSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String((b.dataset.view === 'simulated') === state.simulated)); });
      try { localStorage.setItem('splotch-cvd-grids', JSON.stringify(state)); } catch (e) {}
    }
    document.getElementById('visionSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; state.vision = b.dataset.vision; render();
    });
    document.getElementById('viewSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; state.simulated = b.dataset.view === 'simulated'; render();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); state.simulated = !state.simulated; render(); }
    });
    render();
  })();
</script>
`;
writeFileSync(new URL('grids.html', import.meta.url), html);
console.log('wrote grids.html');
