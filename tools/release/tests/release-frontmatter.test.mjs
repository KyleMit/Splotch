import { describe, expect, it } from 'vitest';
import { assertVersionMatchesFilename, parseFrontmatter } from '../lib/release-frontmatter.mjs';

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

describe('assertVersionMatchesFilename', () => {
  it('accepts the plain semver version the filename names', () => {
    expect(() => assertVersionMatchesFilename('1.7.0.md', '1.7.0')).not.toThrow();
  });

  // Copying the previous release file forward leaves its version inside, and the
  // generator sorts and renders by that version, not by the filename.
  it('rejects a version copied forward from the previous release, naming both', () => {
    expect(() => assertVersionMatchesFilename('1.7.0.md', '1.6.0')).toThrow(
      new Error('1.7.0.md: frontmatter version 1.6.0 does not match the filename version 1.7.0')
    );
  });

  it.each([
    ['a short version', '1.7.0.md', '1.7'],
    ['a prerelease version', '1.7.0.md', '1.7.0-beta.1'],
    ['a version equal to a non-semver filename', '1.7.md', '1.7'],
  ])('rejects %s', (_case, filename, version) => {
    expect(() => assertVersionMatchesFilename(filename, version)).toThrow(
      new Error(`${filename}: frontmatter version must look like 1.2.0, got "${version}"`)
    );
  });

  it('rejects a missing version', () => {
    expect(() => assertVersionMatchesFilename('1.7.0.md', undefined)).toThrow(
      new Error('1.7.0.md: frontmatter version must look like 1.2.0, got ""')
    );
  });
});
