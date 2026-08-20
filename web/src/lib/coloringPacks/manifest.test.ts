// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseColoringPackManifest, resolveColoringPackManifest } from './manifest';

function manifest() {
  const path = '/coloring/farm/cover.thumb.webp';
  const file = (downloadPath?: string) => ({
    path,
    ...(downloadPath ? { downloadPath } : {}),
    bytes: 3,
    sha256: 'a'.repeat(64),
  });
  return {
    formatVersion: 3,
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
          full: { bytes: 3, files: [file()] },
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
    const full = resolveColoringPackManifest(parsed, 'full');
    expect(full.books[0].files[0].downloadPath).toBe(full.books[0].files[0].path);
  });

  it('rejects version, path, digest, aggregate-byte, and tier mismatches', () => {
    expect(() => parseColoringPackManifest(manifest(), '2.0.0')).toThrow();
    for (const mutation of [
      (value: ReturnType<typeof manifest>) =>
        (value.books[0].variants.full.files[0].path = '../escape.webp'),
      (value: ReturnType<typeof manifest>) =>
        (value.books[0].variants.compact.files[0].downloadPath = '/outside/farm/cover.thumb.webp'),
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

  it('accepts only invariant overlay SVGs and requires identical bytes across tiers', () => {
    const value = manifest();
    const svg = {
      path: '/coloring/farm/cat-tall.overlay.svg',
      bytes: 2,
      sha256: 'b'.repeat(64),
    };
    value.books[0].variants.compact.files.push(svg);
    value.books[0].variants.compact.bytes += svg.bytes;
    value.books[0].variants.full.files.push({ ...svg });
    value.books[0].variants.full.bytes += svg.bytes;

    expect(() => parseColoringPackManifest(value, '1.2.3')).not.toThrow();
    value.books[0].variants.compact.files[1].sha256 = 'c'.repeat(64);
    expect(() => parseColoringPackManifest(value, '1.2.3')).toThrow();
    value.books[0].variants.compact.files[1] = {
      ...svg,
      path: '/coloring/farm/cat-tall.light.svg',
    };
    value.books[0].variants.full.files[1] = {
      ...svg,
      path: '/coloring/farm/cat-tall.light.svg',
    };
    expect(() => parseColoringPackManifest(value, '1.2.3')).toThrow();
  });
});
