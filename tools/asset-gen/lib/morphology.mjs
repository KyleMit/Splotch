// Separable box morphology on 0/1 masks, shared by the drift scorer
// (gen-coloring-fills-dark.mjs) and the chalk-outline generator
// (gen-coloring-chalk.mjs). dilate = a pixel is set if ANY neighbor within r is
// set; erode = set only if ALL neighbors within r are set. An erode-then-dilate
// (opening) removes structures thinner than ~2r while preserving solid blobs —
// the trick both callers use to tell thin strokes from deliberate solid regions.
function morph(mask, w, h, r, dilate) {
  const hit = dilate ? 1 : 0; // dilate stops on the first set; erode stops on first unset
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = dilate ? 0 : 1;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const v = xx < 0 || xx >= w ? 0 : mask[y * w + xx];
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
        const v = yy < 0 || yy >= h ? 0 : tmp[yy * w + x];
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
export const dilateMask = (mask, w, h, r) => morph(mask, w, h, r, true);
export const erodeMask = (mask, w, h, r) => morph(mask, w, h, r, false);
