import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { IMAGE_SIZES, imageSizeFor } from '../../../web/src/lib/server/ai/imageSize.ts';
import {
  apiKeysFor,
  assertProductionConfig,
  costOf,
  countFromEnv,
  imageDims,
  takePerCategory,
  selectModelVariants,
  evaluationMetadata,
  evaluationVariants,
  VARIANTS,
} from '../lib/model-eval.mjs';
import { callVariant } from '../lib/image-providers.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
// An entry start under a loaded host can pass Vitest's 5 s default. spawnSync blocks the event
// loop, so Vitest's own timeout cannot fire during it: the child carries the limit, set below the
// test's so a hung entry fails the test instead of the CI job.
const ENTRY_TIMEOUT_MS = 15_000;
const ENTRY_TEST_TIMEOUT_MS = 20_000;

const openAiRequests = vi.hoisted(() => []);
vi.mock('openai', () => ({
  default: class {
    responses = {
      create: async (request) => {
        openAiRequests.push(request);
        return { output: [] };
      },
    };
  },
}));

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

describe('the image size the OpenAI adapter sends', () => {
  const variant = VARIANTS.find((v) => v.provider === 'openai');

  async function sentSize(width, height) {
    openAiRequests.length = 0;
    await callVariant(variant, {
      apiKeys: { openai: 'unused-by-the-mocked-client' },
      image: { base64: '', mimeType: 'image/png', width, height },
      prompt: '',
      systemInstruction: '',
      timeoutMs: 1,
    });
    expect(openAiRequests).toHaveLength(1);
    return openAiRequests[0].tools[0].size;
  }

  // 1024×880 sits just outside production's square band, so it is the canvas a
  // tolerance copied into the harness and left behind would send as square.
  it.each([
    [1024, 1024],
    [1024, 880],
    [880, 1024],
    [864, 1296],
    [1296, 864],
  ])("matches production's size for a %i×%i drawing", async (width, height) => {
    expect(await sentSize(width, height)).toBe(imageSizeFor({ width, height }));
  });

  it.each([
    [0, 0],
    [undefined, undefined],
  ])('renders square when the dimensions were not read (%s×%s)', async (width, height) => {
    expect(await sentSize(width, height)).toBe(IMAGE_SIZES.square);
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

describe('countFromEnv', () => {
  // Number() reads each of these as NaN, as a count below the floor, or as a number other than
  // the digits written: the uncapped grid, the empty run, and the thousand-sample run.
  it.each([
    ['PER_CATEGORY', '2x', 0],
    ['CONCURRENCY', '0', 1],
    ['CONCURRENCY', 'abc', 1],
    ['CONCURRENCY', '2.0', 1],
    ['SAMPLES', '0', 1],
    ['SAMPLES', 'abc', 1],
    ['SAMPLES', '1e3', 1],
    ['SAMPLES', '0x10', 1],
  ])('rejects %s=%s, naming the variable', (name, raw, min) => {
    expect(() => countFromEnv(name, { fallback: min, min }, { [name]: raw })).toThrow(
      new Error(`${name} must be an integer >= ${min}, got "${raw}"`)
    );
  });

  it('reads PER_CATEGORY=0 as the no-cap count rather than rejecting it', () => {
    expect(countFromEnv('PER_CATEGORY', { fallback: 0, min: 0 }, { PER_CATEGORY: '0' })).toBe(0);
  });

  it.each([{}, { CONCURRENCY: '' }])(
    'keeps the fallback for an unset or empty value: %j',
    (env) => {
      expect(countFromEnv('CONCURRENCY', { fallback: 4, min: 1 }, env)).toBe(4);
    }
  );

  it('reads a plain integer', () => {
    expect(countFromEnv('CONCURRENCY', { fallback: 4, min: 1 }, { CONCURRENCY: '6' })).toBe(6);
  });
});

// Spawned with no provider key, so an entry that let a malformed count through would stop at
// its key check, with a different line, instead of reaching a paid call.
describe('an entry given a malformed count', () => {
  it.each([
    ['run-model-evaluation.mjs', 'SAMPLES', '1e3', 1],
    ['run-model-evaluation.mjs', 'CONCURRENCY', '0', 1],
    ['run-model-evaluation.mjs', 'PER_CATEGORY', '2x', 0],
    ['run-prompt-adherence.mjs', 'SAMPLES', 'abc', 1],
    ['run-prompt-adherence.mjs', 'CONCURRENCY', '0x10', 1],
  ])(
    '%s exits on %s=%s before anything else runs',
    (script, name, raw, min) => {
      const result = spawnSync(
        process.execPath,
        [
          '--experimental-strip-types',
          '--disable-warning=ExperimentalWarning',
          join(import.meta.dirname, '..', script),
        ],
        { cwd: repoRoot, encoding: 'utf8', env: { [name]: raw }, timeout: ENTRY_TIMEOUT_MS }
      );

      expect(result.stderr).toBe(`${name} must be an integer >= ${min}, got "${raw}"\n`);
      expect(result.stdout).toBe('');
      expect(result.status).toBe(1);
    },
    ENTRY_TEST_TIMEOUT_MS
  );
});

describe('apiKeysFor', () => {
  const [gemini, openai] = ['gemini-2-5-flash-image', 'gpt-image-2-low'].map((key) =>
    VARIANTS.find((variant) => variant.key === key)
  );
  const bothKeys = { GEMINI_API_KEY: 'gemini-key', OPENAI_API_KEY: 'openai-key' };

  it('returns a key for each provider the variants call, and only those', () => {
    expect(apiKeysFor([openai, openai], bothKeys)).toEqual({ openai: 'openai-key' });
    expect(apiKeysFor([gemini, openai], bothKeys)).toEqual({
      gemini: 'gemini-key',
      openai: 'openai-key',
    });
  });

  it.each(['', undefined])(
    'names a key set to %j and both documented ways to supply it',
    (value) => {
      expect(() => apiKeysFor([gemini, openai], { ...bothKeys, OPENAI_API_KEY: value })).toThrow(
        new Error(
          'Missing OPENAI_API_KEY — export it, or invoke this entry point with node --env-file=web/.env from the repo root'
        )
      );
    }
  );

  // The hint sends an operator to web/.env, so every key the harness asks for must be one the
  // file's template declares.
  it('finds every provider key among the variables web/.env.example declares', () => {
    const example = readFileSync(join(repoRoot, 'web', '.env.example'), 'utf8');
    const declared = Object.fromEntries(
      [...example.matchAll(/^(\w+)=/gm)].map(([, name]) => [name, 'declared'])
    );

    expect(apiKeysFor(VARIANTS, declared)).toEqual({ gemini: 'declared', openai: 'declared' });
  });
});
