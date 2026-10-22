import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { AI_STYLES } from '../../src/ai/contract.ts';

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

it.each(AI_STYLES)('bundles byte-identical light and dark first-party %s covers', async (style) => {
  for (const theme of ['light', 'dark']) {
    const filename = `${style.toLowerCase()}.${theme}.webp`;
    const bundled = await readFile(resolve(REPOSITORY, 'assets/ai-styles', filename));
    const original = await readFile(resolve(REPOSITORY, 'assets/static/styles', filename));
    expect(bundled.equals(original)).toBe(true);
  }
});
