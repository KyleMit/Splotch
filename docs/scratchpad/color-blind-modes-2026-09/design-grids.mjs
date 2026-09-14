// Designs one hex-picker grid per vision deficiency and writes grids.json.
// Run from the repo root: node docs/scratchpad/color-blind-modes-2026-09/design-grids.mjs
//
// A dichromat sees two dimensions: lightness and one chromatic axis (blue–yellow
// for protan/deutan, red–teal for tritan). So each grid is laid out on exactly
// those two: rows are lightness steps, columns are steps along the surviving
// axis, both measured on the SIMULATED color. For every cell the whole sRGB
// gamut is searched for real colors that land there when simulated, and each
// column is held to one hue family so the parent sees a coherent ramp. Cells
// the gamut cannot reach are dropped, which trims the light end of the blue
// side and the dark end of the yellow side rather than punching interior holes.
import { writeFileSync } from 'node:fs';
import {
  DEFICIENCIES,
  deltaE,
  gridSwatches,
  loadHexFamilies,
  rgbToHex,
  rgbToLab,
  simulate,
} from './cvd-lib.mjs';

const POOL_STEP = 6;
const ROW_LIGHTNESS = [95, 85, 75, 65, 55, 45, 35, 25, 15];
// Columns are fractions of the axis range the gamut reaches AT THAT LIGHTNESS,
// not fixed axis positions: vivid yellow exists only when light and dark yellow
// is olive, so a yellow column has to slide inward as the rows darken, and the
// same holds for every hue at the gamut edge. 0 is neutral; ±1 would be the
// very edge, where the tolerance search finds nothing.
const COLUMN_FRACTIONS = [-0.95, -0.5, 0, 0.5, 0.95];
const RANGE_PERCENTILE = 0.01;
const CELL_TOLERANCE_DE = 4;
const HUE_WINDOW_DEG = 50;
// A column's hue may drift this far between neighbouring rows: on the gamut
// edge one column runs yellow, orange, red, maroon top to bottom, which the
// child sees as a single yellow-to-brown ramp and a parent reads as a warm
// family. Bigger jumps would let a column flip family mid-ramp.
const HUE_DRIFT_PER_ROW_DEG = 30;
// Candidates are eligible within CELL_TOLERANCE_DE of the target and ranked
// partly by how close they sit, so neighbouring columns don't both lean toward
// each other and end up closer than the floor.
const TARGET_DISTANCE_WEIGHT = 2;
const NEUTRAL_MAX_CHROMA = 7;
// Score for a candidate original: vivid for the parent, but docked one-for-one
// for how far its appearance drifts between parent and child, with vividness
// capped so neon never wins on chroma alone (a neon magenta the child sees as
// plain blue scores below a blue that both see the same way).
const AGREEMENT_WEIGHT = 0.4;
const CHROMA_CAP = 60;
const ROW_FILLED_BONUS = 25;
const MIN_CELLS_PER_COLUMN = 3;
const MIN_CROSS_COLUMN_DE = 12;
const CRAYON_COUNT = 15;

const toRgb = (r, g, b) => [r / 255, g / 255, b / 255];
const levels = [];
for (let v = 0; v < 256; v += POOL_STEP) levels.push(v);
if (levels.at(-1) !== 255) levels.push(255);

const pool = [];
for (const r of levels)
  for (const g of levels)
    for (const b of levels) {
      const rgb = toRgb(r, g, b);
      const hex = rgbToHex(rgb);
      const lab = rgbToLab(rgb);
      const chroma = Math.hypot(lab[1], lab[2]);
      const hue = ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360;
      pool.push({ hex, lab, chroma, hue, sim: {} });
    }
for (const vision of DEFICIENCIES)
  for (const color of pool) color.sim[vision] = rgbToLab(simulate(color.hex, vision));

