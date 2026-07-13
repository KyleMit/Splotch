// Audit the committed RAW fills for INVENTED COLORED SHAPES on the open
// background. scoreDrift (lib/night-scores.mjs) only counts white/low-chroma
// pixels — invented OUTLINES — so a colored blob the model added (an extra
// star/planet/flower with no white outline) slips every generation gate; this
// detector is the only thing that caught objects/house-tall's two invented sky
// flowers. Validated as IDEAS #13 (ideas-exploration/idea-13/report.md, with the
// threshold calibration and a synthesized positive). Deterministic, no API
// key/network. Exits non-zero if any fill is flagged, so it doubles as a check.
//
// How it works:
//   1. flood the open background from the image border through the source's
//      light pixels (the same machinery as scoreNightness),
//   2. find pixels whose color deviates strongly from the background's median
//      color, outside a dilated source-line mask,
//   3. group them into connected blobs and flag blobs that are big enough AND
//      "floating" — not anchored to any source line or the image border.
// Anchoring, not saturation, is the discriminator: real inventions are mostly
// PALE (smoke, dashes, rings), and a legit fill that leaks into the bg mask (an
// edge-open ground/road region) always butts against its own source outline or
// the page edge, while an invented shape floats free of both. Floating regions
// bigger than MAX_BLOB are second-background WASHES — reported as info, not
// flagged. Night fills score against the chalk when the page has forked, light
// fills (and unforked pages) against the pen — mirroring the generators.
//
//   npm run gen:coloring-fills:audit:shapes                    whole catalog
//   npm run gen:coloring-fills:audit:shapes -- space           one category
//   npm run gen:coloring-fills:audit:shapes -- space/ship-tall        both themes
//   npm run gen:coloring-fills:audit:shapes -- space/ship-tall.night  one theme
//   npm run gen:coloring-fills:audit:shapes -- --verbose  per-blob detail everywhere
//   npm run gen:coloring-fills:audit:shapes -- --overlay  dump detection overlays
import { parseArgs } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR, SAMPLES_DIR, fail } from '../lib/paths.mjs';
import { dilateMask } from '../lib/morphology.mjs';

// Geometry constants are inherited unchanged from scoreDrift/scoreNightness
// (lib/night-scores.mjs) so this audit sees the same picture the gates do; the
// blob thresholds are calibrated in ideas-exploration/idea-13/report.md.
const W = 512; // working width, matches scoreDrift's scale
const SRC_DARK = 110; // source pixel darker than this = line/solid ink (as scoreDrift)
const SRC_LIGHT = 170; // source pixel brighter than this = floodable background (as scoreNightness)
const LINE_DILATE = 6; // px of slack around source ink (registration + glow), as DRIFT_DILATE
const DEV_T = 60; // Euclidean RGB distance from median bg color to call a pixel "foreign"
const MIN_BLOB = 60; // px at W=512 — blobs smaller than this are speckle/texture
const ANCHOR_MAX = 0.05; // blob FLOATS if <5% of its pixels touch the line mask or image border
// Above this area a floating region is a second background WASH (a painted
// ground/sky band — art, reported as info), not a compact invented shape: real
// washes measure 21k-65k px here, real invented shapes 60-1300 px.
const MAX_BLOB = 8000;
const MIN_BG_FRAC = 0.04; // skip pages with almost no open background (as scoreNightness)

