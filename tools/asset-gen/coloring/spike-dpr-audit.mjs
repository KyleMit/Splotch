// SPIKE for issue 264 (throwaway branch): how much resolution does the shipped
// 1536 px fill actually lose on the device classes the app serves, now that the
// line art is vector (ADR-0129/0152) and only the fill under it is raster?
//
// Three experiments per page × theme:
//   A. device grid — the fill drawn the way magicBrush.ts draws it (contain-fit,
//      bilinear upscale into a sheet at min(DPR, 2)), with the SVG overlay
//      rasterized crisp at the same grid. Crops: fill-only vs composite.
//   B. pseudo-reference — the master downscaled by the iPad's upscale factor and
//      upscaled back onto the master grid, compared against the master itself.
//      That is the loss a native-resolution asset would remove. Measured for the
//      fill alone and for the composite, with the fraction of loss under ink.
//   C. remedy 1 proxy — bilinear (what the browser does today) vs lanczos3 (a
//      shipped pre-upscale) on the same pseudo-reference, so the delta a
//      deterministic pre-upscale could buy is a number, not a hope.
// Plus the byte cost of a 3072 px tier for the two pages.
//
//   node tools/asset-gen/coloring/spike-dpr-audit.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { COLORING_DIR, REPO_ROOT } from '../lib/asset-paths.mjs';

const OUT = join(REPO_ROOT, 'docs/scratchpad/spike-264');
const PAGES = ['creatures/dragon-wide', 'space/station-wide'];
const THEMES = ['light', 'night'];
const CROP_PX = 320;
const INK_ALPHA = 105;
const INK_NEAR_PX = 2;
const LOSS_VISIBLE = 8;
const MAX_RENDER_SCALE = 2;
const PAPER_LONG_TO_SHORT = 1.5;
// iPad Pro 12.9" measured 2564 device px for a 1366 CSS px × DPR 2 = 2732 px long
// edge (issue comment 2026-08-17): the toolbar and margins take ~6%.
const CHROME_FRACTION = 2564 / 2732;

const DEVICES = [
  { name: 'iPad Pro 12.9" (1366×1024 css, DPR 2)', css: [1366, 1024], dpr: 2, measured: 2564 },
  { name: 'iPad Air/Pro 11" (1180×820 css, DPR 2)', css: [1180, 820], dpr: 2 },
  { name: 'iPad mini (1133×744 css, DPR 2)', css: [1133, 744], dpr: 2 },
  { name: 'Galaxy S21 FE (851×393 css, DPR 3 → sheet 2×)', css: [851, 393], dpr: 3 },
  { name: 'iPhone 15 (852×393 css, DPR 3 → sheet 2×)', css: [852, 393], dpr: 3 },
  { name: 'MacBook Air (1440×900 css, DPR 2)', css: [1440, 900], dpr: 2 },
  { name: 'Desktop (1920×1080 css, DPR 1)', css: [1920, 1080], dpr: 1 },
];

function deviceTable() {
  const rows = DEVICES.map((d) => {
    const [long, short] = d.css;
    const paperLongCss = Math.min(long, short * PAPER_LONG_TO_SHORT);
    const sheetScale = Math.min(d.dpr, MAX_RENDER_SCALE);
    const estimated = Math.round(paperLongCss * sheetScale * CHROME_FRACTION);
    const longEdgePx = d.measured ?? estimated;
    return {
      device: d.name,
      sheetLongEdgePx: longEdgePx,
      source: d.measured ? 'measured' : 'estimated',
      upscaleVsMaster: (longEdgePx / 1536).toFixed(2),
      upscaleVsCompact: (longEdgePx / 1152).toFixed(2),
    };
  });
  return rows;
}

async function rasterOverlay(svgPath, width) {
  const r = new Resvg(await readFile(svgPath), {
    fitTo: { mode: 'width', value: width },
    shapeRendering: 2,
    imageRendering: 1,
    font: { loadSystemFonts: false },
  }).render();
  return { rgba: Buffer.from(r.pixels), width: r.width, height: r.height };
}

