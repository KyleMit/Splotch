import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../lib/frontmatter.mjs';

describe('parseFrontmatter', () => {
  it('parses flat keys and ignores blank lines', () => {
    expect(
      parseFrontmatter('---\nversion: 1.3.1\n \nandroidVersionCode: 7\n---\nRelease notes')
    ).toEqual({
      frontmatter: 'version: 1.3.1\n \nandroidVersionCode: 7',
      meta: { version: '1.3.1', androidVersionCode: '7' },
      body: 'Release notes',
    });
  });

  it('returns null without a frontmatter block', () => {
    expect(parseFrontmatter('Release notes')).toBeNull();
  });

  it('rejects malformed non-blank frontmatter lines', () => {
    expect(() => parseFrontmatter('---\nandroid-version-code: 7\n---\nRelease notes')).toThrow(
      'Malformed frontmatter line 1: android-version-code: 7'
    );
  });
});