async function detectInventedShapes(fillBuf, sourceBuf) {
  const s = await sharp(sourceBuf)
    .resize(W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const t = await sharp(fillBuf)
    .resize(W, null, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const n = w * h;

  // 1. flood the open background from the border through source-light pixels
  const bg = new Uint8Array(n);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x;
    if (!bg[i] && s.data[i] > SRC_LIGHT) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  // 2. dilated source-ink mask (lines + solid chalk whites)
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (s.data[i] < SRC_DARK) ink[i] = 1;
  const nearLine = dilateMask(ink, w, h, LINE_DILATE);

  // candidate pixels: open background, clear of any source ink
  const cand = new Uint8Array(n);
  let candCount = 0;
  for (let i = 0; i < n; i++) {
    if (bg[i] && !nearLine[i]) {
      cand[i] = 1;
      candCount++;
    }
  }
  if (candCount < n * MIN_BG_FRAC)
    return { skipped: true, bgFrac: candCount / n, blobs: [], flagged: [], washes: [] };

  // 3. median background color over candidates
  const rs = [],
    gs = [],
    bs = [];
  for (let i = 0; i < n; i++) {
    if (!cand[i]) continue;
    rs.push(t.data[i * 3]);
    gs.push(t.data[i * 3 + 1]);
    bs.push(t.data[i * 3 + 2]);
  }
  const med = (a) => (a.sort((x, y) => x - y), a[a.length >> 1]);
  const mr = med(rs),
    mg = med(gs),
    mb = med(bs);

  // 4. foreign pixels: candidates whose color sits far from the bg median
  const dev = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!cand[i]) continue;
    const dr = t.data[i * 3] - mr;
    const dg = t.data[i * 3 + 1] - mg;
    const db = t.data[i * 3 + 2] - mb;
    if (Math.sqrt(dr * dr + dg * dg + db * db) > DEV_T) dev[i] = 1;
  }

  // 5. connected components (4-conn) + anchoring stats
  const seen = new Uint8Array(n);
  const blobs = [];
  for (let start = 0; start < n; start++) {
    if (!dev[start] || seen[start]) continue;
    const q = [start];
    seen[start] = 1;
    let area = 0,
      anchored = 0,
      borderPx = 0,
      sr = 0,
      sg = 0,
      sb = 0;
    let minX = w,
      maxX = 0,
      minY = h,
      maxY = 0;
    while (q.length) {
      const i = q.pop();
      const x = i % w;
      const y = (i / w) | 0;
      area++;
      sr += t.data[i * 3];
      sg += t.data[i * 3 + 1];
      sb += t.data[i * 3 + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // anchored: adjacent to the dilated ink mask (the blob butts against a
      // source region boundary — a legit fill that leaked into the bg mask) or
      // on the image border (an edge-open region: a road/path running off the
      // page, a corner vignette). An invented shape floats free of both.
      const onBorder = x <= 1 || x >= w - 2 || y <= 1 || y >= h - 2;
      if (onBorder) borderPx++;
      if (onBorder || nearLine[i - 1] || nearLine[i + 1] || nearLine[i - w] || nearLine[i + w])
        anchored++;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= n || seen[j] || !dev[j]) continue;
        const jx = j % w;
        if (Math.abs(jx - x) > 1) continue; // no wraparound
        seen[j] = 1;
        q.push(j);
      }
    }
    if (area < 8) continue; // ignore speckle entirely
    blobs.push({
      area,
      anchorFrac: anchored / area,
      borderPx,
      bbox: [minX, minY, maxX, maxY],
      color: [Math.round(sr / area), Math.round(sg / area), Math.round(sb / area)],
    });
  }
  const flagged = blobs.filter(
    (b) => b.area >= MIN_BLOB && b.area <= MAX_BLOB && b.anchorFrac < ANCHOR_MAX
  );
  const washes = blobs.filter((b) => b.area > MAX_BLOB && b.anchorFrac < ANCHOR_MAX);
  return {
    skipped: false,
    w,
    h,
    bgFrac: candCount / n,
    bgColor: [mr, mg, mb],
    blobs: blobs.sort((a, b) => b.area - a.area),
    flagged,
    washes,
    dev,
  };
}

