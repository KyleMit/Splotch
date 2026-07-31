import { describe, expect, it } from 'vitest';
import { findStrayReleasePaths, renderReleaseFile } from '../release.mjs';
import { parseFrontmatter } from '../lib/frontmatter.mjs';

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
      ' M package-lock.json',
      ' M web/src/lib/releases.json',
      ' M web/src/lib/components/parent/CurrentReleaseNotes.svelte',
      ' M android/app/build.gradle',
      ' M ios/App/project.pbxproj',
      ' M fastlane/Fastfile',
      ' M "releases/notes with spaces.md"',
      'R  scripts/old.mjs -> releases/renamed.md',
      'R  releases/old.md -> scripts/new.mjs',
      ' M scripts/release.mjs',
    ].join('\n');

    expect(findStrayReleasePaths(status)).toEqual(['scripts/new.mjs', 'scripts/release.mjs']);
  });
});
