// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TABLET_MIN_SIDE_PX } from '../breakpoints';

// The parental gate and the AI style picker are the two bespoke dialogs that
// scale for tablets, and they must step at the same widths — a gate that grows
// on a device where the picker does not (or the reverse) is how one dialog
// quietly ends up phone-sized again. A CSS media query cannot import
// TABLET_MIN_SIDE_PX, so each component restates it as a literal; this is the
// drift guard the cross-file agreement convention requires when the agreeing
// sites can't share code (the pinnedPalette.test.ts pattern).

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const DIALOGS = {
  ParentalGate: read('./ParentalGate.svelte'),
  AiImagePrompt: read('./AiImagePrompt.svelte'),
};

// Every roomy-viewport step gates on both axes, so a wide-but-short landscape
// phone keeps the compact treatment instead of taking a tablet card.
const ROOMY_STEP = /@media \(min-width: (\d+)px\) and \(min-height: (\d+)px\)/g;

function roomySteps(label: string, source: string): number[] {
  const steps = [...source.matchAll(ROOMY_STEP)].map(([, width, height]) => {
    expect(height, `${label} gates its ${width}px step on both axes`).toBe(width);
    return Number(width);
  });
  expect(steps, `${label} declares a tablet step and a large-tablet step`).toHaveLength(2);
  return steps;
}

describe('the tablet-scaled dialogs step at one shared pair of thresholds', () => {
  const steps = Object.entries(DIALOGS).map(
    ([label, source]) => [label, roomySteps(label, source)] as const
  );

  it('opens the first step at the shared tablet-class floor', () => {
    for (const [label, [tablet]] of steps) {
      expect(tablet, `${label} steps up at TABLET_MIN_SIDE_PX`).toBe(TABLET_MIN_SIDE_PX);
    }
  });

  it('opens the large-tablet step at one width across both dialogs', () => {
    const [[, [, first]], ...rest] = steps;
    expect(first).toBeGreaterThan(TABLET_MIN_SIDE_PX);
    for (const [label, [, large]] of rest) {
      expect(large, `${label} matches the large-tablet step`).toBe(first);
    }
  });
});
