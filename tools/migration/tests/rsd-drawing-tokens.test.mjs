import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  assertRsdTokenProjection,
  RSD_DRAWING_TOKENS_URL,
  rsdTokenSource,
} from '../lib/rsd-fixture-tokens.mjs';

const actual = () => readFileSync(RSD_DRAWING_TOKENS_URL, 'utf8');

it('renders the maintained token values in canonical project formatting', async () => {
  expect(await rsdTokenSource()).toBe(actual());
  await expect(assertRsdTokenProjection(actual())).resolves.toBeUndefined();
});

for (const [name, from, to] of [
  ['mapping', 'brandSolid:', 'unownedBrand:'],
  ['value', '#ffffff', '#010203'],
  ['registration', 'export const colors', 'export const unrelated'],
  ['format', 'export const colors', 'export   const colors'],
]) {
  it(`rejects ${name} drift through the actual projection consumer`, async () => {
    const changed = actual().replace(from, to);
    expect(changed).not.toBe(actual());
    await expect(assertRsdTokenProjection(changed)).rejects.toThrow(
      'RSD drawing token projection drift'
    );
  });
}
