import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { scoreEyeRings, scoreEyes } from '../lib/eye-fill.mjs';
import { prepareOutlineAnalysis } from '../lib/outline-analysis.mjs';
import { scoreOutlineFrame } from '../lib/outline-frame.mjs';
import { scoreSolidity } from '../lib/solid-regions.mjs';
import { goodEyeSource } from './fixtures/synthetic.mjs';

const OUTLINE_ANALYSIS_TEST_TIMEOUT_MS = 10_000;

vi.mock('sharp', async (importOriginal) => {
  const { default: actualSharp } = await importOriginal();
  return { default: vi.fn((...args) => actualSharp(...args)) };
});

async function scoreOutline(source) {
  const [solidity, eyes, frame] = await Promise.all([
    scoreSolidity(source),
    scoreEyes(source),
    scoreOutlineFrame(source),
  ]);
  return { solidity, eyes, frame };
}

describe('prepared outline analysis', () => {
  it(
    'preserves every scorer result while accepting raw buffers',
    async () => {
      const source = await goodEyeSource();
      const rawResults = await scoreOutline(source);
      const prepared = await prepareOutlineAnalysis(Buffer.from(source));

      expect(await scoreOutline(prepared)).toEqual(rawResults);
      expect(await scoreEyeRings(Buffer.from(source))).toEqual(rawResults.eyes.rings);
    },
    OUTLINE_ANALYSIS_TEST_TIMEOUT_MS
  );

  it('decodes once before all composed scorers reuse the analysis', async () => {
    const source = await goodEyeSource();
    vi.mocked(sharp).mockClear();

    const prepared = await prepareOutlineAnalysis(source);
    await scoreOutline(prepared);

    expect(sharp.mock.calls.filter(([input]) => input === source)).toHaveLength(1);
    expect(prepared.luma).toHaveLength(prepared.w * prepared.h);
  });
});
