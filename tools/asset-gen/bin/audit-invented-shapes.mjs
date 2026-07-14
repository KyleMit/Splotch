// Audit the committed RAW fills for INVENTED COLORED SHAPES on the open
// background. scoreDrift (lib/night-scores.mjs) only counts white/low-chroma
// pixels — invented OUTLINES — so a colored blob the model added (an extra
// star/planet/flower with no white outline) slips every generation gate; this
// detector is the only thing that caught objects/house-tall's two invented sky
// flowers. Validated as IDEAS #13 (ideas-exploration/idea-13/report.md, with the
// threshold calibration and a synthesized positive). Deterministic, no API
// key/network. Exits non-zero if any fill is flagged, so it doubles as a check.
//
// The detection algorithm lives in lib/invented-shapes.mjs (pure, unit-tested);
// this bin is the catalog walker + overlay renderer around it. Night fills score
// against the chalk when the page has forked, light fills (and unforked pages)
// against the pen — mirroring the generators.
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
import {
  detectInventedShapes,
  W,
  MIN_BLOB,
  MAX_BLOB,
  ANCHOR_MAX,
} from '../lib/invented-shapes.mjs';

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
