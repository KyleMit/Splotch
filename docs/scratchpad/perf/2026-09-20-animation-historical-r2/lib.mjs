// Shared by check.mjs and compare.mjs: reads a reduction back into the sample shape the repo's
// scorer reads, and rescores it with the scorer at this checkout.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import {
  rotationFirstFrameNa,
  scoredActionFrameGaps,
  summarizeActions,
} from '../../../../tools/perf/lib/action-stats.mjs';

export const root = dirname(fileURLToPath(import.meta.url));

export const ABBA = ['before-1', 'after-1', 'after-2', 'before-2'];
export const armOf = (capture) => capture.split('-')[0];

// Every set uses the canonical group list, including coloring, with four captures in ABBA order.
export const SETS = [
  ['runs', 'macos', ABBA],
  ['runs', 'ipad-safari', ABBA],
  ['runs', 'ipad-native', ABBA],
  ['runs', 'android-chrome', ABBA],
  ['runs', 'android-native', ABBA],
];

export function readRun(directory, target, capture) {
  const run = JSON.parse(
    gunzipSync(readFileSync(join(root, directory, `${target}-${capture}.actions.reduced.json.gz`)))
  );
  for (const sample of run.samples) {
    sample.postActionFrames = sample.postActionFrameRows.map((row) =>
      Object.fromEntries(sample.postActionFrameColumns.map((column, index) => [column, row[index]]))
    );
    sample.postActionFrameGapsMs = sample.postActionFrames.map((frame) => frame.gapMs);
    sample.activities = (sample.activityAtFromActionMs ?? []).map((atFromActionMs) => ({
      atFromActionMs,
    }));
    sample.canvasMutations = (sample.canvasMutationAtFromActionMs ?? []).map(
      (atFromActionMs) => ({ atFromActionMs })
    );
  }
  return run;
}

export function rescore(run) {
  return summarizeActions(run.samples, [], run.gateAllowances ?? {}, (label) =>
    rotationFirstFrameNa(run.captureRuntime, label, run.engine ?? null)
  );
}

export const scoredSamples = (run, label) =>
  run.samples.filter((sample) => sample.label === label && !sample.warmup);

// The worst gap of each scored repeat over the frames the scorer gates, which is the population
// the 33.5 ms worst-frame rule reads; rawMaxima keeps every recorded post-action gap instead.
export const scoredMaxima = (run, label) =>
  scoredSamples(run, label).map((sample) => Math.max(...scoredActionFrameGaps(sample)));

export const rawMaxima = (run, label) =>
  scoredSamples(run, label).map((sample) => Math.max(...sample.postActionFrameGapsMs));
