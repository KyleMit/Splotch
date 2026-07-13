// EXPERIMENT (idea #8) — region-hue coherence scorer, light vs night.
// Segments fillable regions from the PEN outline (connected components of
// non-ink pixels, background excluded via border flood), computes each
// region's chroma-weighted circular mean hue in the light raw and the night
// raw, and flags HUE-FAMILY FLIPS: regions chromatic on both sides whose hue
// moved further than a night "dim + cool" shift can explain.
//
//   node tools/asset-gen/score-hue-coherence.mjs            whole catalog
//   node tools/asset-gen/score-hue-coherence.mjs nature     one category
//   node tools/asset-gen/score-hue-coherence.mjs --night-file <path> nature/ant-wide
//     score one page against an alternate night image (e.g. a fresh take)
//   node tools/asset-gen/score-hue-coherence.mjs --json     machine-readable
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { glob } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { dilateMask } from './lib/morphology.mjs';

const W = 512; // working width
const INK_DARK = 128; // pen pixel darker than this = ink
const INK_CLEAR = 2; // sample only pixels this many px clear of ink
const MIN_REGION_PX = 60; // ignore slivers
const MIN_CHROMA = 22; // pixel chroma below this = achromatic (no hue)
const MIN_CHROMATIC_FRAC = 0.35; // region must be this chromatic ON BOTH SIDES to score
const MIN_CHROMATIC_PX = 40;
const FLIP_DEG = 75; // hue-family flip threshold (circular degrees)
const COOL_CREDIT = 25; // degrees of "toward blue" shift forgiven as moonlight cooling

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

function circularDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Signed shortest rotation a -> b in degrees, positive = toward larger hue.
function circularDelta(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

async function rawGray(buf) {
  return sharp(buf)
    .resize(W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
}
async function rawRgb(buf) {
  return sharp(buf)
    .resize(W, null, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

// Label connected components of non-ink pixels; label 0 = ink, 1 = background
// (border-connected non-ink), >=2 = interior regions.
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
  for (let x = 0; x < w; x++) {
    for (const i of [x, (h - 1) * w + x]) if (!ink[i] && !labels[i]) flood(i, 1);
  }
  for (let y = 0; y < h; y++) {
    for (const i of [y * w, y * w + w - 1]) if (!ink[i] && !labels[i]) flood(i, 1);
  }
  let next = 2;
  const areas = new Map();
  for (let i = 0; i < w * h; i++) {
    if (!ink[i] && !labels[i]) areas.set(next, flood(i, next++));
  }
  return { labels, areas };
}

function regionHues(labels, sampleable, rgb, w, h) {
  // per-label chroma-weighted hue vector + chromatic pixel counts
  const acc = new Map(); // label -> {vx, vy, chromatic, sampled, lumaSum}
  for (let i = 0; i < w * h; i++) {
    const label = labels[i];
    if (label < 2 || !sampleable[i]) continue;
    let a = acc.get(label);
    if (!a) acc.set(label, (a = { vx: 0, vy: 0, chromatic: 0, sampled: 0, lumaSum: 0 }));
    const r = rgb.data[i * 3];
    const g = rgb.data[i * 3 + 1];
    const b = rgb.data[i * 3 + 2];
    a.sampled++;
    a.lumaSum += 0.299 * r + 0.587 * g + 0.114 * b;
    const { hue, chroma } = rgbToHueChroma(r, g, b);
    if (chroma < MIN_CHROMA) continue;
    a.chromatic++;
    const rad = (hue * Math.PI) / 180;
    a.vx += chroma * Math.cos(rad);
    a.vy += chroma * Math.sin(rad);
  }
  const out = new Map();
  for (const [label, a] of acc) {
    const hue = ((Math.atan2(a.vy, a.vx) * 180) / Math.PI + 360) % 360;
    out.set(label, {
      hue,
      chromaticFrac: a.sampled ? a.chromatic / a.sampled : 0,
      chromatic: a.chromatic,
      sampled: a.sampled,
      meanLuma: a.sampled ? a.lumaSum / a.sampled : 0,
    });
  }
  return out;
}

export async function scorePage(penBuf, lightBuf, nightBuf) {
  const pen = await rawGray(penBuf);
  const light = await rawRgb(lightBuf);
  const night = await rawRgb(nightBuf);
  const w = pen.info.width;
  const h = pen.info.height;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (pen.data[i] < INK_DARK) ink[i] = 1;
  const nearInk = dilateMask(ink, w, h, INK_CLEAR);
  const sampleable = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) sampleable[i] = nearInk[i] ? 0 : 1;
  const { labels, areas } = labelRegions(ink, w, h);
  const lightHues = regionHues(labels, sampleable, light, w, h);
  const nightHues = regionHues(labels, sampleable, night, w, h);

  const regions = [];
  let scoredArea = 0;
  let flippedArea = 0;
  for (const [label, area] of areas) {
    if (area < MIN_REGION_PX) continue;
    const L = lightHues.get(label);
    const N = nightHues.get(label);
    if (!L || !N) continue;
    const chromaticBoth =
      L.chromaticFrac >= MIN_CHROMATIC_FRAC &&
      N.chromaticFrac >= MIN_CHROMATIC_FRAC &&
      L.chromatic >= MIN_CHROMATIC_PX &&
      N.chromatic >= MIN_CHROMATIC_PX;
    if (!chromaticBoth) continue;
    scoredArea += area;
    const rawDist = circularDist(L.hue, N.hue);
    // Forgive a modest rotation TOWARD blue (240deg) — that's moonlight.
    const towardBlue =
      circularDist(N.hue, 240) < circularDist(L.hue, 240) &&
      Math.abs(circularDelta(L.hue, N.hue)) <= FLIP_DEG + COOL_CREDIT;
    const effDist = towardBlue ? Math.max(0, rawDist - COOL_CREDIT) : rawDist;
    const flipped = effDist > FLIP_DEG;
    if (flipped) flippedArea += area;
    regions.push({
      label,
      area,
      lightHue: L.hue,
      nightHue: N.hue,
      dist: rawDist,
      effDist,
      flipped,
      lightName: hueName(L.hue),
      nightName: hueName(N.hue),
    });
  }
  regions.sort((a, b) => b.flipped - a.flipped || b.area * b.effDist - a.area * a.effDist);
  return {
    scoredArea,
    flippedArea,
    flipFrac: scoredArea ? flippedArea / scoredArea : 0,
    flippedRegions: regions.filter((r) => r.flipped).length,
    scoredRegions: regions.length,
    regions,
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: 'boolean' },
      'night-file': { type: 'string' },
      top: { type: 'string' },
    },
  });
  const topN = values.top ? Number(values.top) : 4;
  const cells = [];
  if (positionals.length) {
    for (const arg of positionals) {
      const asRaw = join(FILL_SRC_DIR, `${arg}.light.raw.webp`);
      if (existsSync(asRaw)) cells.push(arg);
      else {
        for await (const e of glob(`${arg}/*.light.raw.webp`, { cwd: FILL_SRC_DIR }))
          cells.push(e.replace(/\.light\.raw\.webp$/, ''));
      }
    }
  } else {
    for await (const e of glob('**/*.light.raw.webp', { cwd: FILL_SRC_DIR }))
      cells.push(e.replace(/\.light\.raw\.webp$/, ''));
  }
  cells.sort();

  const results = [];
  for (const cell of cells) {
    const penPath = join(COLORING_DIR, `${cell}.outline.webp`);
    const lightPath = join(FILL_SRC_DIR, `${cell}.light.raw.webp`);
    const nightPath = values['night-file'] ?? join(FILL_SRC_DIR, `${cell}.night.raw.webp`);
    if (!existsSync(penPath) || !existsSync(nightPath)) continue;
    const res = await scorePage(
      await readFile(penPath),
      await readFile(lightPath),
      await readFile(nightPath)
    );
    results.push({ cell, ...res });
  }
  results.sort((a, b) => b.flipFrac - a.flipFrac);
  if (values.json) {
    console.log(
      JSON.stringify(
        results.map(({ regions, ...r }) => ({
          ...r,
          worst: regions.filter((x) => x.flipped).slice(0, topN),
        })),
        null,
        2
      )
    );
  } else {
    for (const r of results) {
      const worst = r.regions
        .filter((x) => x.flipped)
        .slice(0, topN)
        .map((x) => `${x.lightName}->${x.nightName} (${x.area}px, ${x.dist.toFixed(0)}deg)`)
        .join(', ');
      console.log(
        `${r.cell.padEnd(32)} flip ${(r.flipFrac * 100).toFixed(1).padStart(5)}%  ${String(r.flippedRegions).padStart(2)}/${r.scoredRegions} regions${worst ? '  ' + worst : ''}`
      );
    }
  }
}
