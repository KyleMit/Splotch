// Every number is Splotch's, transcribed from the shipped ledgers with its basis; a Splotch drift
// test pins this file against the tracked corpus from phase 0. The package evaluates.
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
        target: 'ipad-device-web',
        tool: 'crayon',
        lostFrameTimeShare: 0.015,
        basis:
          'ADR-0137: thirteen measured implementations; worst single capture; ratchets down only',
      },
      {
        target: 'ipad-device-native',
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
    minGatedSamples: 3,
    allowances: [
      {
        target: 'ipad-device-web',
        references: ['ADR-0090', 'ADR-0160'],
        entries: [
          {
            actionId: 'settings.open',
            p95Ms: 29,
            maxMs: 56,
            basis: 'perf-profiles/evidence/2026-09-02 and 2026-09-06 iPad Safari sweeps',
          },
          { actionId: 'settings.close', p95Ms: 22, basis: 'ADR-0160' },
          { actionId: 'coloring.select-page', p95Ms: 30, basis: 'ADR-0160' },
          {
            actionId: 'theme.to-dark',
            p95Ms: 23,
            basis: 'ADR-0160: light to dark only; the reverse reads 17–18 ms on the base gate',
          },
          {
            actionId: 'rotation.with-ink.portrait-to-landscape',
            p95Ms: 26,
            basis: 'ADR-0160: one direction only',
          },
        ],
      },
      {
        target: 'android-device-web',
        references: ['ADR-0162'],
        entries: [
          {
            actionId: 'theme.compact.disable',
            p95Ms: 33.5,
            basis: 'ADR-0162: compact-shell Night Mode toggle, GPU-attributed',
          },
        ],
      },
    ],
    // Orientation changes only: the clicks taken after a rotation (`rotation.undo-clear`,
    // `rotation.clear-restored`) stay gated, as the shipped matcher keeps them (action-stats.mjs).
    firstFrameNotApplicable: [
      {
        actionIdPattern: '^rotation\\.(empty|with-ink)\\.',
        runtimes: ['ios-safari'],
        reason: 'ADR-0142: rotation first frames anchor at resize on iPad Safari',
      },
      {
        actionIdPattern: '^rotation\\.(empty|with-ink)\\.',
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

// Transcribed from RUNTIME_EXPECTATIONS in tools/perf/lib/input-fidelity.mjs. trustedTouch and
// cadence are universal; both iOS runtimes share the hand-calibrated pressure and contact checks.
const IOS_PRESSURE = {
  state: 'calibrated',
  bounds: { min: 0, max: 0 },
  basis: '2026-08-23 iPad hand corpus: Safari reports pressure 0 for a finger',
  negativeControl: 'SafariDriver actions (pressure 0, contact 13,660 px)',
} as const;
const IOS_CONTACT = {
  state: 'calibrated',
  bounds: { min: 40, max: 100 },
  basis: '2026-08-23 iPad hand corpus (~74 px radius)',
  negativeControl: 'SafariDriver actions',
} as const;
const COALESCING_WITNESS = {
  state: 'not-applicable',
  basis: 'ADR-0144: tracks page delivery, not input; floors at 1',
} as const;

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
      pressure: IOS_PRESSURE,
      contactGeometry: IOS_CONTACT,
      coalescing: COALESCING_WITNESS,
    },
    'ios-capacitor-webview': {
      pressure: IOS_PRESSURE,
      contactGeometry: IOS_CONTACT,
      coalescing: COALESCING_WITNESS,
    },
    'android-chrome': {
      pressure: {
        state: 'not-applicable',
        basis: 'issue 1218: reports 1 for finger and robot alike',
      },
      contactGeometry: { state: 'not-applicable', basis: 'issue 1218: no radius reported' },
      coalescing: COALESCING_WITNESS,
    },
    'android-capacitor-webview': {
      pressure: { state: 'not-applicable', basis: 'issue 1274 two-arm evidence' },
      contactGeometry: {
        state: 'not-applicable',
        basis: 'ADR-0144 amendment: separates driver from driver, not faithful from unfaithful',
      },
      coalescing: COALESCING_WITNESS,
    },
    'desktop-playwright': {
      pressure: { state: 'uncalibrated' },
      contactGeometry: { state: 'uncalibrated' },
      coalescing: COALESCING_WITNESS,
    },
  },
};
