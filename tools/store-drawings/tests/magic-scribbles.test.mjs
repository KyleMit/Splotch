import { describe, expect, it } from 'vitest';
import { magicScribbleScene } from '../lib/magic-scribbles.mjs';

// Row/control jitter can push a mid-stroke sample slightly past the block it
// fills, which is fine on paper; this margin bounds how far that drift is
// allowed to reach in design-space px.
const JITTER_MARGIN = 60;

describe('magic scribble scenes', () => {
  it.each(['portrait', 'landscape'])('generates deterministic %s strokes', (orientation) => {
    const first = magicScribbleScene(orientation);
    const second = magicScribbleScene(orientation);

    expect(first.strokes.length).toBeGreaterThan(8);
    expect(first).toEqual(second);
  });

  it.each(['portrait', 'landscape'])('keeps %s points near the design space', (orientation) => {
    const { designWidth, designHeight, strokes } = magicScribbleScene(orientation);

    for (const stroke of strokes) {
      expect(stroke.length).toBeGreaterThan(1);
      for (const { x, y } of stroke) {
        expect(x).toBeGreaterThanOrEqual(-JITTER_MARGIN);
        expect(x).toBeLessThanOrEqual(designWidth + JITTER_MARGIN);
        expect(y).toBeGreaterThanOrEqual(-JITTER_MARGIN);
        expect(y).toBeLessThanOrEqual(designHeight + JITTER_MARGIN);
      }
    }
  });

  // A pointer-down that lands on one of the tool drawer's floating buttons
  // (the canvas's left column) would click it instead of drawing, so every
  // stroke must begin well inside the art, never at the block's left edge.
  it.each(['portrait', 'landscape'])('starts every %s stroke off the left edge', (orientation) => {
    const { designWidth, strokes } = magicScribbleScene(orientation);

    for (const stroke of strokes) {
      expect(stroke[0].x).toBeGreaterThan(designWidth * 0.08);
    }
  });

  it('rejects an unknown orientation', () => {
    expect(() => magicScribbleScene('diagonal')).toThrow(/orientation/);
  });
});
