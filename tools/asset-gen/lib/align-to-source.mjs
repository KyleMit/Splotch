// Registration-nudge undo shared by the Gemini image generators
// (gen-coloring-fills.mjs, gen-coloring-fills-dark.mjs, normalize-outline-strokes.mjs).
//
// The model sometimes returns its output nudged a few pixels (usually rightward)
// even though it otherwise lines up perfectly. alignToSource detects that global
// translation and shifts the output back into registration.
//
// It correlates edge maps rather than dark masks: the source's lines and the
// candidate's lines are both strong edges, while flat fills are not — so a solid
// dark fill can't pull the match off the outlines (which a plain dark-pixel
// overlap would). Edges are polarity-agnostic, so this aligns dark fills, light
// fills, and redrawn line art to the same black-on-white source. The winning
// offset is the candidate's displacement; the correction is its negation.
import sharp from 'sharp';

const ALIGN_MAX = 12; // search radius (px) for the registration nudge
const ALIGN_W = 1000; // work resolution for the correlation

async function grayRaw(buf, w, h) {
  const { data } = await sharp(buf)
    .grayscale()
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

function edgeMap(g, w, h) {
  const e = new Float32Array(w * h);
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      e[i] = Math.abs(g[i] - g[i + 1]) + Math.abs(g[i] - g[i + w]);
    }
  }
  return e;
}

export async function alignToSource(candidateBuf, sourceBuf, width, height) {
  const w = Math.min(width, ALIGN_W);
  const h = Math.round((height * w) / width);
  const srcE = edgeMap(await grayRaw(sourceBuf, w, h), w, h);
  const colE = edgeMap(await grayRaw(candidateBuf, w, h), w, h);
  const idx = [];
  const wt = [];
  for (let i = 0; i < srcE.length; i++) {
    if (srcE[i] > 60) {
      idx.push(i);
      wt.push(srcE[i]);
    }
  }
  let best = { dx: 0, dy: 0, score: -1 };
  for (let dy = -ALIGN_MAX; dy <= ALIGN_MAX; dy++) {
    for (let dx = -ALIGN_MAX; dx <= ALIGN_MAX; dx++) {
      let s = 0;
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        const x = (i % w) + dx;
        const y = ((i / w) | 0) + dy;
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        s += wt[k] * colE[y * w + x];
      }
      if (s > best.score) best = { dx, dy, score: s };
    }
  }
  // Scale the detected displacement back to native pixels; the correction is its
  // negation (undo the shift the model applied).
  const scale = width / w;
  const cdx = Math.round(-best.dx * scale);
  const cdy = Math.round(-best.dy * scale);
  if (cdx === 0 && cdy === 0) return { buffer: candidateBuf, dx: 0, dy: 0 };
  const pad = Math.ceil(ALIGN_MAX * scale) + 1;
  // Materialize the padded canvas first; chaining extend+extract in one pipeline
  // lets sharp reorder them and mis-computes the window.
  const extended = await sharp(candidateBuf)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: 'copy' })
    .toBuffer();
  const clamp = (v, hi) => Math.max(0, Math.min(v, hi));
  const buffer = await sharp(extended)
    .extract({
      left: clamp(pad - cdx, 2 * pad),
      top: clamp(pad - cdy, 2 * pad),
      width,
      height,
    })
    .toBuffer();
  return { buffer, dx: cdx, dy: cdy };
}
