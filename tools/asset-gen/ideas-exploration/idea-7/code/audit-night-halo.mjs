// IDEAS.md #7 — catalog-wide residual dark halo audit (validated 2026-07-12).
// To run: copy into tools/asset-gen/ (imports ./lib/*.mjs), then from repo root:
//   node tools/asset-gen/audit-night-halo.mjs --out scores.json [--rim-erase] [pages...]
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { dilateMask } from './lib/morphology.mjs';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';

const PUNCH_LUMA = 150; // lib/punch-fill.mjs OUTLINE_LUMA_THRESHOLD
const DELTA_RIM = 40;
const REF_DILATE = 4;
const MAX_BAND = 3;
const RIM_R = 2; // idea #1 rim-erase params
const RIM_DARK = 145;
const RIM_PROTECT_BLACK = 55;
const LINE_W_GATE = 150;

export function listNightPages() {
  const pages = [];
  for (const cat of readdirSync(COLORING_DIR, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue;
    for (const f of readdirSync(join(COLORING_DIR, cat.name)))
      if (f.endsWith('.night.webp')) pages.push(`${cat.name}/${f.replace('.night.webp', '')}`);
  }
  return pages.sort();
}

async function loadRgb(path) {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgb: data, width: info.width, height: info.height };
}

const lumaOf = (rgb, p) => 0.299 * rgb[p * 3] + 0.587 * rgb[p * 3 + 1] + 0.114 * rgb[p * 3 + 2];

async function chalkMask(chalkPath, width, height) {
  const { data: line } = await sharp(chalkPath)
    .removeAlpha()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < width * height; p++, i += 3) {
    const luma = 0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2];
    if (luma < PUNCH_LUMA) mask[p] = 1;
  }
  return mask;
}

function ringBands(mask, w, h, maxD) {
  const bands = [];
  let prev = mask;
  for (let d = 1; d <= maxD; d++) {
    const grown = dilateMask(mask, w, h, d);
    const band = [];
    for (let p = 0; p < w * h; p++) if (grown[p] && !prev[p]) band.push(p);
    bands.push(band);
    prev = grown;
  }
  return bands;
}

// verbatim copy of lib/punch-fill.mjs bleedUnderMask
function bleedUnderMask(rgb, mask, width, height) {
  const pending = mask.slice();
  let ring = [];
  for (let p = 0; p < width * height; p++) if (pending[p]) ring.push(p);
  while (ring.length) {
    const done = [];
    const next = [];
    for (const p of ring) {
      const x = p % width;
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q < 0 || q >= width * height || pending[q]) continue;
        r += rgb[q * 3];
        g += rgb[q * 3 + 1];
        b += rgb[q * 3 + 2];
        n++;
      }
      if (!n) {
        next.push(p);
        continue;
      }
      rgb[p * 3] = Math.round(r / n);
      rgb[p * 3 + 1] = Math.round(g / n);
      rgb[p * 3 + 2] = Math.round(b / n);
      done.push(p);
    }
    if (!done.length) break;
    for (const p of done) pending[p] = 0;
    ring = next;
  }
}

// idea #1's rim-erase rule (punch-rim-erase.mjs)
function addRimOverhang(mask, rgb, width, height) {
  const grown = dilateMask(mask, width, height, RIM_R);
  let added = 0;
  for (let p = 0; p < width * height; p++) {
    if (!grown[p] || mask[p]) continue;
    const luma = lumaOf(rgb, p);
    if (luma >= RIM_PROTECT_BLACK && luma < RIM_DARK) {
      mask[p] = 1;
      added++;
    }
  }
  return added;
}

// gen-coloring-fills-dark.mjs scoreLineColor: median max-3x3 raw luma over
// chalk-ink pixels at width 512.
async function scoreLineW(rawPath, chalkPath) {
  const s = await sharp(chalkPath)
    .resize(512, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const t = await sharp(rawPath)
    .resize(512, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const maxes = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (s.data[y * w + x] >= 110) continue;
      let mx = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const v = t.data[yy * w + xx];
          if (v > mx) mx = v;
        }
      maxes.push(mx);
    }
  maxes.sort((a, b) => a - b);
  return maxes.length ? maxes[maxes.length >> 1] : 255;
}

