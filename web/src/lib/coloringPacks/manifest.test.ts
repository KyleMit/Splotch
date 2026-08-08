import { describe, expect, it } from 'vitest';
import { parseColoringPackManifest } from './manifest';

function manifest() {
  return {
    formatVersion: 1,
    appVersion: '1.2.3',
    starterBookId: 'farm',
    books: [
      {
        id: 'farm',
        bytes: 3,
        files: [{ path: '/coloring/farm/cover.thumb.webp', bytes: 3, sha256: 'a'.repeat(64) }],
      },
    ],
  };
}

describe('parseColoringPackManifest', () => {
  it('accepts the versioned, internally consistent wire format', () => {
    expect(parseColoringPackManifest(manifest(), '1.2.3').starterBookId).toBe('farm');
  });

  it('rejects version, path, digest, and aggregate-byte mismatches', () => {
    expect(() => parseColoringPackManifest(manifest(), '2.0.0')).toThrow();
    for (const mutation of [
      (value: ReturnType<typeof manifest>) => (value.books[0].files[0].path = '../escape.webp'),
      (value: ReturnType<typeof manifest>) => (value.books[0].files[0].sha256 = 'bad'),
      (value: ReturnType<typeof manifest>) => (value.books[0].bytes = 4),
    ]) {
      const value = manifest();
      mutation(value);
      expect(() => parseColoringPackManifest(value, '1.2.3')).toThrow();
    }
  });
});
