#!/usr/bin/env node
// Diff a capture against a saved baseline, pixel for pixel.
//
// Every iteration on these renderers trades work for pixels, so the only
// question that decides whether an optimisation is allowed is whether it
// changed the picture — and "it looks the same to me" is not an answer for a
// binary-alpha paper tooth, where a real change shows up as a few thousand
// scattered texels nobody would spot by eye.
//
// Reports the fraction of differing pixels and the worst single-channel
// deviation, so a change can be classified as identical, a sub-visual dither
// shift, or a genuine appearance change.
//
// Usage: node tools/gpu-crayon/compare-capture.mjs <baseline.png> <candidate.png>

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { isMain } from '../lib/proc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(HERE, 'output');

// Below this the two images differ only where the ordered-dither band put a
// texel on the other side of a threshold — visible as grain, never as a
// different stroke.
const SUBVISUAL_PIXEL_FRACTION = 0.001;

export async function compareCaptures(baselinePath, candidatePath) {
  const [baseline, candidate] = await Promise.all(
    [baselinePath, candidatePath].map((file) =>
      sharp(file).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
    )
  );

  if (
    baseline.info.width !== candidate.info.width ||
    baseline.info.height !== candidate.info.height
  ) {
    throw new Error(
      `size mismatch: ${baseline.info.width}×${baseline.info.height} vs ${candidate.info.width}×${candidate.info.height}`
    );
  }

  const a = baseline.data;
  const b = candidate.data;
  let differing = 0;
  let worstChannel = 0;
  for (let i = 0; i < a.length; i += 4) {
    let pixelWorst = 0;
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs(a[i + channel] - b[i + channel]);
      if (delta > pixelWorst) pixelWorst = delta;
    }
    if (pixelWorst > 0) {
      differing++;
      if (pixelWorst > worstChannel) worstChannel = pixelWorst;
    }
  }

  const total = a.length / 4;
  const fraction = differing / total;
  return {
    differing,
    total,
    fraction,
    worstChannel,
    verdict:
      differing === 0
        ? 'identical'
        : fraction < SUBVISUAL_PIXEL_FRACTION
          ? 'sub-visual'
          : 'changed',
  };
}

if (isMain(import.meta.url)) {
  const [baseline, candidate] = process.argv.slice(2);
  if (!baseline || !candidate) {
    console.error('usage: compare-capture.mjs <baseline.png> <candidate.png>');
    process.exit(1);
  }
  const resolve = (file) => (path.isAbsolute(file) ? file : path.resolve(OUTPUT_DIR, file));
  const result = await compareCaptures(resolve(baseline), resolve(candidate));
  console.log(
    `${result.verdict}: ${result.differing.toLocaleString()} / ${result.total.toLocaleString()} px ` +
      `(${(result.fraction * 100).toFixed(4)}%), worst channel Δ${result.worstChannel}`
  );
}
