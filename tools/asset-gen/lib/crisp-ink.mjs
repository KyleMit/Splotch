// Edge-crisping tone curve for DARK-MODE line art (the chalk outlines).
//
// Why the chalk needs this and the pen does not: dark mode shows line art by
// inverting it and SCREENING it over a near-black board (ADR-0052), and the
// night punch cuts fill pixels wherever the chalk is ink-dark
// (lib/punch-fill.mjs, binary at OUTLINE_LUMA_THRESHOLD). Both steps amplify
// every deviation from pure white/ink that light mode's multiply-over-white
// paper hides: a faintly-grey ground pixel glows on the dark board, webp
// ringing along a soft 2–3px antialias ramp jitters which edge pixels cross
// the punch threshold, and a spuriously punched fill pixel shows the dark
// paper that the screened mid-grey chalk above it cannot re-brighten — a dark
// speck against the fill. Together they read as a dirty ring of specks hugging
// every chalk line in the combined dark-mode image.
//
// The cure is a smoothstep S-curve CENTERED ON THE PUNCH THRESHOLD: pin
// near-white to pure white and near-ink to pure ink, keeping only a narrow
// (~1px) antialias ramp — a hard threshold would jaggy the lines and fail the
// generators' registration gates. Centering the ramp on the punch threshold
// leaves the punch boundary (and so the stroke widths every ink-on-white
// analysis tool measures) exactly where it was.
import sharp from 'sharp';

// Ramp ends, symmetric around lib/punch-fill.mjs's OUTLINE_LUMA_THRESHOLD (150).
const CRISP_LO = 110;
const CRISP_HI = 190;

const LUT = new Uint8Array(256);
for (let v = 0; v < 256; v++) {
  const t = Math.min(1, Math.max(0, (v - CRISP_LO) / (CRISP_HI - CRISP_LO)));
  LUT[v] = Math.round(255 * t * t * (3 - 2 * t));
}

// Ink-on-white line art in, same image with crisped edges out (lossless PNG,
// grayscale) — callers pick their own final encode.
export async function crispInk(buf) {
  const { data, info } = await sharp(buf).grayscale().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i++) data[i] = LUT[data[i]];
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer();
}