function chromaticAxis(vision) {
  let saa = 0,
    sbb = 0,
    sab = 0;
  for (const c of pool) {
    const [, a, b] = c.sim[vision];
    saa += a * a;
    sbb += b * b;
    sab += a * b;
  }
  const angle = 0.5 * Math.atan2(2 * sab, saa - sbb);
  let u = [Math.cos(angle), Math.sin(angle)];
  const wantPositive = vision === 'tritan' ? u[0] : u[1];
  if (wantPositive < 0) u = [-u[0], -u[1]];
  return u;
}

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function designGrid(vision) {
  const u = chromaticAxis(vision);
  const project = (lab) => ({
    L: lab[0],
    t: lab[1] * u[0] + lab[2] * u[1],
    off: -lab[1] * u[1] + lab[2] * u[0],
  });
  const projected = pool.map((c) => ({
    ...c,
    p: project(c.sim[vision]),
    disagreement: deltaE(c.lab, c.sim[vision]),
  }));
  const rangeAt = ROW_LIGHTNESS.map((L) => {
    const ts = projected
      .filter((c) => Math.abs(c.p.L - L) <= CELL_TOLERANCE_DE)
      .map((c) => c.p.t)
      .sort((a, b) => a - b);
    return {
      lo: ts[Math.floor(ts.length * RANGE_PERCENTILE)],
      hi: ts[Math.floor(ts.length * (1 - RANGE_PERCENTILE))],
    };
  });
  const targets = COLUMN_FRACTIONS;
  const targetAt = (rowIndex, fraction) => {
    const { lo, hi } = rangeAt[rowIndex];
    return fraction < 0 ? -fraction * lo : fraction * hi;
  };

  // Matched on lightness and axis position only: the small off-axis residual is
  // the dichromat surface curving away from the fitted line, not a direction
  // the child can see, and the proximity pass below still measures full ΔE.
  const candidatesFor = (L, t) =>
    projected.filter((c) => Math.hypot(c.p.L - L, c.p.t - t) <= CELL_TOLERANCE_DE);

  const chosenHues = [];
  // Neutral first so its hue never counts as crowding, then outward from it.
  const order = [...targets].sort((a, b) => Math.abs(a) - Math.abs(b));
  const byTarget = new Map();
  for (const t of order) byTarget.set(t, buildColumn(t));
  const columns = targets.map((t) => byTarget.get(t));
  function buildColumn(t) {
    const rows = ROW_LIGHTNESS.map((L, rowIndex) => candidatesFor(L, targetAt(rowIndex, t)));
    if (t === 0) {
      return {
        t,
        hueCenter: null,
        cells: rows.map((cands) => {
          const neutrals = cands.filter((c) => c.chroma <= NEUTRAL_MAX_CHROMA);
          if (!neutrals.length) return null;
          return neutrals.reduce((best, c) => (c.chroma < best.chroma ? c : best));
        }),
      };
    }
    const score = (c, L, target) =>
      Math.min(c.chroma, CHROMA_CAP) -
      AGREEMENT_WEIGHT * c.disagreement -
      TARGET_DISTANCE_WEIGHT * Math.hypot(c.p.L - L, c.p.t - target);
    // Viterbi over hue-window centers: each row picks its best candidate inside
    // the window, and the path of centers may only drift HUE_DRIFT_PER_ROW_DEG
    // between rows.
    const centers = Array.from({ length: 36 }, (_, i) => i * 10);
    const rowBest = rows.map((cands, rowIndex) =>
      centers.map((center) => {
        const L = ROW_LIGHTNESS[rowIndex];
        const target = targetAt(rowIndex, t);
        const inWindow = cands.filter(
          (c) => hueDistance(c.hue, center) <= HUE_WINDOW_DEG / 2 && c.chroma > NEUTRAL_MAX_CHROMA
        );
        if (!inWindow.length) return { pick: null, value: 0 };
        const pick = inWindow.reduce((b, c) => (score(c, L, target) > score(b, L, target) ? c : b));
        return { pick, value: score(pick, L, target) + ROW_FILLED_BONUS };
      })
    );
    let dp = rowBest[0].map((cell) => ({ total: cell.value, path: [0] }));
    dp = dp.map((d, i) => ({ total: d.total, path: [i] }));
    for (let r = 1; r < rows.length; r++) {
      dp = centers.map((center, i) => {
        let best = null;
        for (let j = 0; j < centers.length; j++) {
          if (hueDistance(centers[j], center) > HUE_DRIFT_PER_ROW_DEG) continue;
          const total = dp[j].total + rowBest[r][i].value;
          if (!best || total > best.total) best = { total, path: [...dp[j].path, i] };
        }
        return best;
      });
    }
    const end = dp.reduce((b, d) => (d.total > b.total ? d : b));
    const picks = end.path.map((i, r) => rowBest[r][i].pick);
    const hueCenter = centers[end.path[Math.floor(end.path.length / 2)]];
    chosenHues.push(hueCenter);
    return { t, hueCenter, cells: picks };
  }
  for (const col of columns)
    if (col.cells.filter(Boolean).length < MIN_CELLS_PER_COLUMN)
      col.cells = col.cells.map(() => null);
  // The lightest neutral is white itself: it is a real color on dark paper and
  // the app's grey ramp starts there.
  const neutral = columns.find((c) => c.t === 0);
  if (neutral.cells[0]) neutral.cells[0] = projected.find((c) => c.hex === '#ffffff');

  // Enforce the cross-column floor: any two cells in different columns must
  // stay apart under the simulation; the lower-scoring one of a close pair goes.
  const cellList = [];
  columns.forEach((col, ci) => col.cells.forEach((c, ri) => c && cellList.push({ ci, ri, c })));
  let dropped = 0;
  for (let i = 0; i < cellList.length; i++)
    for (let j = i + 1; j < cellList.length; j++) {
      const A = cellList[i],
        B = cellList[j];
      if (!A.c || !B.c || A.ci === B.ci) continue;
      if (deltaE(A.c.sim[vision], B.c.sim[vision]) < MIN_CROSS_COLUMN_DE) {
        // The neutral column is never the one to go: white and black are the
        // paper-and-ink pair every grid needs.
        const neutralIndex = targets.indexOf(0);
        const loser =
          A.ci === neutralIndex ? B : B.ci === neutralIndex ? A : A.c.chroma < B.c.chroma ? A : B;
        columns[loser.ci].cells[loser.ri] = null;
        loser.c = null;
        dropped++;
      }
    }

  const cells = [];
  columns.forEach((col, ci) =>
    col.cells.forEach((c, ri) => {
      if (!c) return;
      cells.push({
        column: ci,
        row: ri,
        hex: c.hex,
        seen: rgbToHex(simulate(c.hex, vision)),
        simLab: c.sim[vision],
        lab: c.lab,
        chroma: c.chroma,
      });
    })
  );
  const liveColumns = [...new Set(cells.map((c) => c.column))];
  const columnIndex = new Map(liveColumns.map((ci, i) => [ci, i]));
  for (const cell of cells) cell.column = columnIndex.get(cell.column);

  // Worst separations, for the report: across columns, and between rows that
  // are not neighbours in the same column (neighbours are the ramp).
  let worstCross = Infinity,
    worstCrossPair = null;
  for (let i = 0; i < cells.length; i++)
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i],
        b = cells[j];
      if (a.column === b.column && Math.abs(a.row - b.row) <= 1) continue;
      const d = deltaE(a.simLab, b.simLab);
      if (d < worstCross) {
        worstCross = d;
        worstCrossPair = [a.hex, b.hex];
      }
    }

  const crayons = pickCrayons(cells);
  return {
    vision,
    axis: u,
    columnFractions: liveColumns.map((ci) => targets[ci]),
    columnHueCenters: liveColumns.map((ci) => columns[ci].hueCenter),
    rowLightness: ROW_LIGHTNESS,
    cells: cells.map(({ column, row, hex, seen }) => ({ column, row, hex, seen })),
    crayons,
    stats: {
      cellCount: cells.length,
      columnCount: liveColumns.length,
      droppedForProximity: dropped,
      worstNonNeighbourDe: +worstCross.toFixed(1),
      worstPair: worstCrossPair,
    },
  };
}

