// Measure the surviving dark rim on a shipped night punch.
// Usage (from repo root): node <this file> <book/page-orient> [...more]
//
// Metric: build a REFERENCE punch whose mask is the chalk mask dilated by 4 px
// (the whole collar is inpainted from fill color beyond any plausible rim).
// For pixels at chebyshev distance 1..3 from the chalk ink, rimDelta =
// luma(reference) - luma(shipped). A re-inked dark rim shows as a large
// positive delta; legit dark fills show ~0 because the reference is equally
// dark. Prints per-band delta stats + the worst 64px hotspots for cropping.
import { join } from 'node:path';
import { sharp } from './rim-lib.mjs';
import { dilateMask } from '/home/user/Splotch/tools/asset-gen/lib/morphology.mjs';
import { loadRgb, chalkMask, ringBands, punchWithMask, lumaOf } from './rim-lib.mjs';

const REPO = '/home/user/Splotch';
const FILL_SRC = join(REPO, 'tools/asset-gen/fill-src');
const COLORING = join(REPO, 'web/static/coloring');

async function lineW(rawPath, chalkPath) {
  // Same as gen-coloring-fills-dark.mjs scoreLineColor (median max-3x3 fill
  // luma over source-ink pixels, at width 512).
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

export async function analyzePage(page) {
  const raw = join(FILL_SRC, `${page}.night.raw.webp`);
  const chalk = join(COLORING, `${page}.chalk.webp`);
  const shipped = join(COLORING, `${page}.night.webp`);
  const { rgb: shippedRgb, width: w, height: h } = await loadRgb(shipped);
  const { rgb: rawRgb } = await loadRgb(raw);
  const mask = await chalkMask(chalk, w, h);
  const refMask = dilateMask(mask, w, h, 4);
  const refRgb = punchWithMask(rawRgb, refMask, w, h);
  const bands = ringBands(mask, w, h, 3);
  const lw = await lineW(raw, chalk);

  const bandStats = [];
  const deltaAt = (p) => lumaOf(refRgb, p) - lumaOf(shippedRgb, p);
  for (let d = 0; d < bands.length; d++) {
    const deltas = bands[d].map(deltaAt).sort((a, b) => a - b);
    const q = (f) => deltas[Math.floor(f * (deltas.length - 1))] ?? NaN;
    bandStats.push({
      d: d + 1,
      n: deltas.length,
      med: q(0.5),
      p90: q(0.9),
      p99: q(0.99),
      rimShare: deltas.filter((x) => x > 40).length / (deltas.length || 1),
    });
  }

  // Hotspots: 64px tiles ranked by count of band-1..3 pixels with delta > 40.
  const counts = new Map();
  for (const band of bands)
    for (const p of band) {
      if (deltaAt(p) <= 40) continue;
      const k = Math.floor(Math.floor(p / w) / 64) * 1000 + Math.floor((p % w) / 64);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  const hotspots = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, n]) => ({
      left: (k % 1000) * 64,
      top: Math.floor(k / 1000) * 64,
      rimPx: n,
    }));

  return { page, lineW: lw, bandStats, hotspots, w, h };
}

if (process.argv[1].endsWith('analyze-rim.mjs')) {
  for (const page of process.argv.slice(2)) {
    const r = await analyzePage(page);
    console.log(`\n=== ${r.page}  lineW ${r.lineW} ===`);
    for (const s of r.bandStats)
      console.log(
        `  band d=${s.d}  n=${s.n}  medΔ=${s.med.toFixed(1)} p90Δ=${s.p90.toFixed(1)} p99Δ=${s.p99.toFixed(1)}  rim(Δ>40)=${(s.rimShare * 100).toFixed(2)}%`
      );
    console.log('  hotspots (64px tiles, rim px):');
    for (const hs of r.hotspots) console.log(`    left=${hs.left} top=${hs.top} rimPx=${hs.rimPx}`);
  }
}
