import { describe, expect, it } from 'vitest';
import { FRAME_SIDE_COVERAGE_MIN, scoreOutlineFrame } from '../lib/outline-frame.mjs';
import {
  edgeNearArtOutline,
  framedOutline,
  goodEyeSource,
  partiallyOccludedFrameOutline,
  swirlEyeSource,
  threeSidedFrameOutline,
} from './fixtures/synthetic.mjs';

const EYE_FIXTURE_FRAME_COVERAGE_MAX = 0.6;

describe('outline frame gate', () => {
  it('flags a continuous inset rectangle on all four sides', async () => {
    const result = await scoreOutlineFrame(await framedOutline());

    expect(result.passes).toBe(false);
    expect(result.sideCoverage).toBeGreaterThan(FRAME_SIDE_COVERAGE_MIN);
  });

  it('flags a four-sided frame when part of one side is occluded', async () => {
    const result = await scoreOutlineFrame(await partiallyOccludedFrameOutline());

    expect(result.sides.right).toBeCloseTo(0.733, 3);
    expect(result.sideCoverage).toBeGreaterThan(FRAME_SIDE_COVERAGE_MIN);
    expect(result.passes).toBe(false);
  });

  it('passes ordinary art near every edge when it does not form a continuous frame', async () => {
    const result = await scoreOutlineFrame(await edgeNearArtOutline());

    expect(result.passes).toBe(true);
    expect(result.sideCoverage).toBeLessThan(FRAME_SIDE_COVERAGE_MIN - 0.05);
  });

  it('requires all four continuous sides', async () => {
    const result = await scoreOutlineFrame(await threeSidedFrameOutline());

    expect(result.sides.top).toBeGreaterThan(FRAME_SIDE_COVERAGE_MIN);
    expect(result.sides.bottom).toBeGreaterThan(FRAME_SIDE_COVERAGE_MIN);
    expect(result.sides.left).toBeGreaterThan(FRAME_SIDE_COVERAGE_MIN);
    expect(result.sides.right).toBeLessThan(FRAME_SIDE_COVERAGE_MIN);
    expect(result.passes).toBe(true);
  });

  it.each([
    ['normal-depth', goodEyeSource],
    ['over-deep', swirlEyeSource],
  ])('keeps the %s eye fixture well outside frame territory', async (_name, buildFixture) => {
    const result = await scoreOutlineFrame(await buildFixture());

    expect(result.sideCoverage).toBeLessThan(EYE_FIXTURE_FRAME_COVERAGE_MAX);
    expect(result.passes).toBe(true);
  });
});
