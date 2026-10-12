// Regression tests for the three night-fill gates (lib/night-scores.mjs), each
// guarding a distinct way the dark-fill generator drifts:
//   • scoreNightness  — a bright daytime background instead of a night sky.
//   • scoreDrift      — an invented thin white outline far from any source line.
//   • scoreLineColor  — the white outlines came back re-inked DARK.
//
// Fixtures are synthetic (tests/fixtures/synthetic.mjs): one night line-art
// source and night fills that inject exactly one defect apiece, so each gate
// sees the failure it owns and passes the others' fixtures.
import sharp from 'sharp';
import { describe, it, expect, vi } from 'vitest';
import {
  prepareNightFillAnalysis,
  scoreNightFillGates,
  scoreNightness,
  scoreDrift,
  scoreLineColor,
  NIGHT_BG_LUMA_MAX_DEFAULT,
  DRIFT_THRESHOLD_DEFAULT,
  LINE_WHITE_MIN_DEFAULT,
} from '../lib/night-scores.mjs';
import { punchNightCandidate, scoreNightHalo } from '../lib/night-halo.mjs';
import {
  nightSource,
  nightFillGood,
  nightFillDaytime,
  nightFillDrift,
  nightFillDriftSubBlob,
  nightFillReinked,
} from './fixtures/synthetic.mjs';

vi.mock('sharp', async (importOriginal) => {
  const { default: actualSharp } = await importOriginal();
  return { default: vi.fn((...args) => actualSharp(...args)) };
});

describe('scoreNightness — the background must read as night', () => {
  it('flags a bright daytime background', async () => {
    const r = await scoreNightness(await nightFillDaytime(), await nightSource());
    expect(r.bgLuma).toBeGreaterThan(NIGHT_BG_LUMA_MAX_DEFAULT);
  });
  it('passes a deep evening background', async () => {
    const r = await scoreNightness(await nightFillGood(), await nightSource());
    expect(r.bgFrac).toBeGreaterThan(0.04); // enough open bg to judge
    expect(r.bgLuma).toBeLessThan(NIGHT_BG_LUMA_MAX_DEFAULT);
  });
});

describe('scoreDrift — no invented outlines off the source lines', () => {
  it('flags a thin white stroke far from any source line', async () => {
    const r = await scoreDrift(await nightFillDrift(), await nightSource());
    expect(r.ratio).toBeGreaterThan(DRIFT_THRESHOLD_DEFAULT);
    expect(r.added).toBeGreaterThan(0);
  });
  it('passes a fill whose white sits only on the source lines', async () => {
    const r = await scoreDrift(await nightFillGood(), await nightSource());
    expect(r.ratio).toBeLessThanOrEqual(DRIFT_THRESHOLD_DEFAULT);
  });
});

describe('scoreLineColor — the outlines must stay white', () => {
  it('flags re-inked dark outlines', async () => {
    const r = await scoreLineColor(await nightFillReinked(), await nightSource());
    expect(r.lineWhite).toBeLessThan(LINE_WHITE_MIN_DEFAULT);
  });
  it('passes proper white outlines', async () => {
    const r = await scoreLineColor(await nightFillGood(), await nightSource());
    expect(r.lineWhite).toBeGreaterThanOrEqual(LINE_WHITE_MIN_DEFAULT);
  });
});

// Every scorer indexes the FILL's raster with the SOURCE's width/height, so each
// must resize the fill to the source's exact dimensions rather than to its own
// aspect ratio. Resized independently, the two rasters end up different heights
// and the loops read the wrong pixels — misregistered rows, or past the end of
// the fill entirely — which silently pushes a clean fill over a gate (invented
// outlines, dark lines, a daytime median) instead of raising anything.
// coloring/check-golden-scores.mjs is the exposed caller: it scores a committed night raw
// against the line art with no alignment step of its own.
//
// Skewing then scoring is a round trip through the scorers' own resize, so a
// skewed fill must land where the matched one did, within resampling slack —
// asserted against the matched score rather than the loose pass thresholds,
// which a misindexed read can satisfy by accident.
const ASPECT_SKEW_FACTOR = 2; // 2:1 against the square source dwarfs the gates' 1px registration slack
const SKEW_BG_LUMA_SLACK = 1;
const SKEW_DRIFT_RATIO_SLACK = 0.001; // a quarter of DRIFT_THRESHOLD_DEFAULT
const SKEW_LINE_WHITE_SLACK = 5;

