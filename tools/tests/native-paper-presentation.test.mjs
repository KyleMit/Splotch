import { describe, expect, it } from 'vitest';
import {
  INITIAL_PAPER_PRESENTATION,
  presentPaper,
} from '../../experiments/native-architecture/src/drawing/paperPresentation.ts';
import {
  adoptPaper,
  UNADOPTED_PAPER,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';

// iPad Pro 11 landscape, measured on shipping: the Raised palette column is 84 pt wide, and Flat
// floats it over a canvas that runs under it.
const WINDOW = { width: 1210, height: 834 };
const RAISED = { slot: { width: 1126, height: 802 }, origin: { x: 84, y: 32 } };
const FLAT = { slot: { width: 1210, height: 802 }, origin: { x: 0, y: 32 } };
const paper = adoptPaper(1126, 802, 2);

function step(state, layout, overrides = {}) {
  return presentPaper(state, {
    paper,
    empty: false,
    window: WINDOW,
    toolbarStyle: 'buttons',
    ...layout,
    ...overrides,
  });
}

describe('native paper presentation (shipping paperView / updateDrawingLayout)', () => {
  it('fills the slot with a blank paper', () => {
    const state = step(INITIAL_PAPER_PRESENTATION, RAISED, { paper: UNADOPTED_PAPER });
    expect(state.frame).toEqual({ left: 0, top: 0, ...RAISED.slot });
  });

  it('keeps an inked paper at its screen position across a Button style switch', () => {
    const raised = step(INITIAL_PAPER_PRESENTATION, RAISED);
    expect(raised.frame).toEqual({ left: 0, top: 0, width: 1126, height: 802 });
    const flat = step(raised, FLAT, { toolbarStyle: 'bare' });
    expect(flat.frame).toEqual({ left: 84, top: 0, width: 1126, height: 802 });
    const back = step(flat, RAISED);
    expect(back.frame).toEqual({ left: 0, top: 0, width: 1126, height: 802 });
  });

  it('releases the held position on rotation and contain-fits the paper upright', () => {
    const flat = step(step(INITIAL_PAPER_PRESENTATION, RAISED), FLAT, { toolbarStyle: 'bare' });
    const portrait = step(
      flat,
      {
        slot: { width: 834, height: 1178 },
        origin: { x: 0, y: 32 },
        window: { width: 834, height: 1210 },
      },
      { toolbarStyle: 'bare' }
    );
    expect(portrait.retained).toBeNull();
    expect(portrait.frame?.width).toBeCloseTo(834);
    expect(portrait.frame?.height).toBeCloseTo((802 * 834) / 1126);
  });

  it('adopts the slot again once the ink is gone', () => {
    const flat = step(step(INITIAL_PAPER_PRESENTATION, RAISED), FLAT, { toolbarStyle: 'bare' });
    expect(step(flat, FLAT, { toolbarStyle: 'bare', empty: true }).frame).toEqual({
      left: 0,
      top: 0,
      ...FLAT.slot,
    });
  });
});
