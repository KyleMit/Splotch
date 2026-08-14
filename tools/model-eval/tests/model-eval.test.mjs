import { describe, expect, it } from 'vitest';
import { costOf, imageDims, takePerCategory, VARIANTS } from '../lib/model-eval.mjs';
import { sizeForAspect } from '../lib/image-providers.mjs';

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

  it('prices a Gemini response off its prompt and image-output tokens', () => {
    // 1000 in @ $0.30/M + 1290 image out @ $30/M
    const cost = costOf(gemini, {
      textInTokens: 0,
      imageInTokens: 1000,
      textOutTokens: 0,
      imageOutTokens: 1290,
    });
    expect(cost).toBeCloseTo((1000 * 0.3 + 1290 * 30) / 1e6, 10);
  });

  it('adds the orchestrator tokens to an OpenAI response', () => {
    const imageOnly = costOf(openai, {
      textInTokens: 19,
      imageInTokens: 1024,
      textOutTokens: 0,
      imageOutTokens: 1756,
    });
    const withOrchestrator = costOf(openai, {
      textInTokens: 19,
      imageInTokens: 1024,
      textOutTokens: 0,
      imageOutTokens: 1756,
      orchInTokens: 1200,
      orchOutTokens: 150,
    });
    expect(withOrchestrator).toBeGreaterThan(imageOnly);
    expect(withOrchestrator - imageOnly).toBeCloseTo((1200 * 1.25 + 150 * 10) / 1e6, 10);
  });

  it('bills cached orchestrator input at the cached rate, not twice', () => {
    const base = {
      textInTokens: 0,
      imageInTokens: 0,
      textOutTokens: 0,
      imageOutTokens: 0,
      orchOutTokens: 0,
    };
    const uncached = costOf(openai, { ...base, orchInTokens: 1000, orchCachedTokens: 0 });
    const cached = costOf(openai, { ...base, orchInTokens: 1000, orchCachedTokens: 1000 });
    expect(uncached).toBeCloseTo((1000 * 1.25) / 1e6, 10);
    expect(cached).toBeCloseTo((1000 * 0.125) / 1e6, 10);
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
