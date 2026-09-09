// Every number is Splotch's, copied from the shipped ledgers with its basis. The package evaluates.
import { defineGates, type FidelityExpectations } from 'perf-rig';
import type { SplotchRuntime } from './targets.js';

export const gates = defineGates({
  drawing: {
    frameP95Ms: 20,
    frameP99Ms: 33,
    frameMaxMs: 50,
    lostFrameTimeShare: 0.01,
    exceptions: [
      {
        target: 'ipad-device-browser',
        tool: 'crayon',
        lostFrameTimeShare: 0.015,
        basis:
          'ADR-0137: thirteen measured implementations; worst single capture; ratchets down only',
      },
      {
        target: 'ipad-device-packaged',
        tool: 'crayon',
        lostFrameTimeShare: 0.015,
        basis: 'ADR-0137',
      },
    ],
  },
  actions: {
    frameP95Ms: 20,
    frameMaxMs: 33.5,
    firstFrameMs: 33.5,
    maxBreachConfirmingSamples: 2,
    warmupRepeats: 1,
    minGatedSamples: 3,
    allowances: [
      {
        target: 'ipad-device-browser',
        adrs: ['ADR-0090', 'ADR-0160'],
        entries: [
          {
            actionId: 'settings.open',
            p95Ms: 29,
            maxMs: 56,
            basis: 'perf-profiles/evidence/2026-09-02 and 2026-09-06 iPad Safari sweeps',
          },
          { actionId: 'settings.close', p95Ms: 22, basis: 'ADR-0160' },
          { actionId: 'coloring.select-page', p95Ms: 30, basis: 'ADR-0160' },
          { actionId: 'theme.switch', p95Ms: 23, basis: 'ADR-0160 (light to dark)' },
          { actionId: 'rotation.with-ink', p95Ms: 26, basis: 'ADR-0160 (portrait to landscape)' },
        ],
      },
      {
        target: 'android-device-browser',
        adrs: ['ADR-0162'],
        entries: [
          {
            actionId: 'theme.switch',
            p95Ms: 33.5,
            basis: 'ADR-0162: compact-shell Night Mode toggle, GPU-attributed',
          },
        ],
      },
    ],
    firstFrameNotApplicable: [
      {
        actionIdPattern: '^rotation\\.',
        runtimes: ['ios-safari'],
        reason: 'ADR-0142: rotation first frames anchor at resize on iPad Safari',
      },
      {
        actionIdPattern: '^rotation\\.',
        runtimes: ['desktop-playwright'],
        engines: ['webkit'],
        reason: 'desktop WebKit measured inert on rotation; Chromium and Firefox stay gated',
      },
    ],
  },
  repeatedAction: { engineP95Ms: 20, nextFrameP95Ms: 33, nextFrameMaxMs: 50 },
  commit: {
    budgetMs: 25,
    percentile: 0.95,
    confirmations: 2,
    normalise: { caseKey: 'crayon-scribbles', referenceTotalMs: 60_800, enabled: false },
  },
});

// Calibrated against the tracked corpus in perf-profiles/evidence (ADR-0139/0141/0144/0145).
// trustedTouch and cadence are universal; the per-runtime checks describe a runtime.
export const fidelity: FidelityExpectations<SplotchRuntime> = {
  universal: {
    cadence: {
      movesPerFrameMin: 0.9,
      moveGapP95MaxMs: 25,
      basis:
        'ADR-0145: between the Appium control at 0.82 and the healthy floor at 0.96; gap cap 1.5× the slowest beat',
    },
  },
  runtimes: {
    'ios-safari': {
      pressure: {
        state: 'calibrated',
        bounds: { min: 0, max: 0 },
        basis: '2026-08-23 iPad hand corpus',
        negativeControl: 'SafariDriver actions (pressure 0, contact 13,660 px)',
      },
      contactGeometry: {
        state: 'calibrated',
        bounds: { min: 40, max: 100 },
        basis: '2026-08-23 iPad hand corpus (~74 px radius)',
        negativeControl: 'SafariDriver actions',
      },
      coalescing: {
        state: 'not-applicable',
        basis: 'ADR-0144: tracks page delivery, not input; floors at 1',
      },
    },
    'ios-capacitor-webview': {
      pressure: { state: 'uncalibrated' },
      contactGeometry: { state: 'uncalibrated' },
      coalescing: { state: 'not-applicable', basis: 'ADR-0144' },
    },
    'android-chrome': {
      pressure: {
        state: 'not-applicable',
        basis: 'issue 1218: reports 1 for finger and robot alike',
      },
      contactGeometry: { state: 'not-applicable', basis: 'issue 1218: no radius reported' },
      coalescing: { state: 'not-applicable', basis: 'ADR-0144' },
    },
    'android-capacitor-webview': {
      pressure: { state: 'not-applicable', basis: 'issue 1274 two-arm evidence' },
      contactGeometry: {
        state: 'not-applicable',
        basis: 'ADR-0144 amendment: separates driver from driver, not faithful from unfaithful',
      },
      coalescing: { state: 'not-applicable', basis: 'ADR-0144' },
    },
    'desktop-playwright': {
      pressure: {
        state: 'not-applicable',
        basis: 'synthetic by construction; desktop is advisory',
      },
      contactGeometry: { state: 'not-applicable', basis: 'synthetic by construction' },
      coalescing: { state: 'not-applicable', basis: 'ADR-0144' },
    },
  },
};
