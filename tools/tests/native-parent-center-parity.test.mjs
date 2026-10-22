import { describe, expect, it } from 'vitest';
import {
  PARENT_FEATURES,
  PARENT_MODES,
  endsParentCenterProtection,
  isParentModeAvailable,
} from '../../src/parentCenter/parentPolicy.ts';

import {
  PARENT_GATE_KEYPAD_METRICS,
  PARENT_GATE_METRICS,
} from '../../src/parentCenter/parentGateMetrics.ts';

describe('Parent Center policies against parentalGate.svelte.ts', () => {
  it('takes Never off external links on iOS alone, as isParentalGateModeAvailable does', () => {
    for (const platform of ['ios', 'android', 'web'])
      for (const feature of PARENT_FEATURES)
        for (const mode of PARENT_MODES)
          expect(isParentModeAvailable(feature, mode, platform), `${feature} ${mode}`).toBe(
            !(feature === 'externalLinks' && mode === 'never' && platform === 'ios')
          );
  });

  it('asks before Never on Parent Center and nothing else, unless it is already Never', () => {
    for (const current of PARENT_MODES) {
      const policies = Object.fromEntries(PARENT_FEATURES.map((feature) => [feature, current]));
      for (const feature of PARENT_FEATURES)
        for (const mode of PARENT_MODES)
          expect(endsParentCenterProtection(feature, mode, policies), `${current} ${feature}`).toBe(
            feature === 'parentCenter' && mode === 'never' && current !== 'never'
          );
    }
  });
});

describe('Grown-Ups Only and Parent Center measures against shipping', () => {
  const steps = Object.keys(PARENT_GATE_METRICS);

  it('narrows only the landscape keypad, beside the problem', () => {
    const narrowed = steps.filter((step) => PARENT_GATE_KEYPAD_METRICS[step].width !== null);
    expect(narrowed).toEqual(['phoneLandscape']);
    expect(PARENT_GATE_KEYPAD_METRICS.phoneLandscape.width).toBe(216);
  });
});
