// IDEA 13 experiment — detect INVENTED COLORED SHAPES on the open background.
// scoreDrift only counts white/low-chroma pixels (invented OUTLINES); a saturated
// blob (extra star/planet) with no white outline slips every gate. This detector:
//   1. floods the open background from the image border through the source's
//      light pixels (same machinery as scoreNightness),
//   2. finds pixels whose color deviates strongly from the background's median
//      color, outside a dilated source-line mask,
//   3. groups them into connected blobs and flags blobs that are big enough AND
//      "floating" — not anchored to any source line or the image border.
// Anchoring is the key discriminator: a legit fill that leaks into the bg mask
// (an edge-touching ground/planet region) butts against its own source outline
// or the border; an invented shape floats free in the open sky.
//
// Usage (from repo root):
//   node tools/asset-gen/idea13-invented-shape-audit.mjs                 sweep all raws (night+light)
//   node tools/asset-gen/idea13-invented-shape-audit.mjs space/ship-tall.night  one page
//   node tools/asset-gen/idea13-invented-shape-audit.mjs --file /path/to/fill.webp --page space/ship-tall --theme night
//   node tools/asset-gen/idea13-invented-shape-audit.mjs --overlay /out/dir ...  dump detection overlays
//   node tools/asset-gen/idea13-invented-shape-audit.mjs --verbose      per-blob detail for every page
import { parseArgs } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { glob } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { dilateMask } from './lib/morphology.mjs';

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

export async function detectInventedShapes(fillBuf, sourceBuf) {
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
    return { skipped: true, bgFrac: candCount / n, blobs: [], flagged: [] };

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
    cand,
    nearLine,
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
    file: { type: 'string' },
    page: { type: 'string' },
    theme: { type: 'string' },
    overlay: { type: 'string' },
    verbose: { type: 'boolean' },
  },
});

function sourceFor(page) {
  const chalkPath = join(COLORING_DIR, `${page}.chalk.webp`);
  const penPath = join(COLORING_DIR, `${page}.outline.webp`);
  return { chalkPath, penPath };
}

async function auditOne(fillPath, page, theme) {
  const { chalkPath, penPath } = sourceFor(page);
  // night fills score against the chalk when forked (as the dark generator does);
  // light fills always score against the pen
  const srcPath = theme === 'night' && existsSync(chalkPath) ? chalkPath : penPath;
  const fill = await readFile(fillPath);
  const source = await readFile(srcPath);
  const res = await detectInventedShapes(fill, source);
  return { res, fill };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const targets = [];
  if (values.file) {
    targets.push({ fillPath: values.file, page: values.page, theme: values.theme ?? 'night' });
  } else if (positionals.length) {
    for (const p of positionals) {
      // form: {book}/{page}-{orient}.{theme}
      const m = p.match(/^(.+)\.(light|night)$/);
      const page = m ? m[1] : p;
      const themes = m ? [m[2]] : ['light', 'night'];
      for (const theme of themes)
        targets.push({
          fillPath: join(FILL_SRC_DIR, `${page}.${theme}.raw.webp`),
          page,
          theme,
        });
    }
  } else {
    for await (const entry of glob('**/*.{light,night}.raw.webp', { cwd: FILL_SRC_DIR })) {
      const rel = entry.replace(/\\/g, '/');
      const m = rel.match(/^(.+)\.(light|night)\.raw\.webp$/);
      targets.push({ fillPath: join(FILL_SRC_DIR, rel), page: m[1], theme: m[2] });
    }
    targets.sort((a, b) => a.page.localeCompare(b.page) || a.theme.localeCompare(b.theme));
  }

  if (values.overlay) await mkdir(values.overlay, { recursive: true });
  let flaggedPages = 0;
  for (const { fillPath, page, theme } of targets) {
    const { res, fill } = await auditOne(fillPath, page, theme);
    const id = `${page}.${theme}`;
    if (res.skipped) {
      console.log(`${id}  SKIP (bg ${(res.bgFrac * 100).toFixed(1)}%)`);
      continue;
    }
    const big = res.blobs.filter((b) => b.area >= MIN_BLOB);
    const line =
      `${id}  bg ${(res.bgFrac * 100).toFixed(0)}% rgb(${res.bgColor}) ` +
      `blobs≥${MIN_BLOB}: ${big.length}  FLAGGED: ${res.flagged.length}` +
      (res.washes.length ? `  washes: ${res.washes.length}` : '');
    if (res.flagged.length || values.verbose) {
      console.log(line);
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
    } else {
      console.log(line);
    }
    if (res.flagged.length) flaggedPages++;
    if (values.overlay) {
      const outName = `${id.replace(/\//g, '__')}.detect.png`;
      await overlayImage(fill, res, join(values.overlay, outName));
    }
  }
  console.log(`\n${targets.length} fills audited, ${flaggedPages} flagged.`);
}