// Farthest-point pick of CRAYON_COUNT grid cells under the simulation, seeded
// with the darkest neutral (black ink) so the bar always has its outline color.
function pickCrayons(cells) {
  const byRow = [...cells].sort((a, b) => b.row - a.row);
  const black = byRow.find((c) => c.chroma <= NEUTRAL_MAX_CHROMA) ?? byRow[0];
  const chosen = [black];
  const rest = cells.filter((c) => c !== black && !(c.chroma <= NEUTRAL_MAX_CHROMA && c.row === 0));
  while (chosen.length < CRAYON_COUNT && rest.length) {
    let bestIdx = -1,
      bestGap = -1;
    rest.forEach((c, i) => {
      const gap = Math.min(...chosen.map((k) => deltaE(k.simLab, c.simLab)));
      if (gap > bestGap) {
        bestGap = gap;
        bestIdx = i;
      }
    });
    chosen.push(rest.splice(bestIdx, 1)[0]);
  }
  return chosen
    .sort((a, b) => a.column - b.column || a.row - b.row)
    .map(({ hex, seen }) => ({ hex, seen }));
}

const grids = Object.fromEntries(DEFICIENCIES.map((v) => [v, designGrid(v)]));
const today = gridSwatches(loadHexFamilies()).map((s) => ({
  family: s.family,
  shade: s.shade,
  hex: s.hex,
  seen: Object.fromEntries(DEFICIENCIES.map((v) => [v, rgbToHex(simulate(s.hex, v))])),
}));
writeFileSync(
  new URL('grids.json', import.meta.url),
  JSON.stringify({ grids, today }, null, 2) + '\n'
);
for (const v of DEFICIENCIES) {
  const g = grids[v];
  console.log(
    `${v}: ${g.stats.cellCount} cells in ${g.stats.columnCount} columns (fractions ${g.columnFractions.join(', ')}; hue centers ${g.columnHueCenters.join(', ')}); dropped ${g.stats.droppedForProximity}; worst non-neighbour ΔE ${g.stats.worstNonNeighbourDe} (${g.stats.worstPair})`
  );
  for (let r = 0; r < ROW_LIGHTNESS.length; r++)
    console.log(
      '  L' + String(ROW_LIGHTNESS[r]).padStart(2),
      g.columnFractions
        .map((_, c) => g.cells.find((x) => x.row === r && x.column === c)?.hex ?? '   ·   ')
        .join(' ')
    );
}
