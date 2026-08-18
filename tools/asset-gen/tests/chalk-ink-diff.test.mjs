import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLORING_DIR } from '../lib/asset-paths.mjs';
import {
  CHALK_INK_DIFF_MAX_DEFAULT,
  prepareChalkInkDiff,
  scoreChalkInkDiff,
} from '../lib/chalk-ink-diff.mjs';
import { prepareOutlineAnalysis } from '../lib/outline-analysis.mjs';
import {
  chalkDiffClean,
  chalkDiffDeliberateWhite,
  chalkDiffInvented,
  chalkDiffPen,
  chalkDiffRetainedSolid,
} from './fixtures/synthetic.mjs';

const REAL_FIXTURE_TIMEOUT_MS = 10_000;

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

  it('passes faithful ink and preserves a reviewed deliberate white as the regional baseline', async () => {
    const analysis = await prepareChalkInkDiff(await chalkDiffPen());
    const clean = await scoreChalkInkDiff(await chalkDiffClean(), analysis);
    const deliberateWhite = await scoreChalkInkDiff(await chalkDiffDeliberateWhite(), analysis);
    const reviewed = await scoreChalkInkDiff(await chalkDiffDeliberateWhite(), analysis, {
      baseline: deliberateWhite,
    });

    expect(clean.passes).toBe(true);
    expect(deliberateWhite.absolutePasses).toBe(false);
    expect(reviewed.passes).toBe(true);
  });

  it(
    'flags a shipped ringed-pupil regression while the repaired invented-face page is a negative control',
    async () => {
      async function scorePage(page) {
        const pen = await readFile(join(COLORING_DIR, `${page}.outline.webp`));
        const chalk = await readFile(join(COLORING_DIR, `${page}.chalk.webp`));
        return scoreChalkInkDiff(chalk, await prepareChalkInkDiff(pen));
      }

      const broken = await scorePage('nature/caterpillar-wide');
      const repaired = await scorePage('space/ship-tall');

      expect(broken.absolutePasses).toBe(false);
      expect(broken.addedInkPx).toBeGreaterThan(CHALK_INK_DIFF_MAX_DEFAULT);
      expect(repaired.absolutePasses).toBe(true);
      expect(repaired.addedInkPx).toBe(0);
    },
    REAL_FIXTURE_TIMEOUT_MS
  );
});
