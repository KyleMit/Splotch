// Every number is Splotch's. The package evaluates; the basis strings are what the report quotes.
import { defineGates, type FidelityExpectations } from 'perf-rig';

export const gates = defineGates({
  drawing: {
    paintP95Ms: 20,
    paintP99Ms: 33,
    paintMaxMs: 50,
    lostFrameTimeShare: 0.01,
    exceptions: {
      'ipad-device-web:crayon': {
        lostFrameTimeShare: 0.015,
        basis:
          'ADR-0137: thirteen measured implementations; worst single capture, ratchets down only',
      },
      'ipad-device-native:crayon': { lostFrameTimeShare: 0.015, basis: 'ADR-0137' },
    },
  },
  actions: {
    frameP95Ms: 20,
    frameMaxMs: 33.5,
    firstFrameMs: 33.5,
    maxBreachConfirmingSamples: 2,
    warmupRepeats: 1,
    minGatedSamples: 3,
    allowances: {
      'ipad-device-web': {
        'open Settings': { p95Ms: 27, basis: 'ADR-0160 perf-profiles/evidence/2026-09-0x' },
        'select coloring page': { p95Ms: 26, basis: 'ADR-0160' },
      },
      'android-device-web': {
        'disable Night Mode': { p95Ms: 33.4, basis: 'ADR-0162' },
      },
    },
    firstFrameNotApplicable: (runtime, label) =>
      /rotation/.test(label) && (runtime === 'ios-safari' || runtime === 'desktop-playwright')
        ? 'ADR-0142: rotation first frames anchor at resize on these runtimes'
        : null,
  },
  measuredAction: { engineP95Ms: 20, nextFrameP95Ms: 33, nextFrameMaxMs: 50 },
  commit: { budgetMs: 25, percentile: 0.95, confirmations: 2 },
});

// Calibrated against the tracked corpus in perf-profiles/evidence (ADR-0139/0141/0144/0145).
export const fidelity: FidelityExpectations = {
  'ios-safari': [
    { kind: 'trustedTouch', state: 'calibrated', bounds: { min: 1 } },
    {
      kind: 'cadence',
      state: 'calibrated',
      bounds: { min: 0.9 },
      basis: '2026-08-23 iPad hand corpus',
    },
    { kind: 'moveGap', state: 'calibrated', bounds: { max: 25 } },
    { kind: 'pressure', state: 'calibrated', bounds: { min: 0, max: 0 } },
    { kind: 'contactGeometry', state: 'calibrated', bounds: { min: 40, max: 100 } },
    { kind: 'coalescing', state: 'witness' },
  ],
  'ios-capacitor-webview': [
    { kind: 'trustedTouch', state: 'calibrated', bounds: { min: 1 } },
    { kind: 'cadence', state: 'calibrated', bounds: { min: 0.9 } },
    { kind: 'moveGap', state: 'calibrated', bounds: { max: 25 } },
    { kind: 'coalescing', state: 'witness' },
  ],
  'android-chrome': [
    { kind: 'trustedTouch', state: 'calibrated', bounds: { min: 1 } },
    {
      kind: 'cadence',
      state: 'calibrated',
      bounds: { min: 0.9 },
      basis: 'issue 1218 hand capture 135.5–178.0 mv/s',
    },
    { kind: 'moveGap', state: 'calibrated', bounds: { max: 25 } },
    { kind: 'pressure', state: 'not-applicable', basis: 'reports 1 for finger and robot alike' },
    { kind: 'contactGeometry', state: 'not-applicable' },
    { kind: 'coalescing', state: 'witness' },
  ],
  'android-capacitor-webview': [
    { kind: 'trustedTouch', state: 'calibrated', bounds: { min: 1 } },
    { kind: 'cadence', state: 'calibrated', bounds: { min: 0.9 } },
    { kind: 'moveGap', state: 'calibrated', bounds: { max: 25 } },
    {
      kind: 'contactGeometry',
      state: 'witness',
      basis: 'ADR-0144 amendment: separates driver from driver, not faithful from unfaithful',
    },
  ],
  'desktop-playwright': [
    {
      kind: 'trustedTouch',
      state: 'not-applicable',
      basis: 'synthetic by construction; desktop calibration is advisory',
    },
    { kind: 'cadence', state: 'uncalibrated' },
  ],
};
