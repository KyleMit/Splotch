import { describe, expect, it } from 'vitest';
import {
  assertProductionConfig,
  costOf,
  imageDims,
  takePerCategory,
  selectModelVariants,
  evaluationMetadata,
  evaluationVariants,
  VARIANTS,
} from '../lib/model-eval.mjs';
import { sizeForAspect } from '../lib/image-providers.mjs';

describe('production config', () => {
  it('matches the production orchestrator and prompts', () => {
    expect(() => assertProductionConfig()).not.toThrow();
  });
});

describe('imageDims', () => {
  it('returns PNG and SOFn JPEG dimensions in width-by-height order', () => {
    const png = Buffer.alloc(24);
    png[0] = 0x89;
    png[1] = 0x50;
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);

    const jpeg = Buffer.alloc(24);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    jpeg[2] = 0xff;
    jpeg[3] = 0xc0;
    jpeg.writeUInt16BE(17, 4);
    jpeg[6] = 8;
    jpeg.writeUInt16BE(480, 7);
    jpeg.writeUInt16BE(640, 9);

    expect(imageDims(png)).toBe('640x480');
    expect(imageDims(jpeg)).toBe('640x480');
  });
});

describe('VARIANTS', () => {
  it('limits an exact model name to its own effort tiers', () => {
    expect(selectModelVariants('gpt-image-2').map((variant) => variant.key)).toEqual([
      'gpt-image-2-low',
      'gpt-image-2-medium',
      'gpt-image-2-high',
    ]);
  });

  it('accepts a trailing separator without widening an exact selection', () => {
    expect(selectModelVariants('gpt-image-2-low,').map((variant) => variant.key)).toEqual([
      'gpt-image-2-low',
    ]);
  });

  it.each([' ', ',', ' , '])('rejects an empty selection %j', (filter) => {
    expect(() => selectModelVariants(filter)).toThrow('at least one variant');
  });

  it('selects exact comma-separated keys without buying other effort tiers', () => {
    expect(
      selectModelVariants('gpt-image-2-low,gpt-image-2-5-flare-low').map((variant) => variant.key)
    ).toEqual(['gpt-image-2-low', 'gpt-image-2-5-flare-low']);
  });

  it('rejects an unknown key instead of silently running an incomplete comparison', () => {
    expect(() => selectModelVariants('gpt-image-2-low,unknown')).toThrow('Unknown variant keys');
  });

  it('preserves a single substring filter', () => {
    expect(selectModelVariants('gpt-image-2-5-flare').map((variant) => variant.quality)).toEqual([
      'low',
      'medium',
    ]);
  });

  it('gives every variant a unique, filesystem-safe key', () => {
    const keys = VARIANTS.map((variant) => variant.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z0-9-]+$/);
  });

  it('asks every OpenAI variant for an explicit effort tier', () => {
    for (const variant of VARIANTS.filter((v) => v.provider === 'openai')) {
      expect(['low', 'medium', 'high'], variant.key).toContain(variant.quality);
    }
  });
});

describe('evaluation metadata', () => {
  it('keeps every recorded candidate when a resume selects only one', () => {
    const previous = structuredClone(
      selectModelVariants('gpt-image-2-low,gpt-image-2-5-flare-low')
    );
    expect(evaluationVariants(selectModelVariants('gpt-image-2-low'), previous)).toEqual(previous);
  });

  it('adds a new candidate once while preserving the stored candidate order', () => {
    const previous = selectModelVariants('gpt-image-2-low');
    const selected = selectModelVariants('gpt-image-2-low,gpt-image-2-5-flare-low');
    expect(evaluationVariants(selected, previous)).toEqual(selected);
  });

  it('rejects a changed definition behind a retained variant key', () => {
    const selected = selectModelVariants('gpt-image-2-low');
    const previous = structuredClone(selected);
    previous[0].model = 'different-model';
    expect(() => evaluationVariants(selected, previous)).toThrow('variant gpt-image-2-low differs');
  });

  it('preserves the saved snapshot when a resume has matching configuration', () => {
    const previous = structuredClone(evaluationMetadata(3));
    expect(evaluationMetadata(3, previous)).toEqual(previous);
    expect(evaluationMetadata(3, previous).requestConfig).toBe(previous.requestConfig);
  });

  it.each(['requestConfig', 'rates', 'concurrency'])(
    'rejects missing %s instead of assigning current provenance to old rows',
    (field) => {
      const previous = structuredClone(evaluationMetadata(3));
      delete previous[field];
      expect(() => evaluationMetadata(3, previous)).toThrow(`Cannot resume: ${field}`);
    }
  );

  it('rejects a different prompt even when the orchestrator still matches', () => {
    const previous = structuredClone(evaluationMetadata(3));
    previous.requestConfig.prompt = 'An older prompt';
    expect(() => evaluationMetadata(3, previous)).toThrow('Cannot resume: requestConfig');
  });

  it('rejects old billing rates rather than relabeling retained costs', () => {
    const previous = structuredClone(evaluationMetadata(3));
    previous.rates.orchestrator = { inPerM: 5, cachedInPerM: 0.5, outPerM: 30 };
    expect(() => evaluationMetadata(3, previous)).toThrow('Cannot resume: rates');
  });

  it('rejects a changed concurrency limit rather than relabeling retained timings', () => {
    expect(() => evaluationMetadata(1, evaluationMetadata(3))).toThrow(
      'Cannot resume: concurrency'
    );
  });
});

