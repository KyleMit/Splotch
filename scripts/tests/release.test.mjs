import { describe, expect, it } from 'vitest';
import { findStrayReleasePaths } from '../release.mjs';

describe('findStrayReleasePaths', () => {
  it('keeps only paths outside release artifacts after normalizing porcelain output', () => {
    const status = [
      ' M package.json',
      ' M package-lock.json',
      ' M web/src/lib/releases.json',
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