function compositeInk(fillRgb, overlay, ink) {
  const out = Buffer.from(fillRgb);
  const n = overlay.width * overlay.height;
  for (let p = 0; p < n; p++) {
    const a = overlay.rgba[p * 4 + 3] / 255;
    if (!a) continue;
    for (let c = 0; c < 3; c++) out[p * 3 + c] = Math.round(out[p * 3 + c] * (1 - a) + ink * a);
  }
  return out;
}

function nearInkMask(overlay) {
  const { width, height, rgba } = overlay;
  const ink = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) ink[p] = rgba[p * 4 + 3] > INK_ALPHA ? 1 : 0;
  const near = new Uint8Array(ink);
  for (let r = 0; r < INK_NEAR_PX; r++) {
    const prev = new Uint8Array(near);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (prev[p]) continue;
        if (
          (x > 0 && prev[p - 1]) ||
          (x < width - 1 && prev[p + 1]) ||
          (y > 0 && prev[p - width]) ||
          (y < height - 1 && prev[p + width])
        )
          near[p] = 1;
      }
  }
  return near;
}

function lossStats(a, b, near) {
  const n = a.length / 3;
  let sum = 0;
  let visible = 0;
  let visibleNearInk = 0;
  const hist = new Uint32Array(256);
  for (let p = 0; p < n; p++) {
    const d = Math.max(
      Math.abs(a[p * 3] - b[p * 3]),
      Math.abs(a[p * 3 + 1] - b[p * 3 + 1]),
      Math.abs(a[p * 3 + 2] - b[p * 3 + 2])
    );
    sum += d;
    hist[d]++;
    if (d >= LOSS_VISIBLE) {
      visible++;
      if (near && near[p]) visibleNearInk++;
    }
  }
  let acc = 0;
  let p99 = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= n * 0.99) {
      p99 = v;
      break;
    }
  }
  return {
    meanAbs: +(sum / n).toFixed(2),
    p99,
    visibleFraction: +(visible / n).toFixed(4),
    visibleUnderOrBesideInk: visible ? +(visibleNearInk / visible).toFixed(3) : null,
  };
}

async function toRgb(buf, w, h) {
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } });
}

// The most detailed CROP_PX window: where the fill has the most non-ink colour
// change, i.e. where upscale softness is not hidden by a line on top.
function pickCrop(fillRgb, near, width, height) {
  const step = 32;
  let best = { x: 0, y: 0, score: -1 };
  for (let y = 0; y + CROP_PX <= height; y += step)
    for (let x = 0; x + CROP_PX <= width; x += step) {
      let score = 0;
      for (let yy = y; yy < y + CROP_PX; yy += 2)
        for (let xx = x; xx + 1 < x + CROP_PX; xx += 2) {
          const p = yy * width + xx;
          if (near[p] || near[p + 1]) continue;
          score += Math.abs(fillRgb[p * 3] - fillRgb[(p + 1) * 3]);
        }
      if (score > best.score) best = { x, y, score };
    }
  return best;
}

function label(text, width) {
  return Buffer.from(
    `<svg width="${width}" height="22"><rect width="100%" height="100%" fill="#222"/><text x="6" y="15" font-family="sans-serif" font-size="12" fill="#fff">${text}</text></svg>`
  );
}

async function montage(panels, outPath) {
  const w = panels[0].width;
  const h = panels[0].height;
  const gap = 8;
  const total = panels.length * w + (panels.length - 1) * gap;
  const composites = [];
  for (const [i, p] of panels.entries()) {
    composites.push({ input: await p.png, left: i * (w + gap), top: 22 });
    composites.push({ input: label(p.label, w), left: i * (w + gap), top: 0 });
  }
  await sharp({
    create: { width: total, height: h + 22, channels: 3, background: '#888' },
  })
    .composite(composites)
    .png()
    .toFile(outPath);
}

