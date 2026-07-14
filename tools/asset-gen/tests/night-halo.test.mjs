// Regression tests for the night-halo scorer (scoreNightHalo, lib/night-halo.mjs).
// Unlike the other gates this is a RANKING for human crop review, not a pass/fail
// verdict (deliberate mid-dark art hugging lines scores like halo), so the test
// asserts the ranking it exists to produce: a fill with a residual mid-dark rim
// around the lines must score materially higher than the same fill punched clean.
//
// Fixtures are synthetic (tests/fixtures/synthetic.mjs): one raw + line art, and
// two shipped fills — one punched to the fill color right up to the lines, one
// with a mid-dark rim left hugging them.
import { describe, it, expect } from 'vitest';
import { scoreNightHalo } from '../lib/night-halo.mjs';
import {
  haloRaw,
  haloLineArt,
  haloShippedClean,
  haloShippedHaloed,
} from './fixtures/synthetic.mjs';

describe('scoreNightHalo — ranks a residual dark rim above a clean punch', () => {
  it('a clean punch scores at or near zero halo', async () => {
    const r = await scoreNightHalo(await haloRaw(), await haloLineArt(), await haloShippedClean());
    expect(r.haloScore).toBeLessThan(1);
  });

  it('a haloed fill scores well above the clean one', async () => {
    const raw = await haloRaw();
    const lineArt = await haloLineArt();
    const clean = await scoreNightHalo(raw, lineArt, await haloShippedClean());
    const haloed = await scoreNightHalo(raw, lineArt, await haloShippedHaloed());
    expect(haloed.haloScore).toBeGreaterThan(clean.haloScore + 5);
    expect(haloed.haloPx12).toBeGreaterThan(0);
    expect(haloed.hotspots.length).toBeGreaterThan(0);
  });
});