async function skewFill(fillBuf, factor) {
  const { width, height } = await sharp(fillBuf).metadata();
  return sharp(fillBuf)
    .resize(width, Math.round(height * factor), { fit: 'fill' })
    .png()
    .toBuffer();
}

async function scoreAll(fillBuf, sourceBuf) {
  return {
    bgLuma: (await scoreNightness(fillBuf, sourceBuf)).bgLuma,
    ratio: (await scoreDrift(fillBuf, sourceBuf)).ratio,
    lineWhite: (await scoreLineColor(fillBuf, sourceBuf)).lineWhite,
  };
}

describe('a fill whose aspect ratio differs from the source is scored against the source', () => {
  for (const factor of [ASPECT_SKEW_FACTOR, 1 / ASPECT_SKEW_FACTOR]) {
    it(`scores a fill ${factor}x the source's height like the matched fill`, async () => {
      const source = await nightSource();
      const matched = await nightFillGood();
      const matchedScores = await scoreAll(matched, source);
      const skewedScores = await scoreAll(await skewFill(matched, factor), source);

      // Soft so a regression reports every scorer that broke, not just the first.
      expect
        .soft(Math.abs(skewedScores.bgLuma - matchedScores.bgLuma))
        .toBeLessThanOrEqual(SKEW_BG_LUMA_SLACK);
      expect
        .soft(Math.abs(skewedScores.ratio - matchedScores.ratio))
        .toBeLessThanOrEqual(SKEW_DRIFT_RATIO_SLACK);
      expect
        .soft(Math.abs(skewedScores.lineWhite - matchedScores.lineWhite))
        .toBeLessThanOrEqual(SKEW_LINE_WHITE_SLACK);
    });

    it(`still flags each defect through a ${factor}x skew`, async () => {
      const source = await nightSource();
      const day = await skewFill(await nightFillDaytime(), factor);
      const drifted = await skewFill(await nightFillDriftSubBlob(), factor);
      const reinked = await skewFill(await nightFillReinked(), factor);

      expect
        .soft((await scoreNightness(day, source)).bgLuma)
        .toBeGreaterThan(NIGHT_BG_LUMA_MAX_DEFAULT);
      expect
        .soft((await scoreDrift(drifted, source)).ratio)
        .toBeGreaterThan(DRIFT_THRESHOLD_DEFAULT);
      expect
        .soft((await scoreLineColor(reinked, source)).lineWhite)
        .toBeLessThan(LINE_WHITE_MIN_DEFAULT);
    });
  }
});

it('composes the night gates and halo from one shared source and fill decode', async () => {
  const source = await nightSource();
  const fill = await nightFillGood();

  vi.mocked(sharp).mockClear();
  const analysis = await prepareNightFillAnalysis(fill, source);
  const [{ drift, night, line }, punched] = await Promise.all([
    scoreNightFillGates(analysis),
    punchNightCandidate(analysis),
  ]);
  const halo = await scoreNightHalo(analysis, punched);

  expect(sharp.mock.calls.filter(([input]) => input === source)).toHaveLength(1);
  expect(sharp.mock.calls.filter(([input]) => input === fill)).toHaveLength(1);
  expect(drift.ratio).toBeLessThanOrEqual(DRIFT_THRESHOLD_DEFAULT);
  expect(night.bgLuma).toBeLessThan(NIGHT_BG_LUMA_MAX_DEFAULT);
  expect(line.lineWhite).toBeGreaterThanOrEqual(LINE_WHITE_MIN_DEFAULT);
  expect(halo.haloScore).toBe(0);
});

it('each night gate separates its two classes with margin', async () => {
  const src = await nightSource();
  const nightDay = await scoreNightness(await nightFillDaytime(), src);
  const nightGood = await scoreNightness(await nightFillGood(), src);
  expect(nightDay.bgLuma - nightGood.bgLuma).toBeGreaterThan(NIGHT_BG_LUMA_MAX_DEFAULT);

  const driftBad = await scoreDrift(await nightFillDrift(), src);
  expect(driftBad.ratio).toBeGreaterThan(DRIFT_THRESHOLD_DEFAULT * 10);

  const lineBad = await scoreLineColor(await nightFillReinked(), src);
  const lineGood = await scoreLineColor(await nightFillGood(), src);
  expect(lineGood.lineWhite - lineBad.lineWhite).toBeGreaterThan(60);
});