describe('sizeForAspect', () => {
  it('maps a canvas shape onto the matching OpenAI size', () => {
    expect(sizeForAspect(1024, 1024)).toBe('1024x1024');
    expect(sizeForAspect(1296, 864)).toBe('1536x1024');
    expect(sizeForAspect(864, 1296)).toBe('1024x1536');
  });

  it('keeps a near-square canvas square rather than stretching it', () => {
    expect(sizeForAspect(1024, 960)).toBe('1024x1024');
    expect(sizeForAspect(960, 1024)).toBe('1024x1024');
  });

  it('falls back to square when the input dimensions are unknown', () => {
    expect(sizeForAspect(0, 0)).toBe('1024x1024');
    expect(sizeForAspect(undefined, undefined)).toBe('1024x1024');
  });
});

describe('costOf', () => {
  const gemini = VARIANTS.find((v) => v.model === 'gemini-2.5-flash-image');
  const openai = VARIANTS.find((v) => v.key === 'gpt-image-2-medium');

  it.each(['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'])(
    'prices %s from image usage and the production orchestrator',
    (model) => {
      expect(
        costOf(
          { model },
          {
            textInTokens: 19,
            imageInTokens: 1024,
            imageOutTokens: 1756,
            textOutTokens: 500,
            orchInTokens: 1200,
            orchOutTokens: 150,
          }
        )
      ).toBeCloseTo(0.068767, 6);
    }
  );

  // The expected figures below are written out as literal dollars, computed by
  // hand from the vendors' published rates. Deriving them from RATES instead
  // would make these tests restate the implementation: a wrong rate would flow
  // into both sides and pass, which is the one failure that matters here —
  // a wrong rate produces a confident, wrong model recommendation.
  it('prices a Gemini response off its prompt and image-output tokens', () => {
    // 1000 prompt tokens @ $0.30/M = $0.0003; 1290 image-out @ $30/M = $0.0387.
    const cost = costOf(gemini, {
      textInTokens: 0,
      imageInTokens: 1000,
      textOutTokens: 0,
      imageOutTokens: 1290,
    });
    expect(cost).toBeCloseTo(0.039, 6);
  });

  it('adds the orchestrator tokens to an OpenAI response', () => {
    // Image leg: 19 text-in @ $5/M + 1024 image-in @ $8/M + 1756 image-out @ $30/M
    //          = $0.000095 + $0.008192 + $0.05268 = $0.060967.
    const image = {
      textInTokens: 19,
      imageInTokens: 1024,
      textOutTokens: 0,
      imageOutTokens: 1756,
    };
    expect(costOf(openai, image)).toBeCloseTo(0.060967, 6);

    // Orchestrator leg: 1200 in @ $4/M + 150 out @ $20/M = $0.0048 + $0.003 = $0.0078.
    const withOrchestrator = costOf(openai, {
      ...image,
      orchInTokens: 1200,
      orchOutTokens: 150,
    });
    expect(withOrchestrator).toBeCloseTo(0.068767, 6);
  });

  it('bills cached orchestrator input at the cached rate, not twice', () => {
    const base = {
      textInTokens: 0,
      imageInTokens: 0,
      textOutTokens: 0,
      imageOutTokens: 0,
      orchOutTokens: 0,
    };
    // 1000 uncached @ $4/M = $0.004; the same 1000 all cached @ $0.40/M = $0.0004.
    expect(costOf(openai, { ...base, orchInTokens: 1000, orchCachedTokens: 0 })).toBeCloseTo(
      0.004,
      8
    );
    expect(costOf(openai, { ...base, orchInTokens: 1000, orchCachedTokens: 1000 })).toBeCloseTo(
      0.0004,
      8
    );
  });

  it('returns null rather than a wrong number when usage is missing', () => {
    expect(costOf(openai, null)).toBeNull();
    expect(costOf({ model: 'not-a-model' }, { imageOutTokens: 100 })).toBeNull();
  });
});

describe('takePerCategory', () => {
  const files = [
    'art-detail__a__wide.png',
    'art-detail__b__wide.png',
    'art-detail__c__wide.png',
    'night__a__tall.png',
    'safety__only__tall.png',
  ];

  it('caps each category independently and keeps the given order', () => {
    expect(takePerCategory(files, 2)).toEqual([
      'art-detail__a__wide.png',
      'art-detail__b__wide.png',
      'night__a__tall.png',
      'safety__only__tall.png',
    ]);
  });

  it('keeps a category that has fewer inputs than the cap', () => {
    expect(takePerCategory(files, 5)).toEqual(files);
  });
});
