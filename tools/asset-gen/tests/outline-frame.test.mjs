import { describe, expect, it } from 'vitest';
import { FRAME_SIDE_COVERAGE_MIN, scoreOutlineFrame } from '../lib/outline-frame.mjs';
import {
  edgeNearArtOutline,
  framedOutline,
  threeSidedFrameOutline,
} from './fixtures/synthetic.mjs';

describe('outline frame gate', () => {
  it('flags a continuous inset rectangle on all four sides', async () => {
    const result = await scoreOutlineFrame(await framedOutline());

    expect(result.passes).toBe(false);
    expect(result.frameDetected).toBe(true);
    expect(result.sideCoverage).toBeGreaterThan(FRAME_SIDE_COVERAGE_MIN);
  });

  it('passes ordinary art near every edge when it does not form a continuous frame', async () => {
    const result = await scoreOutlineFrame(await edgeNearArtOutline());

    expect(result.passes).toBe(true);
    expect(result.frameDetected).toBe(false);
    expect(result.sideCoverage).toBeLessThan(FRAME_SIDE_COVERAGE_MIN - 0.05);
  });

  it('requires all four continuous sides', async () => {
    const result = await scoreOutlineFrame(await threeSidedFrameOutline());

    expect(result.sides.top.coverage).toBeGreaterThan(FRAME_SIDE_COVERAGE_MIN);
    expect(result.sides.bottom.coverage).toBeGreaterThan(FRAME_SIDE_COVERAGE_MIN);
    expect(result.sides.left.coverage).toBeGreaterThan(FRAME_SIDE_COVERAGE_MIN);
    expect(result.sides.right.coverage).toBeLessThan(FRAME_SIDE_COVERAGE_MIN);
    expect(result.passes).toBe(true);
  });
});
