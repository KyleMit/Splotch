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
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  scoreEyeFill,
  judgeLightEyes,
  judgeNightEyes,
  findEyeCores,
  EYE_CONTRAST_MIN,
  BAND_BLIND_INK_FRAC,
} from '../lib/eye-fill.mjs';
import { COLORING_DIR, FILL_SRC_DIR } from '../lib/asset-paths.mjs';
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

  it('suppresses a band-blind side-profile eye without accepting a measurable dead eye', async () => {
    const page = 'farm/duck-wide';
    const source = await readFile(join(COLORING_DIR, `${page}.outline.webp`));
    const fill = await readFile(join(FILL_SRC_DIR, `${page}.light.raw.webp`));
    const duck = await scoreEyeFill(fill, source);
    const { flooded } = await scored();

    expect(duck.cores).toHaveLength(1);
    expect(duck.cores[0].lively).toBe(false);
    expect(duck.cores[0].annulusInkFrac).toBeGreaterThan(BAND_BLIND_INK_FRAC);
    expect(judgeLightEyes(duck, { page }).passes).toBe(true);
    expect(judgeLightEyes(flooded).passes).toBe(false);
  });

  it('uses blessed page cores to ignore windows and hubs', async () => {
    const cases = ['objects/house-tall', 'vehicles/garbage-wide'];
    for (const page of cases) {
      const source = await readFile(join(COLORING_DIR, `${page}.outline.webp`));
      const fill = await readFile(join(FILL_SRC_DIR, `${page}.light.raw.webp`));
      const scoredPage = await scoreEyeFill(fill, source);

      expect(scoredPage.cores.length).toBeGreaterThan(0);
      expect(judgeLightEyes(scoredPage).passes).toBe(false);
      expect(judgeLightEyes(scoredPage, { page }).passes).toBe(true);
    }
  });

  it('keeps positive evidence from a lively band-blind core', () => {
    const livelyBandBlind = {
      eyes: 1,
      cores: [
        {
          regionId: 1,
          x: 40,
          y: 40,
          coreLuma: 240,
          bandDark: 20,
          bandLight: 240,
          contrast: 220,
          lively: true,
          annulusInkFrac: 0.9,
        },
      ],
    };

    expect(judgeLightEyes(livelyBandBlind).passes).toBe(true);
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

// Hand-built scores, because the synthetic fixtures score the same source twice
// and so hand judgeNightEyes two identically ordered core arrays — under which
// any pairing rule, right or wrong, agrees. Cores 1 and 2 are a concentric
// catchlight inside a pupil: one eye, two nested regions, the SAME rounded
// center. Pairing by array position or by `x,y` mismatches them here.
const eyeCore = (regionId, over) => ({
  regionId,
  x: 40,
  y: 40,
  coreLuma: 240,
  bandDark: 20,
  bandLight: 240,
  contrast: 220,
  lively: true,
  annulusInkFrac: 0.1,
  ...over,
});

describe('judgeNightEyes — core identity', () => {
  // Core 1 is band-blind, so only its OWN pairing is exempt; core 2 gates. A
  // positional (or x,y-keyed) lookup hands core 2's verdict core 1's night
  // score, blaming the wrong eye with the wrong contrast.
  const light = [eyeCore(1, { annulusInkFrac: 0.9 }), eyeCore(2), eyeCore(3, { x: 90, y: 90 })];
  const night = [
    eyeCore(2, { lively: false, contrast: 20, coreLuma: 30, bandLight: 40 }),
    eyeCore(1, { lively: false, contrast: 5, coreLuma: 30, bandLight: 40, annulusInkFrac: 0.9 }),
  ];

  it('matches each light core to its own night core, whatever the order', () => {
    const v = judgeNightEyes(
      { eyes: night.length, cores: night },
      { eyes: light.length, cores: light }
    );
    expect(v.passes).toBe(false);
    expect(v.failed).toBe(1);
    expect(v.worst.regionId).toBe(2);
    expect(v.worst.contrast).toBe(20);
  });

  it('skips a light core the night fill never scored', () => {
    const onlyUnmatched = [eyeCore(3, { x: 90, y: 90 })];
    const v = judgeNightEyes({ eyes: 0, cores: [] }, { eyes: 1, cores: onlyUnmatched });
    expect(v.passes).toBe(true);
    expect(v.failed).toBe(0);
  });

  it('throws rather than silently dropping night cores that share a region id', () => {
    const dupes = [eyeCore(1), eyeCore(1)];
    expect(() => judgeNightEyes({ eyes: 2, cores: dupes }, { eyes: 1, cores: light })).toThrow(
      /region id/
    );
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
