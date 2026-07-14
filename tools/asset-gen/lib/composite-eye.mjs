// Whole-eye legibility on the FINAL night composite — the gate the piece-wise
// checks miss.
//
// judgeNightEyes (lib/eye-fill.mjs) scores a tiny eye CORE (a catchlight
// interior) against a tight annulus and asks "is there ANY dark nearby?". Two
// ways that misses a blank-orb eye:
//   1. A half-white eye passes: a sliver of dark pupil survives in the annulus,
//      so the local contrast clears the bar even though the eye as a whole reads
//      white. dinosaur/stegosaurus-tall shipped exactly that — the chalk's white
//      sclera and the fill's white catchlight stacked over the pupil so the
//      composited pupil reads near-white, yet every gate passed.
//   2. On a SOLID-pen eye the annulus around the catchlight is the solid-ink
//      pupil, so it is "band-blind" (annulusInkFrac > 0.5) and skipped outright.
//
// Eyes are LOCATED by the pen's nested eye cores (findEyeCores finds the
// catchlight at every eye, solid or ringed) and CONFIRMED by the light fill's
// eye signature — a dark pupil AND a bright sclera near the core.
//
// WHAT WE MEASURE (and why the first attempt over-flagged). The first version
// measured the light fill's whole pupil FOOTPRINT on the composite and failed
// it when that footprint read white. That over-flagged every eye whose dark-mode
// art legitimately draws a SMALL pupil inside a BIG white sclera: the light
// footprint (large light-mode pupil) then lands on the night sclera, reading
// white=1 — indistinguishable from a real blank orb, which also reads white=1.
// Seventeen shipped pages (owl, unicorn, the shape faces, …) tripped it while
// looking perfectly legible.
//
// The distinguishing invariant is local, not footprint-wide: a LEGIBLE eye has a
// dark pupil sitting AT the catchlight core; a BLANK ORB has white there (the
// catchlight bled into the whole orb, no pupil to enclose it). So we sample a
// small disc centred on the core in the composite and ask what fraction is dark.
// Calibrated on two recovered pre-fix true positives (stego 0.03, horse 0.05)
// vs. all 17 over-flags (≥ 0.10) and the good band-blind controls (≥ 0.46):
// coreDarkFrac < CORE_DARK_FRAC_MIN ⇔ blank orb. See tools/asset-gen/tests.
import sharp from 'sharp';
import { BAND_BLIND_INK_FRAC, scoreEyeFill } from './eye-fill.mjs';

// A pupil check is anchored only at a CONFIRMED eye, using the same light-fill
// oracle judgeNightEyes trusts — so shape blanket-checks and segment dots (which
// the light fill paints flat) never gate. Two eye signatures qualify:
//   • lively + strong  — a ringed eye the light fill lit as light-on-dark or
//     dark-on-light (judgeNightEyes's own reference test).
//   • bright + band-blind — a SOLID-pen eye: a bright catchlight core ringed by
//     the solid-ink pupil (annulusInkFrac high). judgeNightEyes SKIPS these as
//     band-blind, which is exactly why the stego blank orb slipped through — so
//     this check must own them.
const STRONG_LIGHT_SIDE = 180;

// Working resolution — coarse enough to be cheap, fine enough for eye-scale.
const WORK_W = 512;
const DARK = 90; // luma below this is "pupil dark" (matches the light-mode pupil)
const WHITE = 200; // luma above this is "sclera/catchlight white"

// A real pupil is small. Blobs outside this area band (fraction of the page) are
// not pupils — too small is antialiasing, too large is a flood that leaked out
// of the eye through a hairline gap into the body.
const PUPIL_MIN_FRAC = 0.00002;
const PUPIL_MAX_FRAC = 0.01;

// The pupil-legibility test: sample a disc centred on the catchlight core in the
// composite, radius CORE_DISC_PUPIL_FRAC × the light pupil's radius, and take the
// fraction of it that is dark. A legible eye has its pupil right there (high
// darkFrac); a blank orb has white there (≈ 0). The disc is deliberately smaller
// than the pupil so it stays inside the pupil for a real eye yet never reaches
// out to unrelated facial darks; a floor keeps it usable on tiny pupils.
const CORE_DISC_PUPIL_FRAC = 0.6;
const CORE_DISC_MIN_PX = 3;

