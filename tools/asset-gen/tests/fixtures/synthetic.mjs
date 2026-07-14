// Synthetic fixtures for the quality-gate unit tests.
//
// Why synthetic instead of recovered pre-fix regressions: the deterministic
// gates score PIXEL GEOMTRY (solid-region area, ring-nesting depth, outline
// registration, eye-core contrast), so a hand-drawn shape exercises the same
// code path a shipped regression did — while giving two properties a recovered
// asset can't: (1) no dependency on an old commit still reproducing its bug, and
// (2) each broken fixture trips EXACTLY ONE gate, which is what the load-bearing
// redundancy matrix (docs/gate-redundancy.md) needs to attribute a catch. Where
// a gate is genuinely native-resolution / real-imagery bound (the composite-eye
// blank-orb detector), that suite keeps its recovered webp crops instead — see
// composite-eye.test.mjs. Each builder here is validated inside its suite: the
// gate must FAIL the broken fixture and PASS the good one, with a margin.
//
// All builders return an encoded PNG buffer (what every scorer's sharp pipeline
// accepts), drawn on a white canvas with black ink — the polarity the line-art
// scorers expect.
import sharp from 'sharp';

// ---- raw-RGB drawing primitives on a white canvas ----
function canvas(w, h) {
  return { d: Buffer.alloc(w * h * 3, 255), w, h };
}
function px({ d, w }, x, y, v) {
  const i = (y * w + x) * 3;
  d[i] = d[i + 1] = d[i + 2] = v;
}
function disc(c, cx, cy, r, v = 0) {
  for (let y = Math.max(0, cy - r); y <= Math.min(c.h - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(c.w - 1, cx + r); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(c, x, y, v);
}
function ring(c, cx, cy, r, t = 3, v = 0) {
  const rin = r - t;
  for (let y = Math.max(0, cy - r); y <= Math.min(c.h - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(c.w - 1, cx + r); x++) {
      const dd = (x - cx) ** 2 + (y - cy) ** 2;
      if (dd <= r * r && dd >= rin * rin) px(c, x, y, v);
    }
}
function rectStroke(c, x0, y0, x1, y1, t = 3, v = 0) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (x < x0 + t || x > x1 - t || y < y0 + t || y > y1 - t) px(c, x, y, v);
}
function fillRect(c, x0, y0, x1, y1, v) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(c, x, y, v);
}
const encode = (c) =>
  sharp(c.d, { raw: { width: c.w, height: c.h, channels: 3 } })
    .png()
    .toBuffer();

// ===================== SOLIDITY (lib/solid-regions.mjs) =====================
// BROKEN: a large SOLID black pupil disc — the class the punch/invert can't
// survive (biggestBlob far over SOLID_BLOB_MAX).
export function solidPupilOutline() {
  const c = canvas(400, 400);
  rectStroke(c, 40, 40, 360, 360, 4);
  ring(c, 150, 200, 40, 4);
  disc(c, 150, 200, 22, 0); // the solid pupil
  ring(c, 260, 200, 40, 4);
  ring(c, 260, 200, 18, 4);
  return encode(c);
}
// GOOD: the same page drawn with thin strokes only — nothing survives the
// erosion (biggestBlob ≈ 0).
export function thinStrokeOutline() {
  const c = canvas(400, 400);
  rectStroke(c, 40, 40, 360, 360, 4);
  ring(c, 150, 200, 40, 4);
  ring(c, 150, 200, 18, 4);
  ring(c, 260, 200, 40, 4);
  ring(c, 260, 200, 18, 4);
  return encode(c);
}
// BROKEN via the SECOND bar: two medium solid cores, each small enough to duck
// the blob bar, but whose TOTAL surviving interior clears SOLID_INTERIOR_MAX —
// the fake-hollow class the interiorPx bar exists to catch.
export function fakeHollowOutline() {
  const c = canvas(400, 400);
  rectStroke(c, 40, 40, 360, 360, 4);
  disc(c, 150, 200, 14, 0);
  disc(c, 250, 200, 14, 0);
  return encode(c);
}

// ============= EYE RINGS + EYE FILL (lib/eye-fill.mjs) =============
// Concentric ink circles produce the nested enclosed regions the eye finder
// keys on. Depth ≈ ring count; the page is large so every ring stays eye-scale.
// nRings=3 → a normal eye (depth 3, passes); nRings=5 → the "hypno swirl"
// (depth 5, over EYE_RING_DEPTH_MAX).
export function concentricEyeSource(nRings) {
  const c = canvas(600, 600);
  rectStroke(c, 20, 20, 580, 580, 4);
  for (let k = 0; k < nRings; k++) ring(c, 300, 300, 12 + k * 8, 2);
  return encode(c);
}
export const goodEyeSource = () => concentricEyeSource(3);
export const swirlEyeSource = () => concentricEyeSource(5);

// Fills measured against goodEyeSource() (eye center at 300,300).
// LIVELY: a dark pupil disc on a white sclera — strong dark-core contrast.
export function eyeLivelyFill() {
  const c = canvas(600, 600);
  disc(c, 300, 300, 14, 20);
  return encode(c);
}
// FLAT-FLOODED: the whole eye one navy color — the bee-wide night failure, dead
// in both contrast directions.
export function eyeFloodFill() {
  const c = canvas(600, 600);
  fillRect(c, 250, 250, 350, 350, 34);
  return encode(c);
}

// ===================== OUTLINE MATCH (lib/outline-match.mjs) =====================
// A big registering subject (the border) plus one small feature (a flower) in a
// corner tile. The drifted candidate shifts ONLY the flower ~14px, so global
// keep stays high (the subject dominates) while the flower's tile collapses —
// the ant-wide localized-drift class the global average buries.
function matchScene(flowerCx, flowerCy) {
  const c = canvas(600, 600);
  rectStroke(c, 60, 60, 540, 540, 5);
  ring(c, flowerCx, flowerCy, 30, 4);
  ring(c, flowerCx, flowerCy, 12, 4);
  return encode(c);
}
export const matchSource = () => matchScene(200, 460);
export const matchDrifted = () => matchScene(214, 474);
