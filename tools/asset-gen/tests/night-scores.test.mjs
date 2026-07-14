// Regression tests for the three night-fill gates (lib/night-scores.mjs), each
// guarding a distinct way the dark-fill generator drifts:
//   • scoreNightness  — a bright daytime background instead of a night sky.
//   • scoreDrift      — an invented thin white outline far from any source line.
//   • scoreLineColor  — the white outlines came back re-inked DARK.
//
// Fixtures are synthetic (tests/fixtures/synthetic.mjs): one night line-art
// source and night fills that inject exactly one defect apiece, so each gate
// sees the failure it owns and passes the others' fixtures.
import { describe, it, expect } from 'vitest';
import {
  scoreNightness,
  scoreDrift,
  scoreLineColor,
  NIGHT_BG_LUMA_MAX_DEFAULT,
  DRIFT_THRESHOLD_DEFAULT,
  LINE_WHITE_MIN_DEFAULT,
} from '../lib/night-scores.mjs';
import {
  nightSource,
  nightFillGood,
  nightFillDaytime,
  nightFillDrift,
  nightFillReinked,
} from './fixtures/synthetic.mjs';

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