// A real pupil disc keeps most of its mass through this many steps of erosion; a
// thin outline stroke (also dark in the light fill) erodes away. Used only to
// reject stroke-ink blobs from being treated as pupils, not to measure them.
const PUPIL_ERODE_PX = 2;

// Below this core dark-fraction the pupil is a blank orb. Calibrated on two
// recovered pre-fix true positives (stego-tall 0.03, horse-tall 0.05) sitting
// well below every one of the 17 legible over-flags (min 0.10) and the good
// band-blind controls (≥ 0.46). See tools/asset-gen/tests/composite-eye.test.mjs.
export const CORE_DARK_FRAC_MIN = 0.07;

async function grayResized(buf, w, h) {
  const { data } = await sharp(buf)
    .removeAlpha()
    .resize(w, h, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

// Grow the connected dark blob in `light` around a seed; if the seed isn't dark,
// snap to the nearest dark pixel in a small window first (the pen eye core is a
// catchlight, which the light fill paints BRIGHT — the pupil is right beside it).
// Snap only a few px: a real pupil abuts its catchlight core, so a dark seed is
// right there. A larger search lets a flat-fill core (a shape cell) reach a
// distant OUTLINE stroke and flood that instead — which composites white and
// false-positives.
const SEED_SNAP_PX = 4;
function darkBlob(light, w, h, sx, sy) {
  let seed = -1;
  for (let rad = 0; rad <= SEED_SNAP_PX && seed < 0; rad++) {
    for (let dy = -rad; dy <= rad && seed < 0; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (light[y * w + x] < DARK) {
          seed = y * w + x;
          break;
        }
      }
    }
  }
  if (seed < 0) return null;
  const seen = new Uint8Array(w * h);
  const stack = [seed];
  seen[seed] = 1;
  const px = [];
  while (stack.length) {
    const p = stack.pop();
    px.push(p);
    const x = p % w;
    const y = (p / w) | 0;
    const nb = [
      x > 0 ? p - 1 : -1,
      x < w - 1 ? p + 1 : -1,
      y > 0 ? p - w : -1,
      y < h - 1 ? p + w : -1,
    ];
    for (const q of nb)
      if (q >= 0 && !seen[q] && light[q] < DARK) {
        seen[q] = 1;
        stack.push(q);
      }
  }
  return px;
}

// Stats of a filled disc of radius R centred on (cx, cy) in a gray buffer.
function discStats(g, w, h, cx, cy, R) {
  const R2 = R * R;
  const vals = [];
  for (let y = Math.max(0, cy - R); y <= Math.min(h - 1, cy + R); y++)
    for (let x = Math.max(0, cx - R); x <= Math.min(w - 1, cx + R); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= R2) vals.push(g[y * w + x]);
  if (!vals.length) return { median: 255, whiteFrac: 1, darkFrac: 0 };
  vals.sort((a, b) => a - b);
  return {
    median: vals[vals.length >> 1],
    whiteFrac: vals.filter((v) => v > WHITE).length / vals.length,
    darkFrac: vals.filter((v) => v < DARK).length / vals.length,
  };
}

// Score every eye pupil on the night composite. `compBuf` is the simulated final
// render (compositeNight), `lightBuf` the committed light raw, `penBuf` the pen
// outline that locates the eyes. Returns one entry per confirmed pupil plus a
// verdict; pages with no confirmed eye aren't gated (passes: true).
export async function scoreCompositeEyes(compBuf, lightBuf, penBuf) {
  // Scope: ONLY the band-blind solid-pen eyes judgeNightEyes skips outright — a
  // bright catchlight core ringed by the solid-ink pupil (annulusInkFrac high).
  // Ringed eyes (a fillable pupil around the catchlight) are already gated by
  // judgeNightEyes, and re-checking them here only risks false positives on
  // big-sclera eyes; this check is the COMPLEMENT, covering the blind spot the
  // stego blank orb slipped through, not a second pass over the same eyes.
  const lightScored = await scoreEyeFill(lightBuf, penBuf);
  const refs = lightScored.cores.filter(
    (c) => c.coreLuma >= STRONG_LIGHT_SIDE && c.annulusInkFrac > BAND_BLIND_INK_FRAC
  );
  if (!refs.length) return { pupils: [], passes: true, worst: null, failed: 0 };
  const srcMeta = await sharp(penBuf).metadata();
  const meta = await sharp(compBuf).metadata();
  const w = WORK_W;
  const h = Math.max(1, Math.round((meta.height * w) / meta.width));
  const page = w * h;
  const light = await grayResized(lightBuf, w, h);
  const comp = await grayResized(compBuf, w, h);

  const pupils = [];
  const claimed = new Uint8Array(page); // dedupe eyes whose cores share a pupil
  for (const ref of refs) {
    const cx = Math.round((ref.x / srcMeta.width) * w);
    const cy = Math.round((ref.y / srcMeta.height) * h);
    const blob = darkBlob(light, w, h, cx, cy);
    if (!blob) continue;
    if (blob.length < page * PUPIL_MIN_FRAC || blob.length > page * PUPIL_MAX_FRAC) continue;
    if (claimed[blob[0]]) continue;
    // A pupil is a FILLED, roundish disc. Outline ink is dark too (luma < DARK),
    // so a seed that snaps to a stroke floods a thin, sprawling blob — reject it
    // by bounding-box fill and aspect, or shapes and stroke segments (which
    // composite white and have no real eye) false-positive.
    let bMinX = w;
    let bMinY = h;
    let bMaxX = 0;
    let bMaxY = 0;
    for (const p of blob) {
      const x = p % w;
      const y = (p / w) | 0;
      if (x < bMinX) bMinX = x;
      if (x > bMaxX) bMaxX = x;
      if (y < bMinY) bMinY = y;
      if (y > bMaxY) bMaxY = y;
    }
    const bw = bMaxX - bMinX + 1;
    const bh = bMaxY - bMinY + 1;
    if (blob.length / (bw * bh) < 0.4) continue; // not a filled disc
    if (Math.max(bw, bh) / Math.min(bw, bh) > 2.5) continue; // not roundish

    // A filled pupil disc keeps most of its mass through erosion; a thin outline
    // stroke (also dark in the light fill) erodes away. If little survives, this
    // blob is stroke ink, not a pupil — the shape pages false-positived here.
    let eroded = new Set(blob);
    for (let step = 0; step < PUPIL_ERODE_PX; step++) {
      const next = new Set();
      for (const p of eroded) {
        const x = p % w;
        const y = (p / w) | 0;
        if (
          x > 0 &&
          eroded.has(p - 1) &&
          x < w - 1 &&
          eroded.has(p + 1) &&
          y > 0 &&
          eroded.has(p - w) &&
          y < h - 1 &&
          eroded.has(p + w)
        ) {
          next.add(p);
        }
      }
      eroded = next;
    }
    if (eroded.size < Math.max(12, blob.length * 0.3)) continue;
    for (const p of blob) claimed[p] = 1;

    const bx = blob.reduce((s, p) => s + (p % w), 0) / blob.length;
    const by = blob.reduce((s, p) => s + ((p / w) | 0), 0) / blob.length;
    // Measure the composite in a small disc AT the catchlight core — not over the
    // light pupil's footprint, which lands on the (legitimately larger) night
    // sclera and reads white for legible and blank eyes alike. A real pupil sits
    // at the core (dark); a blank orb is white there.
    const pupilRadius = Math.sqrt(blob.length / Math.PI);
    const R = Math.max(CORE_DISC_MIN_PX, Math.round(pupilRadius * CORE_DISC_PUPIL_FRAC));
    const { median, whiteFrac, darkFrac } = discStats(comp, w, h, cx, cy, R);
    const blankOrb = darkFrac < CORE_DARK_FRAC_MIN;
    pupils.push({
      x: Math.round((bx / w) * 100) / 100,
      y: Math.round((by / h) * 100) / 100,
      px: blob.length,
      median,
      whiteFrac: Math.round(whiteFrac * 100) / 100,
      coreDarkFrac: Math.round(darkFrac * 100) / 100,
      blankOrb,
    });
  }
  // Worst = the emptiest pupil (least dark at the core).
  const failed = pupils.filter((p) => p.blankOrb);
  const worst = failed.sort((a, b) => a.coreDarkFrac - b.coreDarkFrac)[0] ?? null;
  return { pupils, passes: failed.length === 0, worst, failed: failed.length };
}
