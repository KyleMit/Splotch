import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test('Bare glass ships a prefixed dynamic mask for the Chromium browser floor', () => {
  test.skip(process.env.DEV_SERVER === '1', 'Requires the production CSS build.');
  const assets = fileURLToPath(
    new URL('../.svelte-kit/output/client/_app/immutable/assets', import.meta.url)
  );
  const css = readdirSync(assets)
    .filter((file) => file.endsWith('.css'))
    .map((file) => readFileSync(`${assets}/${file}`, 'utf8'))
    .join('\n');
  expect(css).toMatch(/-webkit-mask-image:\s*var\(--glass-mask\)/);
  expect(css).toMatch(/(?:[;{])mask-image:\s*var\(--glass-mask\)/);
});
