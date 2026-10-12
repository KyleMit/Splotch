// Morphology and distance-transform helpers on 0/1 masks, shared by the drift
// scorer (gen-night-fills.mjs), the chalk-outline generator
// (gen-chalk-outlines.mjs), and the solid-region scorer (solid-regions.mjs).
//
// Separable box morphology: dilate = a pixel is set if ANY neighbor within r
// is set; erode = set only if ALL neighbors within r are set. An
// erode-then-dilate (opening) removes structures thinner than ~2r while
// preserving solid blobs — the trick both callers use to tell thin strokes
// from deliberate solid regions.
//
// An independent set of the same operators lives in
// tools/model-eval/lib/composition-score.mjs. The divergence is deliberate, not
// drift: dilate and erode here are separable box kernels and chamferDistance is
// weighted 1/1.414, while that module derives dilate and erode from a 3-4
// integer chamfer. Each scorer's thresholds are calibrated to its own numerics,
// so sharing one implementation would change the scoring output and require
// both scorers to be recalibrated independently.
function morph(mask, w, h, r, dilate, outOfBounds) {
  const hit = dilate ? 1 : 0; // dilate stops on the first set; erode stops on first unset
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = dilate ? 0 : 1;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const v = xx < 0 || xx >= w ? outOfBounds : mask[y * w + xx];
        if (v === hit) {
          on = hit;
          break;
        }
      }
      tmp[y * w + x] = on;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = dilate ? 0 : 1;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        const v = yy < 0 || yy >= h ? outOfBounds : tmp[yy * w + x];
        if (v === hit) {
          on = hit;
          break;
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}
export const dilateMask = (mask, w, h, r, outOfBounds = 0) =>
  morph(mask, w, h, r, true, outOfBounds);
export const erodeMask = (mask, w, h, r) => morph(mask, w, h, r, false, 0);

// This intentionally differs from erodeMask's box kernel by using four orthogonal neighbors.
export function erodeCross(mask, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[i] = mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w] ? 1 : 0;
    }
  }
  return out;
}

// Two-pass chamfer distance-to-light transform: for each mask pixel, its
// approximate distance to the nearest unset (non-mask) pixel, using edge
// weight 1 and diagonal weight 1.414 (√2). Unset pixels are distance 0.
export function chamferDistance(mask, w, h) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? Infinity : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + 1);
      if (y > 0) m = Math.min(m, d[i - w] + 1);
      if (x > 0 && y > 0) m = Math.min(m, d[i - w - 1] + 1.414);
      if (x < w - 1 && y > 0) m = Math.min(m, d[i - w + 1] + 1.414);
      d[i] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let m = d[i];
      if (x < w - 1) m = Math.min(m, d[i + 1] + 1);
      if (y < h - 1) m = Math.min(m, d[i + w] + 1);
      if (x < w - 1 && y < h - 1) m = Math.min(m, d[i + w + 1] + 1.414);
      if (x > 0 && y < h - 1) m = Math.min(m, d[i + w - 1] + 1.414);
      d[i] = m;
    }
  }
  return d;
}
