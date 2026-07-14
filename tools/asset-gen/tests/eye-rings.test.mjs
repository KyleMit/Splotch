// Regression tests for the eye-ring-depth gate (scoreEyeRings, lib/eye-fill.mjs).
// A normalization redraw once grew extra concentric circles on caterpillar-tall
// — the "hypno swirl" — that registration can't catch (the rings hug the old
// pupil boundary) and solidity can't catch (everything is thin). Ring depth is
// its own gate: a normal eye chains 3-4 eye-scale levels, the swirl measured 5.
//
// Fixtures are synthetic concentric circles (tests/fixtures/synthetic.mjs): the
// gate keys on nesting DEPTH, so N drawn rings reproduce an N-deep chain exactly.
import { describe, it, expect } from 'vitest';
import { scoreEyeRings, findEyeCores, EYE_RING_DEPTH_MAX } from '../lib/eye-fill.mjs';
import { goodEyeSource, swirlEyeSource } from './fixtures/synthetic.mjs';

describe('eye-ring-depth gate', () => {
  it('flags an over-deep hypno-swirl eye', async () => {
    const src = await swirlEyeSource();
    // sanity: the finder must actually see eye cores here, or the gate is vacuous
    expect((await findEyeCores(src)).cores.length).toBeGreaterThan(0);
    const r = await scoreEyeRings(src);
    expect(r.passes).toBe(false);
    expect(r.maxDepth).toBeGreaterThan(EYE_RING_DEPTH_MAX);
    expect(r.overDeep.length).toBeGreaterThan(0);
  });

  it('passes a normal-depth eye', async () => {
    const src = await goodEyeSource();
    expect((await findEyeCores(src)).cores.length).toBeGreaterThan(0);
    const r = await scoreEyeRings(src);
    expect(r.passes).toBe(true);
    expect(r.maxDepth).toBeLessThanOrEqual(EYE_RING_DEPTH_MAX);
  });

  it('separates the two classes across the depth bar', async () => {
    const good = await scoreEyeRings(await goodEyeSource());
    const swirl = await scoreEyeRings(await swirlEyeSource());
    expect(good.maxDepth).toBeLessThanOrEqual(EYE_RING_DEPTH_MAX);
    expect(swirl.maxDepth).toBeGreaterThan(EYE_RING_DEPTH_MAX);
  });
});
