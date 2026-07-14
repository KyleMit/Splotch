// Detect INVENTED COLORED SHAPES on a fill's open background — a colored blob
// the model added (an extra star/planet/flower) that has no white outline, so
// scoreDrift (lib/night-scores.mjs, which only counts white/low-chroma pixels)
// never sees it. This is the only detector that caught objects/house-tall's two
// invented sky flowers. Validated as IDEAS #13 (ideas-exploration/idea-13). Pure,
// deterministic, buffer-in → result-out — no API key, network, or filesystem.
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
// flagged.
import sharp from 'sharp';
import { dilateMask } from './morphology.mjs';

// Geometry constants are inherited unchanged from scoreDrift/scoreNightness
// (lib/night-scores.mjs) so this detector sees the same picture the gates do; the
// blob thresholds are calibrated in ideas-exploration/idea-13/report.md.
export const W = 512; // working width, matches scoreDrift's scale
export const SRC_DARK = 110; // source pixel darker than this = line/solid ink (as scoreDrift)
export const SRC_LIGHT = 170; // source pixel brighter than this = floodable background (as scoreNightness)
export const LINE_DILATE = 6; // px of slack around source ink (registration + glow), as DRIFT_DILATE
export const DEV_T = 60; // Euclidean RGB distance from median bg color to call a pixel "foreign"
export const MIN_BLOB = 60; // px at W=512 — blobs smaller than this are speckle/texture
export const ANCHOR_MAX = 0.05; // blob FLOATS if <5% of its pixels touch the line mask or image border
// Above this area a floating region is a second background WASH (a painted
// ground/sky band — art, reported as info), not a compact invented shape: real
// washes measure 21k-65k px here, real invented shapes 60-1300 px.
export const MAX_BLOB = 8000;
export const MIN_BG_FRAC = 0.04; // skip pages with almost no open background (as scoreNightness)

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
