// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseColoringPackManifest, resolveColoringPackManifest } from './manifest';

function manifest() {
  const path = '/coloring/farm/cover.thumb.webp';
  const file = (downloadPath: string) => ({
    path,
    downloadPath,
    bytes: 3,
    sha256: 'a'.repeat(64),
  });
  return {
    formatVersion: 2,
    appVersion: '1.2.3',
    starterBookId: 'farm',
    books: [
      {
        id: 'farm',
        variants: {
          compact: {
            bytes: 3,
            files: [file('/coloring/max-240px/farm/cover.thumb.webp')],
          },
          full: { bytes: 3, files: [file(path)] },
        },
      },
    ],
  };
}

describe('parseColoringPackManifest', () => {
  it('accepts both resolution tiers and resolves one runtime inventory', () => {
    const parsed = parseColoringPackManifest(manifest(), '1.2.3');
    const compact = resolveColoringPackManifest(parsed, 'compact');
    expect(compact.resolution).toBe('compact');
    expect(compact.books[0].files[0].downloadPath).toBe(
      '/coloring/max-240px/farm/cover.thumb.webp'
    );
  });

  it('rejects version, path, digest, aggregate-byte, and tier mismatches', () => {
    expect(() => parseColoringPackManifest(manifest(), '2.0.0')).toThrow();
    for (const mutation of [
      (value: ReturnType<typeof manifest>) =>
        (value.books[0].variants.full.files[0].path = '../escape.webp'),
      (value: ReturnType<typeof manifest>) =>
        (value.books[0].variants.compact.files[0].downloadPath = '/coloring/farm/cover.thumb.webp'),
      (value: ReturnType<typeof manifest>) =>
        (value.books[0].variants.full.files[0].sha256 = 'bad'),
      (value: ReturnType<typeof manifest>) => (value.books[0].variants.full.bytes = 4),
      (value: ReturnType<typeof manifest>) =>
        value.books[0].variants.compact.files.push({
          ...value.books[0].variants.compact.files[0],
          path: '/coloring/farm/extra.thumb.webp',
        }),
    ]) {
      const value = manifest();
      mutation(value);
      expect(() => parseColoringPackManifest(value, '1.2.3')).toThrow();
    }
  });
});
