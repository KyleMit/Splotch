import { describe, expect, it } from 'vitest';
import { generateOfflineCatalog } from '../migration/gen-offline-catalog.mjs';

describe('native offline library generated asset contract', () => {
  it('pins every complete additional book to current canonical bytes without changing Farm', async () => {
    expect(await generateOfflineCatalog(['--check'])).toEqual({
      books: 7,
      filesPerVariant: Array(7).fill(74),
    });
  });
  it('rejects unsupported generator arguments before changing files', async () => {
    await expect(generateOfflineCatalog(['--download'])).rejects.toThrow(
      'Only --check is supported.'
    );
  });
});
