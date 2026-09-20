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

// The controls each target was campaigned under, declared here from the README's per-target table
// rather than read back off a capture, so a run that disagrees with the campaign fails instead of
// a uniformly misconfigured campaign agreeing with itself. `undefined` means the field is absent on
// that target (a desktop run has no orientation; only the pinned Android web target has a cadence).
export const DECLARED_CONTROLS = {
  macos: {
    os: 'darwin', orientation: undefined, theme: 'light',
    captureRuntime: 'desktop-playwright', uiActivation: undefined, refreshRatePin: undefined,
  },
  'ipad-safari': {
    os: '26.5', orientation: 'LANDSCAPE', theme: 'light',
    captureRuntime: 'ios-safari',
    uiActivation: 'driver+native-touch+webdriver-element-click', refreshRatePin: undefined,
  },
  'ipad-native': {
    os: '26.5', orientation: 'LANDSCAPE', theme: 'light',
    captureRuntime: 'ios-capacitor-webview',
    uiActivation: 'native-touch+webdriver-element-click+native-accessibility-click+driver',
    refreshRatePin: undefined,
  },
  'android-chrome': {
    os: '16', orientation: 'PORTRAIT', theme: 'light',
    captureRuntime: undefined, uiActivation: 'trusted-cdp-touch',
    refreshRatePin: { requestedHz: 60, observedHz: 60 },
  },
  'android-native': {
    os: '16', orientation: 'PORTRAIT', theme: 'light',
    captureRuntime: 'android-capacitor-webview',
    uiActivation: 'native-touch+webdriver-element-click+native-accessibility-click+driver',
    refreshRatePin: undefined,
  },
};

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const matchesDeclaredControls = (run, target) => {
  const declared = DECLARED_CONTROLS[target];
  return Boolean(declared) &&
    sameValue(run.device?.os, declared.os) &&
    sameValue(run.orientation, declared.orientation) &&
    sameValue(run.theme, declared.theme) &&
    sameValue(run.captureRuntime, declared.captureRuntime) &&
    sameValue(run.uiActivation, declared.uiActivation) &&
    sameValue(run.refreshRatePin, declared.refreshRatePin);
};

// Membership would accept a capture whose page also loaded the other arm's entry, which is exactly
// the mixed-arm evidence the README says never happened. Every observed entry has to be the one.
export const loadedOnlyArmEntry = (run, expectedEntry) =>
  Array.isArray(run.pageEntries) && run.pageEntries.length > 0 &&
  run.pageEntries.every((entry) => entry === expectedEntry);