async function cropPng(rgbBuf, w, h, crop, scale = 1) {
  let img = (await toRgb(rgbBuf, w, h)).extract({
    left: Math.round(crop.x * scale),
    top: Math.round(crop.y * scale),
    width: Math.round(CROP_PX * scale),
    height: Math.round(CROP_PX * scale),
  });
  return img.png().toBuffer();
}

async function runPage(page, theme, ipadScale, report) {
  const [book, stem] = page.split('/');
  const fillPath = join(COLORING_DIR, book, `${stem}.${theme}.webp`);
  const svgPath = join(COLORING_DIR, book, `${stem}.${theme === 'light' ? '' : 'dark.'}overlay.svg`);
  const ink = theme === 'light' ? 0 : 255;
  const master = await sharp(fillPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = master.info.width;
  const H = master.info.height;
  const overlay1x = await rasterOverlay(svgPath, W);
  const near = nearInkMask(overlay1x);
  const crop = pickCrop(master.data, near, W, H);
  const tag = `${book}-${stem}.${theme}`;

  // B + C: pseudo-reference on the master grid.
  const downW = Math.round(W / ipadScale);
  const down = await (await toRgb(master.data, W, H))
    .resize(downW, null, { kernel: 'lanczos3' })
    .raw()
    .toBuffer();
  const downH = Math.round(H * (downW / W));
  const upscaled = {};
  for (const kernel of ['linear', 'lanczos3']) {
    upscaled[kernel] = await (await toRgb(down, downW, downH)).resize(W, H, { kernel }).raw().toBuffer();
  }
  const masterComposite = compositeInk(master.data, overlay1x, ink);
  const rows = {};
  for (const kernel of ['linear', 'lanczos3']) {
    rows[kernel] = {
      fillOnly: lossStats(master.data, upscaled[kernel], near),
      composite: lossStats(masterComposite, compositeInk(upscaled[kernel], overlay1x, ink), near),
    };
  }
  report.pseudoReference[tag] = { simulatedUpscale: +(W / downW).toFixed(2), crop, ...rows };

  await montage(
    [
      { label: `${tag} — master (native-res reference)`, png: cropPng(masterComposite, W, H, crop), width: CROP_PX, height: CROP_PX },
      { label: `same, after ${(W / downW).toFixed(2)}x round trip (bilinear, = today on iPad)`, png: cropPng(compositeInk(upscaled.linear, overlay1x, ink), W, H, crop), width: CROP_PX, height: CROP_PX },
      { label: `same round trip, lanczos3 up (= remedy 1)`, png: cropPng(compositeInk(upscaled.lanczos3, overlay1x, ink), W, H, crop), width: CROP_PX, height: CROP_PX },
    ],
    join(OUT, `${tag}.pseudo-reference.png`)
  );
  await montage(
    [
      { label: `${tag} — master fill, no overlay`, png: cropPng(master.data, W, H, crop), width: CROP_PX, height: CROP_PX },
      { label: `fill after round trip, no overlay (worst case)`, png: cropPng(upscaled.linear, W, H, crop), width: CROP_PX, height: CROP_PX },
    ],
    join(OUT, `${tag}.fill-only.png`)
  );

  // A: the real iPad grid.
  const ipadW = Math.round(W * ipadScale);
  const ipadH = Math.round(H * ipadScale);
  const fillIpad = await sharp(fillPath).removeAlpha().resize(ipadW, ipadH, { kernel: 'linear' }).raw().toBuffer();
  const overlayIpad = await rasterOverlay(svgPath, ipadW);
  const compositeIpad = compositeInk(fillIpad, overlayIpad, ink);
  await montage(
    [
      { label: `${tag} — iPad grid ${ipadW}px: fill alone (bilinear ${ipadScale}x)`, png: cropPng(fillIpad, ipadW, ipadH, crop, ipadScale), width: Math.round(CROP_PX * ipadScale), height: Math.round(CROP_PX * ipadScale) },
      { label: `iPad grid: fill + vector overlay (what the child sees)`, png: cropPng(compositeIpad, ipadW, ipadH, crop, ipadScale), width: Math.round(CROP_PX * ipadScale), height: Math.round(CROP_PX * ipadScale) },
    ],
    join(OUT, `${tag}.ipad-grid.png`)
  );

  // Byte cost of a 2x tier (3072 px long edge) from a lanczos pre-upscale.
  const tier2x = await sharp(fillPath).removeAlpha().resize(W * 2, H * 2, { kernel: 'lanczos3' }).webp({ quality: 85, effort: 6 }).toBuffer();
  const shippedBytes = (await readFile(fillPath)).length;
  report.tierBytes[tag] = { shipped1536: shippedBytes, lanczos3072q85: tier2x.length, ratio: +(tier2x.length / shippedBytes).toFixed(2) };
}

await mkdir(OUT, { recursive: true });
const report = { devices: deviceTable(), pseudoReference: {}, tierBytes: {} };
const ipadScale = +(report.devices[0].upscaleVsMaster);
for (const page of PAGES) for (const theme of THEMES) await runPage(page, theme, ipadScale, report);
await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.table(report.devices);
console.log(JSON.stringify({ pseudoReference: report.pseudoReference, tierBytes: report.tierBytes }, null, 2));

// Zoomed view: a small window magnified 3x nearest-neighbour so the softness is
// inspectable at all, plus the amplified difference map (x8) of the composite.
const ZOOM = 3;
const ZOOM_PX = 110;
async function zoomPanel(rgb, w, h, x, y) {
  return (await toRgb(rgb, w, h))
    .extract({ left: x, top: y, width: ZOOM_PX, height: ZOOM_PX })
    .resize(ZOOM_PX * ZOOM, ZOOM_PX * ZOOM, { kernel: 'nearest' })
    .png()
    .toBuffer();
}
for (const page of PAGES) {
  const [book, stem] = page.split('/');
  const theme = 'light';
  const fillPath = join(COLORING_DIR, book, `${stem}.${theme}.webp`);
  const svgPath = join(COLORING_DIR, book, `${stem}.overlay.svg`);
  const master = await sharp(fillPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = master.info.width;
  const H = master.info.height;
  const overlay1x = await rasterOverlay(svgPath, W);
  const tag = `${book}-${stem}.${theme}`;
  const crop = report.pseudoReference[tag].crop;
  const downW = Math.round(W / ipadScale);
  const down = await (await toRgb(master.data, W, H)).resize(downW, null, { kernel: 'lanczos3' }).raw().toBuffer();
  const downH = Math.round(H * (downW / W));
  const up = await (await toRgb(down, downW, downH)).resize(W, H, { kernel: 'linear' }).raw().toBuffer();
  const a = compositeInk(master.data, overlay1x, 0);
  const b = compositeInk(up, overlay1x, 0);
  const diff = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) diff[i] = Math.min(255, Math.abs(a[i] - b[i]) * 8);
  const x = crop.x + 100;
  const y = crop.y + 100;
  await montage(
    [
      { label: `${tag} zoom 3x — native-res reference`, png: zoomPanel(a, W, H, x, y), width: ZOOM_PX * ZOOM, height: ZOOM_PX * ZOOM },
      { label: `zoom 3x — after 1.67x round trip (today on iPad)`, png: zoomPanel(b, W, H, x, y), width: ZOOM_PX * ZOOM, height: ZOOM_PX * ZOOM },
      { label: `difference x8 (black = identical)`, png: zoomPanel(diff, W, H, x, y), width: ZOOM_PX * ZOOM, height: ZOOM_PX * ZOOM },
    ],
    join(OUT, `${tag}.zoom.png`)
  );
}
