import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyCredential } from '../../experiments/native-architecture/src/ai/credentialKind.ts';
import { maskSecret } from '../../experiments/native-architecture/src/ai/credentials.ts';
import { FREE_LIMIT } from '../../experiments/native-architecture/src/ai/contract.ts';
import { valuePropClaims } from '../../experiments/native-architecture/src/settings/aiSettingsCopy.ts';

import { FREE_GENERATION_LIMIT } from '../../web/src/lib/freeGenerations.ts';

// Settings › AI Art read back from shipping: copy, defaults, geometry and illustrations. The owner,
// schema and switch behaviour are native-ai-settings.test.mjs.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const NATIVE = {
  manager: read('experiments/native-architecture/src/rsdDrawing/RsdAiKeyManager.tsx'),
  valueProp: read('experiments/native-architecture/src/rsdDrawing/RsdAiValueProp.tsx'),
  howTo: read('experiments/native-architecture/src/rsdDrawing/RsdOpenAiKeyHowTo.tsx'),
  geometry: read('experiments/native-architecture/src/rsdDrawing/modalGeometry.ts'),
  strictCss: read('experiments/native-architecture/src/strict.css'),
  hostedPages: read('experiments/native-architecture/src/settings/hostedPages.ts'),
};
// A module-scope literal of a native port, as the StyleX compile needs it written.
function literal(source, name) {
  const match = new RegExp(`const ${name} = ([^;]+);`).exec(source);
  if (!match) throw new Error(`No ${name}`);
  return Function(`return (${match[1].replace(/ as const$/, '')});`)();
}

describe('Settings › AI Art against shipping', () => {
  it.each([
    [0, 'Your 10 free pictures are used up.'],
    [1, 'You have 1 free picture left — nothing to set up, no card.'],
    [3, 'You have 3 free pictures left — nothing to set up, no card.'],
    [FREE_LIMIT, 'The first 10 pictures are free — nothing to set up, no card.'],
  ])('explains an allowance of %s free pictures without a saved credential', (remaining, claim) => {
    expect(valuePropClaims('none', remaining)).toEqual([
      claim,
      'After that, use your own OpenAI key — saved on this device only.',
    ]);
  });
  it('stores the feature switches with the shipping fallbacks', () => {
    expect(FREE_LIMIT).toBe(FREE_GENERATION_LIMIT);
  });

  it('carries the shipping geometry', () => {
    const manager = (name) => literal(NATIVE.manager, name);
    manager('INPUT_PADDING_PX');
    const valueProp = (name) => literal(NATIVE.valueProp, name);
    expect(valueProp('IMAGE_ASPECT')).toBe(278 / 213);
    const howTo = (name) => literal(NATIVE.howTo, name);
    howTo('SUMMARY_PADDING_PX');
    howTo('LIST_PADDING_PX');
    howTo('CODE_PADDING_PX');
    howTo('NOTE_PADDING_PX');
  });

  it('bundles the shipping step illustrations byte for byte', () => {
    for (const step of [1, 2, 3])
      for (const theme of ['light', 'dark']) {
        const name = `step-${step}.${theme}.webp`;
        const bundled = readFileSync(
          new URL(
            `../../experiments/native-architecture/assets/ai-value-prop/${name}`,
            import.meta.url
          )
        );
        const original = readFileSync(
          new URL(`../../web/static/ai-value-prop/${name}`, import.meta.url)
        );
        expect(bundled.equals(original), name).toBe(true);
      }
  });

  it('masks all but the last four characters, as shipping does', () => {
    expect(maskSecret('')).toBe('');
    expect(maskSecret('abc')).toBe('***');
    expect(maskSecret('sk-proj-abcd1234')).toBe(`${'*'.repeat(12)}1234`);
  });

  it('tells a key from an access code by the shipping prefixes', () => {
    expect(classifyCredential('sk-proj-1')).toBe('byok');
    expect(classifyCredential('sk-1')).toBe('byok');
    expect(classifyCredential('family-code')).toBe('managed');
    expect(classifyCredential('AIzaFixture')).toBe('retiredGeminiKey');
    expect(classifyCredential('AQ.Fixture')).toBe('retiredGeminiKey');
  });
});
