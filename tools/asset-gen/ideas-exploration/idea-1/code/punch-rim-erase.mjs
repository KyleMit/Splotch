// RECOMMENDED FIX for IDEAS.md #1 (validated 2026-07-12) — the "dark-rim erase":
// an opt-in extension of the night punch for pages whose raw re-inked the
// outlines dark (lineW below the 150 gate; currently only vehicles/train-wide).
//
// Rule: extend the chalk punch mask by every pixel that is
//   (1) within RIM_R px (chebyshev) of chalk ink, and
//   (2) mid-dark in the raw fill: RIM_PROTECT_BLACK <= luma < RIM_DARK.
// The added pixels are inpainted by the punch's standard neighbor bleed.
//
// Why each bound exists (all empirically verified — see ../report.md):
// - upper bound RIM_DARK=145: the re-inked overhang reads as a mid-dark
//   penumbra (luma ~80-140) hugging the stroke; pixels this dark next to a
//   chalk line are either that penumbra or a legit dark fill that re-bleeds
//   its own color invisibly. On bright-line pages (lineW ~255) almost nothing
//   matches -> natural no-op.
// - lower bound RIM_PROTECT_BLACK=55: deliberate near-black ink (the owl's
//   bold eye ring, pupils) must NOT be eaten — without this floor the owl's
//   eye ring (luma <40, ~6px wide, chalk on both sides) is bled away to white.
// - RIM_R=2: r=1 leaves visible rim; r=3+ starts eroding pupil edges.
// - The page gate (lineW < 150) keeps this off the 90+ healthy pages; the
//   luma bounds are defense in depth, not a substitute for the gate.
//
// Rejected alternatives (see report.md): blanket dilate r=2 (erodes small eye
// features), painting the rim WHITE instead of inpainting (adds white halos),
// thin-structure opening (cannot separate a 5px shadow from a 6px legit ring),
// Gemini "whiten the outlines, change nothing else" edit (whitens lines but
// redraws eyes/fills — 3.6-14.9% of fill pixels drift).
//
// Integration sketch: in lib/punch-fill.mjs, after building `mask` and before
// bleedUnderMask, when the caller passes { rimErase: true } (set by
// punch-fill-outlines.mjs for pages listed with a dark-outline flag, or
// auto-detected by scoring lineW of the raw against the chalk):
//
//     if (rimErase) addRimOverhang(mask, fill, width, height);
//
// Standalone demo (run from the Splotch repo root):
//     node punch-rim-erase.mjs vehicles/train-wide out.webp
import { createRequire } from "node:module";
import { join } from "node:path";
import { dilateMask } from "/home/user/Splotch/tools/asset-gen/lib/morphology.mjs";

const sharp = createRequire("/home/user/Splotch/tools/asset-gen/x.mjs")(
  "sharp",
);
const RIM_R = 2;
const RIM_DARK = 145;
const RIM_PROTECT_BLACK = 55;
const OUTLINE_LUMA_THRESHOLD = 150; // lib/punch-fill.mjs

// The one function to lift into lib/punch-fill.mjs. `rgb` is the raw fill's
// interleaved RGB, `mask` the 0/1 chalk-ink mask; mutates `mask` in place.
export function addRimOverhang(mask, rgb, width, height) {
  const grown = dilateMask(mask, width, height, RIM_R);
  let added = 0;
  for (let p = 0; p < width * height; p++) {
    if (!grown[p] || mask[p]) continue;
    const luma =
      0.299 * rgb[p * 3] + 0.587 * rgb[p * 3 + 1] + 0.114 * rgb[p * 3 + 2];
    if (luma >= RIM_PROTECT_BLACK && luma < RIM_DARK) {
      mask[p] = 1;
      added++;
    }
  }
  return added;
}

// --- standalone demo below ---
function bleedUnderMask(rgb, mask, width, height) {
  // verbatim copy of lib/punch-fill.mjs
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
      for (const q of [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        p - width,
        p + width,
      ]) {
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

if (process.argv[2]) {
  const REPO = "/home/user/Splotch";
  const page = process.argv[2];
  const out = process.argv[3] ?? "rim-erased.webp";
  const rawPath = join(
    REPO,
    "tools/asset-gen/fill-src",
    `${page}.night.raw.webp`,
  );
  const chalkPath = join(REPO, "web/static/coloring", `${page}.chalk.webp`);
  const {
    data: fill,
    info: { width, height },
  } = await sharp(rawPath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: line } = await sharp(chalkPath)
    .removeAlpha()
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < width * height; p++, i += 3) {
    const luma = 0.299 * line[i] + 0.587 * line[i + 1] + 0.114 * line[i + 2];
    if (luma < OUTLINE_LUMA_THRESHOLD) mask[p] = 1;
  }
  const added = addRimOverhang(mask, fill, width, height);
  bleedUnderMask(fill, mask, width, height);
  await sharp(fill, { raw: { width, height, channels: 3 } })
    .webp({ quality: 85, effort: 6 })
    .toFile(out);
  console.log(
    `${page}: rim-erase added ${added} px to the punch mask -> ${out}`,
  );
}
