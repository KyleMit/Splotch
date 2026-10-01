import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { shareCardInputHash } from '../lib/share-card-inputs.mjs';

it('requires committed cards to be regenerated after visual inputs change', () => {
  const provenance = JSON.parse(
    readFileSync(join(ROOT, 'web/src/lib/components/page/shareCardInputs.json'), 'utf8')
  );
  expect(provenance.inputSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(provenance.inputSha256, 'Run npm run gen:share-cards').toBe(shareCardInputHash());
});
