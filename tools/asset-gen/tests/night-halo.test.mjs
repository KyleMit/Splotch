// Regression tests for the night-halo scorer (scoreNightHalo, lib/night-halo.mjs).
// The normalized score gates new night candidates; rawScore independently flags
// a crop for human review because deliberate mid-dark art can raise it.
//
// Fixtures are synthetic (tests/fixtures/synthetic.mjs): one raw + line art, and
// two shipped fills — one punched to the fill color right up to the lines, one
// with a mid-dark rim left hugging them.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { NIGHT_HALO_SCORE_MAX, punchNightCandidate, scoreNightHalo } from '../lib/night-halo.mjs';
import { prepareNightFillAnalysis } from '../lib/night-scores.mjs';
import { COLORING_DIR, FILL_SRC_DIR, resolveNightLineArt } from '../lib/asset-paths.mjs';
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

  it('the production punch keeps the synthetic negative control under the gate', async () => {
    const analysis = await prepareNightFillAnalysis(await haloRaw(), await haloLineArt());
    const result = await scoreNightHalo(analysis, await punchNightCandidate(analysis));
    expect(result.haloScore).toBeLessThanOrEqual(NIGHT_HALO_SCORE_MAX);
    expect(result.rawScore).toBe(0);
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

async function scoreCatalogPage(page) {
  const raw = await readFile(join(FILL_SRC_DIR, `${page}.night.raw.webp`));
  const penPath = join(COLORING_DIR, `${page}.outline.webp`);
  const { source } = await resolveNightLineArt(penPath);
  const shipped = await readFile(join(COLORING_DIR, `${page}.night.webp`));
  return scoreNightHalo(raw, source, shipped);
}

describe('night halo catalog calibration', () => {
  it('keeps the repaired excavator and ship near the clean floor', async () => {
    const [excavator, ship] = await Promise.all([
      scoreCatalogPage('vehicles/excavator-tall'),
      scoreCatalogPage('space/ship-tall'),
    ]);
    expect(excavator.haloScore).toBeLessThanOrEqual(0.2);
    expect(ship.haloScore).toBeLessThanOrEqual(0.2);
  });

  it('preserves the deliberate station shading in the audit band', async () => {
    const station = await scoreCatalogPage('space/station-tall');
    expect(station.haloScore).toBeGreaterThan(NIGHT_HALO_SCORE_MAX);
    expect(station.haloScore).toBeLessThan(2.2);
  });
});
