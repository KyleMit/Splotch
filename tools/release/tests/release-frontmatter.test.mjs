import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../lib/release-frontmatter.mjs';

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

  // The `\r?` alternations exist for release files authored on a CRLF editor —
  // dropping them makes parseFrontmatter return null and fails the whole release
  // run, so the tolerance is pinned rather than assumed.
  it('tolerates CRLF fences and line splits', () => {
    expect(
      parseFrontmatter('---\r\nversion: 1.3.1\r\nandroidVersionCode: 7\r\n---\r\nRelease notes')
    ).toEqual({
      frontmatter: 'version: 1.3.1\r\nandroidVersionCode: 7',
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