export async function auditPage(page, { rimErase = false } = {}) {
  const rawPath = join(FILL_SRC_DIR, `${page}.night.raw.webp`);
  const chalkPath = join(COLORING_DIR, `${page}.chalk.webp`);
  const shippedPath = join(COLORING_DIR, `${page}.night.webp`);

  const { rgb: rawRgb, width: w, height: h } = await loadRgb(rawPath);
  const mask = await chalkMask(chalkPath, w, h);
  const lineW = await scoreLineW(rawPath, chalkPath);

  let candidate; // the punched fill under audit
  let erasedPx = 0;
  if (rimErase && lineW < LINE_W_GATE) {
    const eraseMask = mask.slice();
    candidate = Buffer.from(rawRgb);
    erasedPx = addRimOverhang(eraseMask, candidate, w, h);
    bleedUnderMask(candidate, eraseMask, w, h);
  } else {
    ({ rgb: candidate } = await loadRgb(shippedPath));
  }

  const refMask = dilateMask(mask, w, h, REF_DILATE);
  const refRgb = Buffer.from(rawRgb);
  bleedUnderMask(refRgb, refMask, w, h);

  const bands = ringBands(mask, w, h, MAX_BAND);
  const deltaAt = (p) => lumaOf(refRgb, p) - lumaOf(candidate, p);
  // A visible halo pixel is BOTH much darker than the true local fill (rimΔ)
  // AND itself mid-dark (idea #1: the penumbra is luma 55..145; legit
  // near-black ink — the owl's eye ring, the cow's patches — sits below 55).
  const isHalo = (p) => {
    if (deltaAt(p) <= DELTA_RIM) return false;
    const l = lumaOf(candidate, p);
    return l >= RIM_PROTECT_BLACK && l < RIM_DARK;
  };

  const bandStats = bands.map((band, i) => {
    const deltas = band.map(deltaAt).sort((a, b) => a - b);
    const q = (f) => deltas[Math.floor(f * (deltas.length - 1))] ?? NaN;
    return {
      d: i + 1,
      n: deltas.length,
      med: +q(0.5).toFixed(1),
      p90: +q(0.9).toFixed(1),
      p99: +q(0.99).toFixed(1),
      rimShare: deltas.filter((x) => x > DELTA_RIM).length / (deltas.length || 1),
      haloShare: band.filter(isHalo).length / (band.length || 1),
    };
  });

  // haloScore: % of band-1..2 halo pixels (rimΔ + mid-dark window).
  // rawScore: unwindowed rimΔ share, kept to show why the window matters.
  const n12 = bandStats[0].n + bandStats[1].n;
  const halo12 = bandStats[0].haloShare * bandStats[0].n + bandStats[1].haloShare * bandStats[1].n;
  const rim12 = bandStats[0].rimShare * bandStats[0].n + bandStats[1].rimShare * bandStats[1].n;
  const haloScore = +((100 * halo12) / (n12 || 1)).toFixed(3);
  const rawScore = +((100 * rim12) / (n12 || 1)).toFixed(3);

  // hotspots: 64px tiles ranked by count of band-1..3 halo px
  const counts = new Map();
  for (const band of bands)
    for (const p of band) {
      if (!isHalo(p)) continue;
      const k = Math.floor(Math.floor(p / w) / 64) * 1000 + Math.floor((p % w) / 64);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  const hotspots = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, n]) => ({
      left: (k % 1000) * 64,
      top: Math.floor(k / 1000) * 64,
      rimPx: n,
    }));

  return {
    page,
    w,
    h,
    lineW,
    erasedPx,
    haloScore,
    rawScore,
    haloPx12: Math.round(halo12),
    rimPx12: Math.round(rim12),
    bandStats,
    hotspots,
  };
}

const isMain = process.argv[1]?.endsWith('idea7-audit-night-halo.mjs');
if (isMain) {
  const args = process.argv.slice(2);
  const rimErase = args.includes('--rim-erase');
  const outIx = args.indexOf('--out');
  const outPath = outIx >= 0 ? args[outIx + 1] : null;
  const positional = args.filter((a, i) => !a.startsWith('--') && (outIx < 0 || i !== outIx + 1));
  const pages = positional.length ? positional : listNightPages();

  const results = [];
  const t0 = Date.now();
  for (const page of pages) {
    const r = await auditPage(page, { rimErase });
    results.push(r);
    console.error(
      `${String(results.length).padStart(3)}/${pages.length}  ${page}  haloScore=${r.haloScore}  lineW=${r.lineW}${r.erasedPx ? `  erased=${r.erasedPx}px` : ''}`
    );
  }
  results.sort((a, b) => b.haloScore - a.haloScore);
  console.log(
    `\nRanked by haloScore (band-1..2 % px with rimDelta>${DELTA_RIM} AND luma in [${RIM_PROTECT_BLACK},${RIM_DARK})):`
  );
  for (const [i, r] of results.entries())
    console.log(
      `${String(i + 1).padStart(3)}. ${r.page.padEnd(28)} haloScore=${String(r.haloScore).padEnd(7)} haloPx=${String(r.haloPx12).padEnd(6)} rawScore=${String(r.rawScore).padEnd(7)} lineW=${r.lineW}`
    );
  if (outPath) writeFileSync(outPath, JSON.stringify(results, null, 1));
  console.error(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
