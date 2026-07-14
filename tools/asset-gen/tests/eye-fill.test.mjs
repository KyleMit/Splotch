// Regression tests for the eye-fill gate (scoreEyeFill / judgeLightEyes /
// judgeNightEyes, lib/eye-fill.mjs): did the colored fill actually PAINT the
// eyes, or leave the outlined rings floating on one flat color? The nature/
// bee-wide night fill shipped navy-on-navy-on-navy; every other gate was blind
// to it (outlines register, background is properly dark). judgeNightEyes adds
// the dead-sclera catch: a bright catchlight on a dead navy sclera (the ladybug)
// must still fail, because every strong light-fill structure has to survive.
//
// Fixtures are synthetic (tests/fixtures/synthetic.mjs): a concentric-ring eye
// source plus a lively dark-pupil fill and a flat navy flood. Each test first
// asserts the finder detects a core, so a change that silently stops finding
// eyes can't make these pass vacuously.
import { describe, it, expect } from 'vitest';
import {
  scoreEyeFill,
  judgeLightEyes,
  judgeNightEyes,
  findEyeCores,
  EYE_CONTRAST_MIN,
} from '../lib/eye-fill.mjs';
import { goodEyeSource, eyeLivelyFill, eyeFloodFill } from './fixtures/synthetic.mjs';

async function scored() {
  const src = await goodEyeSource();
  expect((await findEyeCores(src)).cores.length).toBeGreaterThan(0);
  return {
    lively: await scoreEyeFill(await eyeLivelyFill(), src),
    flooded: await scoreEyeFill(await eyeFloodFill(), src),
  };
}

describe('scoreEyeFill + judgeLightEyes', () => {
  it('a painted eye reads lively and passes', async () => {
    const { lively } = await scored();
    expect(lively.eyes).toBeGreaterThan(0);
    expect(lively.cores.some((c) => c.lively)).toBe(true);
    expect(judgeLightEyes(lively).passes).toBe(true);
  });

  it('a flat-flooded eye reads dead and fails', async () => {
    const { flooded } = await scored();
    expect(flooded.cores.some((c) => c.lively)).toBe(false);
    expect(judgeLightEyes(flooded).passes).toBe(false);
  });
});

describe('judgeNightEyes — every strong light structure must survive at night', () => {
  it('passes when the night fill keeps the eyes lively', async () => {
    const { lively } = await scored();
    // the light fill is its own reference: a good night fill matches it
    expect(judgeNightEyes(lively, lively, { chalked: false }).passes).toBe(true);
  });

  it('fails a dead-sclera night fill against a lively light reference', async () => {
    const { lively, flooded } = await scored();
    const v = judgeNightEyes(flooded, lively, { chalked: false });
    expect(v.passes).toBe(false);
    expect(v.failed).toBeGreaterThan(0);
    expect(v.worst).not.toBeNull();
  });
});

it('the lively/flooded classes straddle the contrast bar with margin', async () => {
  const { lively, flooded } = await scored();
  const bestLively = Math.max(...lively.cores.map((c) => c.contrast));
  const bestFlooded = Math.max(...flooded.cores.map((c) => c.contrast));
  expect(bestLively).toBeGreaterThan(EYE_CONTRAST_MIN);
  expect(bestFlooded).toBeLessThan(EYE_CONTRAST_MIN);
  expect(bestLively - bestFlooded).toBeGreaterThan(EYE_CONTRAST_MIN);
});
