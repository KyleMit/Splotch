import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSET_GEN_DIR, COLORING_DIR } from '../lib/asset-paths.mjs';
import {
  CHALK_INK_BASELINE_NOISE_PX,
  CHALK_INK_DIFF_MAX_DEFAULT,
  prepareChalkInkDiff,
  scoreChalkInkDiff,
} from '../lib/chalk-ink-diff.mjs';
import { prepareOutlineAnalysis } from '../lib/outline-analysis.mjs';
import { rasterizeLineArt } from '../lib/line-art.mjs';
import {
  chalkDiffClean,
  chalkDiffDeliberateWhite,
  chalkDiffInvented,
  chalkDiffPen,
  chalkDiffRetainedSolid,
} from './fixtures/synthetic.mjs';

const REAL_FIXTURE_TIMEOUT_MS = 10_000;
const NEW_PAGE_CATALOG_QUANTILE = 0.9;

function lowerQuantile(values, quantile) {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * quantile)];
}

describe('chalk ink diff', () => {
  it('accepts and reuses the shared prepared pen analysis', async () => {
    const pen = await prepareOutlineAnalysis(await chalkDiffPen());
    const analysis = await prepareChalkInkDiff(pen);

    expect(await prepareChalkInkDiff(analysis)).toBe(analysis);
    expect((await scoreChalkInkDiff(await chalkDiffClean(), analysis)).passes).toBe(true);
  });

  it('rejects both invented bounded ink and retained solid-pen ink', async () => {
    const analysis = await prepareChalkInkDiff(await chalkDiffPen());
    const invented = await scoreChalkInkDiff(await chalkDiffInvented(), analysis);
    const retained = await scoreChalkInkDiff(await chalkDiffRetainedSolid(), analysis);

    expect(invented.passes).toBe(false);
    expect(invented.flaggedRegions.some((region) => region.kind === 'bounded')).toBe(true);
    expect(invented.addedInkPx).toBeGreaterThan(CHALK_INK_DIFF_MAX_DEFAULT);
    expect(retained.passes).toBe(false);
    expect(retained.flaggedRegions.some((region) => region.kind === 'solid')).toBe(true);
    expect(retained.solidInkPx).toBeGreaterThan(CHALK_INK_DIFF_MAX_DEFAULT);
  });

  it('preserves a reviewed deliberate white by default but lets an explicit ceiling tighten it', async () => {
    const analysis = await prepareChalkInkDiff(await chalkDiffPen());
    const clean = await scoreChalkInkDiff(await chalkDiffClean(), analysis);
    const deliberateWhite = await scoreChalkInkDiff(await chalkDiffDeliberateWhite(), analysis);
    const inventedAfterClean = await scoreChalkInkDiff(await chalkDiffInvented(), analysis, {
      baseline: clean,
    });
    const reviewed = await scoreChalkInkDiff(await chalkDiffDeliberateWhite(), analysis, {
      baseline: deliberateWhite,
    });
    const tightened = await scoreChalkInkDiff(await chalkDiffDeliberateWhite(), analysis, {
      baseline: deliberateWhite,
      maxInkPx: 0,
    });

    expect(clean.passes).toBe(true);
    expect(deliberateWhite.absolutePasses).toBe(false);
    expect(inventedAfterClean.passes).toBe(false);
    expect(inventedAfterClean.flaggedRegions[0].allowedPx).toBe(CHALK_INK_BASELINE_NOISE_PX);
    expect(reviewed.passes).toBe(true);
    expect(tightened.passes).toBe(false);
    expect(tightened.flaggedRegions.every((region) => region.allowedPx === 0)).toBe(true);
  });

  it('keeps the new-page default at the approved catalog lower p90', async () => {
    const golden = JSON.parse(
      await readFile(join(ASSET_GEN_DIR, 'golden', 'golden-scores.json'), 'utf8')
    );
    const approvedWorstRegions = Object.values(golden.pages)
      .filter((page) => page.chalk)
      .map((page) => Math.max(page.chalk.addedInkPx, page.chalk.solidInkPx));

    expect(approvedWorstRegions.length).toBeGreaterThan(0);
    expect(CHALK_INK_DIFF_MAX_DEFAULT).toBe(
      lowerQuantile(approvedWorstRegions, NEW_PAGE_CATALOG_QUANTILE)
    );
  });

  it(
    'flags a shipped ringed-pupil regression while the repaired invented-face page is a negative control',
    async () => {
      async function scorePage(page) {
        const pen = await rasterizeLineArt(join(COLORING_DIR, `${page}.overlay.svg`));
        const chalk = await rasterizeLineArt(join(COLORING_DIR, `${page}.dark.overlay.svg`));
        return scoreChalkInkDiff(chalk, await prepareChalkInkDiff(pen));
      }

      const broken = await scorePage('nature/caterpillar-wide');
      const repaired = await scorePage('space/ship-tall');
      const pen = await prepareChalkInkDiff(
        await rasterizeLineArt(join(COLORING_DIR, 'nature/caterpillar-wide.overlay.svg'))
      );
      const shipped = await rasterizeLineArt(
        join(COLORING_DIR, 'nature/caterpillar-wide.dark.overlay.svg')
      );
      const regenerated = await scoreChalkInkDiff(shipped, pen, { baseline: broken });
      const tightened = await scoreChalkInkDiff(shipped, pen, {
        baseline: broken,
        maxInkPx: 0,
      });

      expect(broken.addedInkPx).toBe(37);
      expect(regenerated.passes).toBe(true);
      expect(tightened.passes).toBe(false);
      expect(tightened.absolutePasses).toBe(false);
      expect(repaired.absolutePasses).toBe(true);
      expect(repaired.addedInkPx).toBe(0);
    },
    REAL_FIXTURE_TIMEOUT_MS
  );
});
