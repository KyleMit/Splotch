// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildColoringPackManifest } from '../../../coloringPackManifest';

describe('buildColoringPackManifest', () => {
  it('offers every logical runtime file at compact and full resolutions', () => {
    const { manifest } = buildColoringPackManifest('1.2.3-test', 'mobile');
    let compactBytes = 0;
    let fullBytes = 0;

    for (const book of manifest.books) {
      const compact = book.variants.compact;
      const full = book.variants.full;
      expect(compact.files).toHaveLength(73);
      expect(compact.files.map((file) => file.path)).toEqual(full.files.map((file) => file.path));
      expect(compact.files.every((file) => file.downloadPath.includes(`/max-`))).toBe(true);
      expect(full.files.every((file) => file.downloadPath === file.path)).toBe(true);
      expect(compact.bytes).toBeLessThan(full.bytes);
      compactBytes += compact.bytes;
      fullBytes += full.bytes;
    }

    expect(compactBytes).toBeLessThan(fullBytes * 0.7);
  });
});