async function overlayImage(fillBuf, res, outPath) {
  const { w, h } = res;
  const base = await sharp(fillBuf)
    .resize(W, null, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    let r = base.data[i * 3] * 0.55;
    let g = base.data[i * 3 + 1] * 0.55;
    let b = base.data[i * 3 + 2] * 0.55;
    if (res.dev && res.dev[i]) {
      r = 255;
      g = 210;
      b = 0; // deviant bg pixel = amber
    }
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  let img = sharp(out, { raw: { width: w, height: h, channels: 3 } });
  // draw red rects around flagged blobs via SVG composite
  if (res.flagged.length) {
    const rects = res.flagged
      .map(
        ({ bbox: [x0, y0, x1, y1] }) =>
          `<rect x="${x0 - 3}" y="${y0 - 3}" width="${x1 - x0 + 6}" height="${y1 - y0 + 6}" fill="none" stroke="red" stroke-width="3"/>`
      )
      .join('');
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`
    );
    img = sharp(await img.png().toBuffer()).composite([{ input: svg }]);
  }
  await img.png().toFile(outPath);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    overlay: { type: 'boolean' },
    verbose: { type: 'boolean' },
  },
});

// Resolve args to raw-fill targets. An arg is a category dir ("space"), a page
// ("space/ship-tall" — both themes), or a themed page ("space/ship-tall.night").
async function targetsUnder(sub = '') {
  const cwd = sub ? join(FILL_SRC_DIR, sub) : FILL_SRC_DIR;
  const out = [];
  for await (const entry of glob('**/*.{light,night}.raw.webp', { cwd })) {
    const rel = join(sub, entry).replace(/\\/g, '/');
    const m = rel.match(/^(.+)\.(light|night)\.raw\.webp$/);
    out.push({ fillPath: join(FILL_SRC_DIR, rel), page: m[1], theme: m[2] });
  }
  return out;
}
async function resolveArg(arg) {
  const m = arg.match(/^(.+)\.(light|night)$/);
  const page = m ? m[1] : arg;
  const themes = m ? [m[2]] : ['light', 'night'];
  const targets = themes
    .map((theme) => ({ fillPath: join(FILL_SRC_DIR, `${page}.${theme}.raw.webp`), page, theme }))
    .filter((t) => existsSync(t.fillPath));
  if (targets.length) return targets;
  const asDir = join(FILL_SRC_DIR, arg);
  if (existsSync(asDir) && statSync(asDir).isDirectory()) return targetsUnder(arg);
  fail(`no raw fill or category "${arg}" under ${relative(process.cwd(), FILL_SRC_DIR)}`);
}

const targets = (
  positionals.length
    ? (await Promise.all(positionals.map(resolveArg))).flat()
    : await targetsUnder()
).sort((a, b) => a.page.localeCompare(b.page) || a.theme.localeCompare(b.theme));
if (!targets.length) fail('No raw fills found for the given pages.');

const overlayDir = join(SAMPLES_DIR, 'invented-shapes');
if (values.overlay) await mkdir(overlayDir, { recursive: true });

let flaggedPages = 0;
for (const { fillPath, page, theme } of targets) {
  // night fills score against the chalk when forked (as the dark generator
  // does); light fills always score against the pen
  const chalkPath = join(COLORING_DIR, `${page}.chalk.webp`);
  const penPath = join(COLORING_DIR, `${page}.outline.webp`);
  const srcPath = theme === 'night' && existsSync(chalkPath) ? chalkPath : penPath;
  const fill = await readFile(fillPath);
  const res = await detectInventedShapes(fill, await readFile(srcPath));
  const id = `${page}.${theme}`;
  if (res.skipped) {
    console.log(`${id}  SKIP (bg ${(res.bgFrac * 100).toFixed(1)}%)`);
    continue;
  }
  const big = res.blobs.filter((b) => b.area >= MIN_BLOB);
  console.log(
    `${id}  bg ${(res.bgFrac * 100).toFixed(0)}% rgb(${res.bgColor}) ` +
      `blobs≥${MIN_BLOB}: ${big.length}  FLAGGED: ${res.flagged.length}` +
      (res.washes.length ? `  washes: ${res.washes.length}` : '')
  );
  if (res.flagged.length || values.verbose) {
    for (const b of values.verbose ? big : res.flagged)
      console.log(
        `    area ${b.area}  anchor ${(b.anchorFrac * 100).toFixed(1)}%  border ${b.borderPx}  ` +
          `bbox ${b.bbox.join(',')}  rgb(${b.color})` +
          (b.area >= MIN_BLOB && b.area <= MAX_BLOB && b.anchorFrac < ANCHOR_MAX
            ? '  << FLAG'
            : b.area > MAX_BLOB && b.anchorFrac < ANCHOR_MAX
              ? '  (wash)'
              : '')
      );
  }
  if (res.flagged.length) flaggedPages++;
  if (values.overlay) {
    await overlayImage(fill, res, join(overlayDir, `${id.replace(/\//g, '-')}.detect.png`));
  }
}

console.log(`\n${targets.length} fill(s) audited · ${flaggedPages} flagged.`);
if (flaggedPages) {
  console.log(
    'A flagged blob is paint with no source counterpart — confirm against the line art, then regenerate the fill (gen:coloring-fills / gen-coloring-fills-dark) and re-punch. Washes are info only.'
  );
  process.exitCode = 1;
}
