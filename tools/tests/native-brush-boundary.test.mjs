import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCandidateFixtures } from '../migration/tests/candidate-fixtures.mjs';
import { assertDeclaredCandidateImports } from '../migration/lib/native-identity.mjs';

const { candidate, manifest, fixture, expectRejectedMutationAndRestore, cleanup } =
  createCandidateFixtures();
afterEach(cleanup);

const brushModules = [
  'src/drawing/CrayonGlaze.tsx',
  'src/drawing/CrayonGlaze.web.tsx',
  'src/drawing/Ink.tsx',
  'src/drawing/brushes.ts',
  'src/drawing/crayon.ts',
];
const shippingPaletteSpecifier = '../../../../web/src/lib/palette.ts';

describe('new native brush source ownership', () => {
  it('keeps every production brush module in the accepted candidate scanner', () => {
    const result = assertDeclaredCandidateImports(candidate, manifest);
    expect(result.scannedCandidateFiles).toEqual(expect.arrayContaining(brushModules));
  });

  it.each(brushModules)(
    'rejects a shipping-source escape from %s and restores its positive',
    (module) => {
      const target = fixture();
      const original = readFileSync(join(target, module), 'utf8');
      expectRejectedMutationAndRestore(
        target,
        module,
        `${original}\nimport '${shippingPaletteSpecifier}';\n`,
        'escapes candidate ownership'
      );
    }
  );
});
