// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LARGE_TABLET_MIN_SIDE_PX, TABLET_MIN_SIDE_PX } from '../breakpoints';

// The bespoke dialogs that scale for roomy viewports — and the pieces extracted
// out of one — must step at the same widths: a gate that grows where the style
// picker does not (or the reverse) is how one dialog quietly ends up
// phone-sized again. A CSS media query cannot
// import the breakpoints, so each component restates them as literals; this is
// the drift guard the cross-file agreement convention requires when the
// agreeing sites can't share code (the app.html.test.ts pattern). Which floors
// a dialog takes is its own call — the color picker's
// honeycomb has no room to grow until the large-tablet floor, because its trim
// ladders (design/trimGeometry.ts) are derived from the unscaled geometry and
// run out only just below it — but every floor it does take is one of these.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const DIALOGS = {
  ParentalGate: {
    source: read('./ParentalGate.svelte'),
    floors: [TABLET_MIN_SIDE_PX, LARGE_TABLET_MIN_SIDE_PX],
  },
  // Not a dialog of its own — the gate's manage footer, extracted because the
  // gate hit its line ceiling. It is held to the same floors so a card and the
  // line inside it cannot step at different widths. It takes only the first:
  // fine print stays fine print, and the gate's large-tablet step moves the card
  // and its spacing rather than this line.
  ParentalGateManageFooter: {
    source: read('./ParentalGateManageFooter.svelte'),
    floors: [TABLET_MIN_SIDE_PX],
  },
  AiImagePrompt: {
    source: read('./AiImagePrompt.svelte'),
    floors: [TABLET_MIN_SIDE_PX, LARGE_TABLET_MIN_SIDE_PX],
  },
  ColorPicker: {
    source: read('./ColorPicker.svelte'),
    floors: [LARGE_TABLET_MIN_SIDE_PX],
  },
};

// A step's whole prelude, matched on the presence of *either* axis, so a
// single-axis query reaches the both-axes assertion below instead of being
// skipped by the pattern that exists to catch it.
const ROOMY_STEP = /@media[^{]*min-(?:width|height)[^{]*/g;
const AXIS = /min-(width|height): (\d+)px/g;

function roomySteps(label: string, source: string): number[] {
  return [...source.matchAll(ROOMY_STEP)].map((step) => {
    const axis = new Map([...step[0].matchAll(AXIS)].map(([, side, px]) => [side, px]));
    const width = axis.get('width');
    expect(axis.get('height'), `${label} gates its ${width}px step on both axes`).toBe(width);
    return Number(width);
  });
}

describe('the roomy-viewport dialogs step at the shared device-class floors', () => {
  it.each(Object.entries(DIALOGS))(
    'scales %s at its shared floors, in order',
    (label, { source, floors }) => {
      expect(roomySteps(label, source)).toEqual(floors);
    }
  );

  // The gate's compact landscape block is the tablet step's complement: it ends
  // one pixel below where the tablet step begins. Left unpinned, moving
  // TABLET_MIN_SIDE_PX opens a band of viewport heights that neither block
  // covers, and a landscape phone in it falls back to the portrait card.
  it('ends the gate’s compact landscape block where the tablet step begins', () => {
    expect(DIALOGS.ParentalGate.source).toContain(`max-height: ${TABLET_MIN_SIDE_PX - 1}px`);
  });
});
