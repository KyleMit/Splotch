// Punch a raw colored fill into its shipped fills-only form, shared by the batch
// CLI (punch-fill-outlines.mjs) and the light-fill generator (gen-light-fills.mjs)
// so the mask math can never fork between them.
//
// Why punching exists: the browser overlay <img> already draws the line art on top
// of the canvas, so a fill revealed by the magic brush must carry flat fills ONLY —
// revealing the fill's own copy of the outlines would draw every line twice, and
// any generation drift between the two copies shows as ghosting (ADR-0043 "reveal
// fills only"). Punching at build time ships that final image directly.
//
// HOW the outline pixels are removed (docs/inpainted-fill-punch.md): they are
// INPAINTED — replaced by the surrounding fill color bled inward — and the shipped
// fill is fully OPAQUE, no alpha plane. The first punch cut them to transparency
// instead, which was correct at native resolution but not at display resolution:
// any downscale blends the hard alpha edge with the paper behind the fill, and on
// the dark board the screened chalk above a half-paper pixel can't restore the
// fill's brightness — a dotted dark ring around every line. Bled color under the
// line means there is no alpha edge to resample; the overlay alone decides what a
// line looks like, and misregistration shows fill color, never a ghost line.
//
// The mask math is what the magic brush used to run per-page-load at runtime before
// this moved to build time (ADR-0043). Canonical SVG alpha decides which pixels are
// outline and therefore inpainted; the fill's own color never participates.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR, toPosix } from './asset-paths.mjs';
import { lineArtMask, resolveNightLineArt } from './line-art.mjs';

// Retained for audits of generated raster fills and deterministic SVG-rasterized
// line art. The punch itself uses LINE_ART_ALPHA_THRESHOLD from line-art.mjs.
export const OUTLINE_LUMA_THRESHOLD = 150;
// The content is flat fills revealed under brush strokes, so q85 is visually free;
// effort 6 trades ~2.8s/file of one-off script time for bytes shipped on every
// install. Opaque RGB costs less than the transparent-punch era's lossless binary
// alpha plane did (ant-tall.light: raw 71KB → 88KB with alpha, 82KB inpainted).
const WEBP_QUALITY = 85;
const WEBP_EFFORT = 6;

export function encodePunchedFill(rgb, width, height) {
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
    .toBuffer();
}

// Replace every masked pixel's color with the average of its already-colored
// 4-neighbors, peeling inward ring by ring (two-phase per ring so the bleed is
// direction-neutral). Strokes converge in a few rings; the chalk's solid whites
// (an eye sclera) take ~their radius. Under a stroke the result is a seam of
// blended neighbor color that the overlay line always covers. Exported so the
// halo auditor (coloring/check-night-halo.mjs) can build its reference punch with the
// identical bleed.
export function bleedUnderMask(rgb, mask, width, height) {
  const pending = mask.slice();
  let ring = [];
  for (let p = 0; p < width * height; p++) if (pending[p]) ring.push(p);
  while (ring.length) {
    const done = [];
    const next = [];
    for (const p of ring) {
      const x = p % width;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
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

// Punch one raw fill (fill-src/{book}/{page}-{orient}.{light,night}.raw.webp) into
// its shipped path under web/static/coloring/: outline-dark pixels of the line art
// inpainted with bled fill color, everything else kept. Throws if the page's line
// art is missing.
//
// The mask is per-theme: light fills punch against {page}.overlay.svg and night
// fills punch against {page}.dark.overlay.svg. Alpha is theme-independent, so both
// paths share one threshold and ordinary source-over composition owns line color.
export async function punchFill(rawPath) {
  const rel = toPosix(relative(FILL_SRC_DIR, rawPath));
  const shippedRel = rel.replace(/\.raw\.webp$/, '.webp');
  const penPath = join(COLORING_DIR, shippedRel.replace(/\.(light|night)\.webp$/, '.overlay.svg'));
  const nightLineArt = shippedRel.endsWith('.night.webp')
    ? await resolveNightLineArt(penPath)
    : null;
  const lineArtPath = nightLineArt?.sourcePath ?? penPath;
  if (!existsSync(lineArtPath)) throw new Error(`Missing line art for ${rel}: ${lineArtPath}`);

  const {
    data: fill,
    info: { width, height },
  } = await sharp(await readFile(rawPath))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { mask, count: punchedCount } = await lineArtMask(
    await readFile(lineArtPath),
    width,
    height
  );
  bleedUnderMask(fill, mask, width, height);

  const out = join(COLORING_DIR, shippedRel);
  await writeFile(out, await encodePunchedFill(fill, width, height));
  return { rel: shippedRel, out, punched: punchedCount / (width * height) };
}
