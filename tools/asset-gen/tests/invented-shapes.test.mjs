// Regression tests for the invented-shape detector (detectInventedShapes,
// lib/invented-shapes.mjs). scoreDrift only counts white/low-chroma pixels, so a
// COLORED blob the model added on the open background (an extra star/planet/
// flower with no white outline) slips every other night gate. This detector
// flags a big enough, FLOATING blob — anchoring, not saturation, is the
// discriminator (a legit leaked fill butts against a source line or the border).
//
// Fixtures are synthetic (tests/fixtures/synthetic.mjs): a night fill with a red
// flower planted on the open sky, clear of every line and the border.
import { describe, it, expect } from 'vitest';
import { detectInventedShapes, MIN_BLOB, ANCHOR_MAX } from '../lib/invented-shapes.mjs';
import { nightSource, nightFillGood, nightFillForeignShape } from './fixtures/synthetic.mjs';

describe('detectInventedShapes', () => {
  it('flags a floating colored blob on the open background', async () => {
    const r = await detectInventedShapes(await nightFillForeignShape(), await nightSource());
    expect(r.skipped).toBe(false);
    expect(r.flagged.length).toBeGreaterThan(0);
    // the flagged blob is genuinely floating and past the size floor
    const b = r.flagged[0];
    expect(b.area).toBeGreaterThanOrEqual(MIN_BLOB);
    expect(b.anchorFrac).toBeLessThan(ANCHOR_MAX);
  });

  it('passes a clean fill with no invented shapes', async () => {
    const r = await detectInventedShapes(await nightFillGood(), await nightSource());
    expect(r.skipped).toBe(false);
    expect(r.flagged.length).toBe(0);
  });
});
