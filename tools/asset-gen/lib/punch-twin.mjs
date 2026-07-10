// Punch a raw colored twin into its shipped fills-only form, shared by the batch
// CLI (punch-twin-outlines.mjs) and the light-twin generator (gen-coloring-fills.mjs)
// so the mask math can never fork between them.
//
// Why punching exists: the browser overlay <img> already draws the line art on top
// of the canvas, so a twin revealed by the magic brush must carry flat fills ONLY —
// revealing the twin's own copy of the outlines would draw every line twice, and
// any generation drift between the two copies shows as ghosting (ADR-0043 "reveal
// fills only"). Punching at build time ships that final image directly.
//
// The mask math is what the magic brush used to run per-page-load at runtime before
// this moved to build time (ADR-0043): a line-art pixel with luma (0.299R + 0.587G
// + 0.114B) below OUTLINE_LUMA_THRESHOLD is outline → punched transparent in the
// twin; anything lighter is a fill and kept —
// including legitimately dark fills (a ladybug's spots, a navy sky), because the
// mask keys off the LINE ART's darkness, never the twin's.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, TWIN_SRC_DIR } from './paths.mjs';

// Same bar the runtime mask used before the punch moved to build time (ADR-0043):
// darker than this is outline, lighter is fill.
const OUTLINE_LUMA_THRESHOLD = 150;
// The punched twin inherently costs more than the raw did: the binary alpha plane
// is the line art's shape, encoded losslessly (sharp default alphaQuality 100, kept
// so the holes can't fringe). Measured on ant-tall.light (raw 71KB): q90 108KB,
// q90/effort6 106KB, q85/effort6 88KB, q80/effort6 79KB. The content is flat fills
// revealed under brush strokes, so q85 is visually free; effort 6 trades ~2.8s/file
// of one-off script time for bytes shipped on every install.
const WEBP_QUALITY = 85;
const WEBP_EFFORT = 6;

// Punch one raw twin (twin-src/{book}/{page}-{orient}.{light,night}.raw.webp) into
// its shipped path under web/static/coloring/: alpha = 0 where the line art is
// outline-dark, 255 elsewhere. Throws if the page's line art is missing.
export async function punchTwin(rawPath) {
  const rel = relative(TWIN_SRC_DIR, rawPath).replace(/\\/g, '/');
  const shippedRel = rel.replace(/\.raw\.webp$/, '.webp');
  const lineArtPath = join(
    COLORING_DIR,
    shippedRel.replace(/\.(light|night)\.webp$/, '.outline.webp')
  );
  if (!existsSync(lineArtPath)) throw new Error(`Missing line art for ${rel}: ${lineArtPath}`);

  const {
    data: twin,
    info: { width, height },
  } = await sharp(await readFile(rawPath))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Line art luma at the twin's exact resolution → binary punch mask, interleaved
  // into an explicit RGBA buffer. (Explicit because sharp's joinChannel tags the
  // 4th band as a generic extra channel, not alpha, and the webp encoder silently
  // flattens it — a raw RGBA input can't be misread.)
  const { data: line } = await sharp(await readFile(lineArtPath))
    .removeAlpha()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(width * height * 4);
  let punchedCount = 0;
  for (let p = 0, i = 0; p < width * height; p++, i += 3) {
    const luma = 0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2];
    const keep = luma >= OUTLINE_LUMA_THRESHOLD;
    if (!keep) punchedCount++;
    const o = p * 4;
    rgba[o] = twin[i];
    rgba[o + 1] = twin[i + 1];
    rgba[o + 2] = twin[i + 2];
    rgba[o + 3] = keep ? 255 : 0;
  }

  const out = join(COLORING_DIR, shippedRel);
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
    .toFile(out);
  return { rel: shippedRel, out, punched: punchedCount / (width * height) };
}
