import { describe, expect, it } from 'vitest';
import { findStrayReleasePaths, parseReleaseArgs, renderReleaseFile } from '../cut-release.mjs';
import { parseFrontmatter } from '../lib/release-frontmatter.mjs';

describe('parseReleaseArgs', () => {
  it('takes a version and the two flags', () => {
    expect(parseReleaseArgs(['1.4.0'])).toEqual({
      version: '1.4.0',
      dryRun: false,
      noPublish: false,
    });
    expect(parseReleaseArgs(['1.4.0-beta.1', '--dry-run'])).toEqual({
      version: '1.4.0-beta.1',
      dryRun: true,
      noPublish: false,
    });
    expect(parseReleaseArgs(['--no-publish', '1.4.0']).noPublish).toBe(true);
  });

  // A typo'd --dry-run used to be dropped silently, which ran the full publish
  // path: commit, tag, push, gh release create.
  it('rejects an unknown flag instead of ignoring it', () => {
    expect(() => parseReleaseArgs(['1.4.0', '--dry-rn'])).toThrow(/--dry-rn/);
    expect(() => parseReleaseArgs(['1.4.0', '--dryrun'])).toThrow(/release\.mjs <semver>/);
    expect(() => parseReleaseArgs(['1.4.0', '--dry_run'])).toThrow();
    expect(() => parseReleaseArgs(['1.4.0', '--no-publsh'])).toThrow();
  });

  it('rejects a missing, malformed, or duplicated version', () => {
    expect(() => parseReleaseArgs(['--dry-run'])).toThrow(/must look like 1\.2\.0/);
    expect(() => parseReleaseArgs(['v1.4.0'])).toThrow(/must look like 1\.2\.0/);
    expect(() => parseReleaseArgs(['1.4.0', '1.5.0'])).toThrow(/must look like 1\.2\.0/);
  });
});

describe('renderReleaseFile', () => {
  // Pinning androidVersionCode rewrites the file; dropping the blank line after
  // the closing fence makes the release commit fail CI's `dprint check`.
  it('keeps a blank line between the frontmatter fence and the body', () => {
    const rendered = renderReleaseFile(
      'version: 1.4.0\nandroidVersionCode: 6',
      '## ✨ New\n\n* Thing'
    );

    expect(rendered).toBe(
      '---\nversion: 1.4.0\nandroidVersionCode: 6\n---\n\n## ✨ New\n\n* Thing\n'
    );
  });

  it('round-trips through parseFrontmatter without drifting', () => {
    const once = renderReleaseFile('version: 1.4.0', '## ✨ New\n\n* Thing');
    const parsed = parseFrontmatter(once);

    expect(renderReleaseFile(parsed.frontmatter, parsed.body)).toBe(once);
  });
});

describe('findStrayReleasePaths', () => {
  it('keeps only paths outside release artifacts after normalizing porcelain output', () => {
    const status = [
      ' M package.json',
      ' M web/src/lib/releases.json',
      ' M web/src/lib/components/settings/CurrentReleaseNotes.svelte',
      ' M web/src/lib/components/page/ReleaseHistory.svelte',
      ' M android/app/build.gradle',
      ' M ios/App/project.pbxproj',
      ' M fastlane/Fastfile',
      ' M "releases/notes with spaces.md"',
      'R  tools/old.mjs -> releases/renamed.md',
      'R  releases/old.md -> tools/new.mjs',
      ' M tools/release/cut-release.mjs',
    ].join('\n');

    expect(findStrayReleasePaths(status)).toEqual([
      'tools/new.mjs',
      'tools/release/cut-release.mjs',
    ]);
  });

  // A version bump does not rewrite pnpm-lock.yaml the way it rewrote
  // package-lock.json, so a dirty lockfile here is somebody else's change
  // and `git add -A` would sweep it into the release commit.
  it('treats a dirty lockfile as a stray change', () => {
    expect(findStrayReleasePaths(' M pnpm-lock.yaml')).toEqual(['pnpm-lock.yaml']);
  });
});
