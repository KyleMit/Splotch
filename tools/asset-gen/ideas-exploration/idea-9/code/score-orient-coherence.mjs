// EXPERIMENT (idea #9) — tall vs wide palette coherence for the same subject.
// The two orientations are separate drawings with separate fills, so regions
// don't correspond. Instead: build a subject-level color signature per
// orientation — a chroma-weighted circular hue histogram over interior
// (non-background, non-ink) fill pixels — and compare tall vs wide.
//
//   node tools/asset-gen/score-orient-coherence.mjs                 whole catalog, light + night
//   node tools/asset-gen/score-orient-coherence.mjs creatures       one category
//   node tools/asset-gen/score-orient-coherence.mjs creatures/dragon
//   node tools/asset-gen/score-orient-coherence.mjs --json
//   node tools/asset-gen/score-orient-coherence.mjs --wide-file <path> creatures/dragon
//     score one page with an alternate wide LIGHT image (e.g. a fresh take)
//
// Metrics per pair, per mode (light/night):
//   emdDeg    circular earth-mover's distance between the two normalized hue
//             histograms, in degrees of average hue transport (0 = identical
//             palette mix, bigger = more chromatic mass living in different
//             hue families).
//   mismatch  fraction of chromatic mass with NO counterpart within ~35 deg on
//             the other side (after circular smearing) — "how much of the
//             subject's color has no match in the sibling".
// Rank by emdDeg. Top hue families reported per side for human reading.
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { glob } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { dilateMask } from './lib/morphology.mjs';

const W = 512;
const INK_DARK = 128;
const INK_CLEAR = 2;
const MIN_REGION_PX = 60;
const MIN_CHROMA = 22;
const BINS = 36; // 10 deg per bin
const SMEAR_BINS = 3; // +/-30..35 deg tolerance for the mismatch metric

const HUE_NAMES = [
  [15, 'red'],
  [45, 'orange'],
  [70, 'yellow'],
  [95, 'yellow-green'],
  [150, 'green'],
  [200, 'cyan'],
  [260, 'blue'],
  [300, 'purple'],
  [345, 'magenta'],
  [360, 'red'],
];
const hueName = (h) => HUE_NAMES.find(([max]) => h < max)[1];

function rgbToHueChroma(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const c = mx - mn;
  if (c === 0) return { hue: 0, chroma: 0 };
  let h;
  if (mx === r) h = ((g - b) / c + 6) % 6;
  else if (mx === g) h = (b - r) / c + 2;
  else h = (r - g) / c + 4;
  return { hue: h * 60, chroma: c };
}

