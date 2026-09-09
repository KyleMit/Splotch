// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PHONE_MAX_WIDTH_PX } from './breakpoints';

// Page chrome and underline pickers take the phone-width step together.
// CSS cannot import the breakpoint, so this guards their repeated values.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const PHONE_STEP_SITES = {
  'page/PageShell.svelte': read('./components/page/PageShell.svelte'),
  'page/BrandMark.svelte': read('./components/page/BrandMark.svelte'),
  'beta/BetaStep.svelte': read('./components/beta/BetaStep.svelte'),
  'beta/BetaStepLedger.svelte': read('./components/beta/BetaStepLedger.svelte'),
  'design/SegmentedPicker.svelte': read('./components/design/SegmentedPicker.svelte'),
};

const MAX_WIDTH_STEP = /@media \(max-width: (\d+)px\)/g;

// A file may take other steps — PageShell's 920px tablet step is one — but a
// SECOND step near this one is the drift this guard exists to catch: 520 or 560
// written from memory looks right in a diff and splits the pages apart on the
// exact devices they were tuned for. Steps outside the band are a different
// decision and are left alone.
const PHONE_BAND_PX = 100;

describe('the standalone-page phone step', () => {
  it.each(Object.entries(PHONE_STEP_SITES))('%s takes it at the shared width', (label, source) => {
    const steps = [...source.matchAll(MAX_WIDTH_STEP)].map((match) => Number(match[1]));

    expect(steps, `${label} takes the phone step`).toContain(PHONE_MAX_WIDTH_PX);
    expect(
      steps.filter(
        (step) =>
          step !== PHONE_MAX_WIDTH_PX && Math.abs(step - PHONE_MAX_WIDTH_PX) <= PHONE_BAND_PX
      ),
      `${label} declares a second step inside the phone band`
    ).toEqual([]);
  });
});