async function rawGray(buf) {
  return sharp(buf)
    .resize(W, W, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
}
async function rawRgb(buf) {
  return sharp(buf)
    .resize(W, W, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

// Connected components of non-ink; label 1 = border-connected background.
function labelRegions(ink, w, h) {
  const labels = new Int32Array(w * h);
  const stack = [];
  const flood = (start, label) => {
    labels[start] = label;
    stack.push(start);
    let area = 0;
    while (stack.length) {
      const i = stack.pop();
      area++;
      const x = i % w;
      const y = (i / w) | 0;
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ]) {
        if (j >= 0 && !ink[j] && !labels[j]) {
          labels[j] = label;
          stack.push(j);
        }
      }
    }
    return area;
  };
  for (let x = 0; x < w; x++)
    for (const i of [x, (h - 1) * w + x]) if (!ink[i] && !labels[i]) flood(i, 1);
  for (let y = 0; y < h; y++)
    for (const i of [y * w, y * w + w - 1]) if (!ink[i] && !labels[i]) flood(i, 1);
  let next = 2;
  const areas = new Map();
  for (let i = 0; i < w * h; i++) if (!ink[i] && !labels[i]) areas.set(next, flood(i, next++));
  return { labels, areas };
}

// Hue signature of the SUBJECT (interior regions only, background excluded):
// chroma-weighted circular hue histogram + chromatic fraction.
export async function hueSignature(penBuf, fillBuf) {
  const pen = await rawGray(penBuf);
  const fill = await rawRgb(fillBuf);
  const w = pen.info.width;
  const h = pen.info.height;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (pen.data[i] < INK_DARK) ink[i] = 1;
  const nearInk = dilateMask(ink, w, h, INK_CLEAR);
  const { labels, areas } = labelRegions(ink, w, h);
  const smallRegion = new Set();
  for (const [label, area] of areas) if (area < MIN_REGION_PX) smallRegion.add(label);

  const hist = new Float64Array(BINS);
  let sampled = 0;
  let chromatic = 0;
  for (let i = 0; i < w * h; i++) {
    const label = labels[i];
    if (label < 2 || smallRegion.has(label) || nearInk[i]) continue;
    sampled++;
    const { hue, chroma } = rgbToHueChroma(
      fill.data[i * 3],
      fill.data[i * 3 + 1],
      fill.data[i * 3 + 2]
    );
    if (chroma < MIN_CHROMA) continue;
    chromatic++;
    hist[Math.min(BINS - 1, Math.floor(hue / (360 / BINS)))] += chroma;
  }
  const total = hist.reduce((a, b) => a + b, 0);
  const norm = total > 0 ? Array.from(hist, (v) => v / total) : Array.from(hist);
  return { hist: norm, sampled, chromatic, chromaticFrac: sampled ? chromatic / sampled : 0 };
}

// Circular EMD between two normalized histograms (units: degrees of transport).
function circularEmd(a, b) {
  const diff = a.map((v, i) => v - b[i]);
  const cum = [];
  let acc = 0;
  for (const d of diff) cum.push((acc += d));
  const sorted = [...cum].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  return cum.reduce((s, c) => s + Math.abs(c - median), 0) * (360 / BINS);
}

// Fraction of mass with no counterpart within SMEAR_BINS on the other side.
function mismatchFrac(a, b) {
  const smear = (hst) => {
    const out = new Array(BINS).fill(0);
    for (let i = 0; i < BINS; i++) {
      for (let k = -SMEAR_BINS; k <= SMEAR_BINS; k++) {
        out[i] = Math.max(out[i], hst[(i + k + BINS) % BINS]);
      }
    }
    return out;
  };
  const sa = smear(a);
  const sb = smear(b);
  const uncoveredA = a.reduce((s, v, i) => s + Math.max(0, v - sb[i]), 0);
  const uncoveredB = b.reduce((s, v, i) => s + Math.max(0, v - sa[i]), 0);
  return (uncoveredA + uncoveredB) / 2;
}

function topFamilies(hist, n = 3) {
  const fam = new Map();
  for (let i = 0; i < BINS; i++) {
    if (hist[i] <= 0) continue;
    const name = hueName((i + 0.5) * (360 / BINS));
    fam.set(name, (fam.get(name) ?? 0) + hist[i]);
  }
  return [...fam.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)
    .map(([name, frac]) => `${name} ${(frac * 100).toFixed(0)}%`)
    .join(', ');
}

export async function scorePair(tallPen, tallFill, widePen, wideFill) {
  const [t, w] = await Promise.all([
    hueSignature(tallPen, tallFill),
    hueSignature(widePen, wideFill),
  ]);
  return {
    emdDeg: circularEmd(t.hist, w.hist),
    mismatch: mismatchFrac(t.hist, w.hist),
    tallTop: topFamilies(t.hist),
    wideTop: topFamilies(w.hist),
    tallChromaticFrac: t.chromaticFrac,
    wideChromaticFrac: w.chromaticFrac,
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: 'boolean' },
      'wide-file': { type: 'string' },
      mode: { type: 'string' },
    },
  });
  const modes = values.mode ? [values.mode] : ['light', 'night'];

  const bases = new Set();
  for await (const e of glob('**/*-tall.light.raw.webp', { cwd: FILL_SRC_DIR })) {
    bases.add(e.replace(/-tall\.light\.raw\.webp$/, ''));
  }
  let selected = [...bases].filter((b) =>
    existsSync(join(FILL_SRC_DIR, `${b}-wide.light.raw.webp`))
  );
  if (positionals.length) {
    selected = selected.filter((b) =>
      positionals.some((p) => b === p || b.startsWith(`${p}/`) || b.startsWith(p))
    );
  }
  selected.sort();

  const results = [];
  for (const base of selected) {
    const row = { base };
    for (const mode of modes) {
      const tallPen = join(COLORING_DIR, `${base}-tall.outline.webp`);
      const widePen = join(COLORING_DIR, `${base}-wide.outline.webp`);
      const tallFill = join(FILL_SRC_DIR, `${base}-tall.${mode}.raw.webp`);
      const wideFill =
        mode === 'light' && values['wide-file']
          ? values['wide-file']
          : join(FILL_SRC_DIR, `${base}-wide.${mode}.raw.webp`);
      if (![tallPen, widePen, tallFill, wideFill].every((p) => existsSync(p))) continue;
      row[mode] = await scorePair(
        await readFile(tallPen),
        await readFile(tallFill),
        await readFile(widePen),
        await readFile(wideFill)
      );
    }
    results.push(row);
  }
  results.sort((a, b) => (b.light?.emdDeg ?? 0) - (a.light?.emdDeg ?? 0));

  if (values.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      for (const mode of modes) {
        const m = r[mode];
        if (!m) continue;
        console.log(
          `${r.base.padEnd(26)} ${mode.padEnd(5)} emd ${m.emdDeg.toFixed(1).padStart(5)}deg  mismatch ${(m.mismatch * 100).toFixed(0).padStart(3)}%  tall[${m.tallTop}]  wide[${m.wideTop}]`
        );
      }
    }
  }
}
