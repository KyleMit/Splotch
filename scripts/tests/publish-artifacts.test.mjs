import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/proc.mjs';
import { compareArtifactVersion, parsePublishArgs } from '../publish-artifacts.mjs';

describe('compareArtifactVersion', () => {
  it('accepts an artifact whose embedded version matches the release', () => {
    expect(
      compareArtifactVersion(
        { version: '1.4.0', versionCode: 6 },
        { versionName: '1.4.0', versionCode: '6' }
      )
    ).toEqual([]);
  });

  // The v1.4.0 regression: a bundle left in the output directory two releases back.
  it('rejects a stale artifact on both versionName and versionCode', () => {
    expect(
      compareArtifactVersion(
        { version: '1.4.0', versionCode: 6 },
        { versionName: '1.2.0', versionCode: '4' }
      )
    ).toEqual(['versionName is 1.2.0, expected 1.4.0', 'versionCode is 4, expected 6']);
  });

  it('still rejects when only the versionCode drifted', () => {
    expect(
      compareArtifactVersion(
        { version: '1.4.0', versionCode: 6 },
        { versionName: '1.4.0', versionCode: '5' }
      )
    ).toEqual(['versionCode is 5, expected 6']);
  });

  it('skips the versionCode check only when a side genuinely has none', () => {
    expect(
      compareArtifactVersion(
        { version: '1.4.0', versionCode: null },
        { versionName: '1.4.0', versionCode: '6' }
      )
    ).toEqual([]);
    expect(
      compareArtifactVersion(
        { version: '1.4.0', versionCode: 6 },
        { versionName: '1.4.0', versionCode: null }
      )
    ).toEqual([]);
  });
});

describe('parsePublishArgs', () => {
  it('takes an optional version and flags', () => {
    expect(parsePublishArgs([])).toEqual({ version: undefined, only: undefined, dryRun: false });
    expect(parsePublishArgs(['1.4.0', '--dry-run'])).toEqual({
      version: '1.4.0',
      only: undefined,
      dryRun: true,
    });
    expect(parsePublishArgs(['--only=android']).only).toBe('android');
  });

  // A typo'd safety flag used to be dropped silently, which uploaded real artifacts.
  it('rejects an unknown flag instead of ignoring it', () => {
    expect(() => parsePublishArgs(['1.4.0', '--dry-rn'])).toThrow(/--dry-rn/);
    expect(() => parsePublishArgs(['1.4.0', '--dryrun'])).toThrow(/publish-artifacts\.mjs/);
    expect(() => parsePublishArgs(['1.4.0', '--only-android'])).toThrow();
  });

  it('rejects a bad version, an unknown platform, and a stray positional', () => {
    expect(() => parsePublishArgs(['v1.4.0'])).toThrow(/Not a version: v1\.4\.0/);
    expect(() => parsePublishArgs(['--only=web'])).toThrow(/--only must be one of: android, ios/);
    // An empty --only= must fail closed, not fall through to publishing every platform.
    expect(() => parsePublishArgs(['--only='])).toThrow(/--only must be one of: android, ios/);
    expect(() => parsePublishArgs(['--only', ''])).toThrow(/--only must be one of: android, ios/);
    expect(() => parsePublishArgs(['1.4.0', '1.5.0'])).toThrow(/Unexpected argument: 1\.5\.0/);
  });
});

// release.mjs attaching a build artifact is the bug this whole seam exists to
// prevent: at `gh release create` time the only artifact that can exist is one
// built for an *earlier* version, because this run is what bumps the version.
describe('release.mjs', () => {
  const source = readFileSync(join(ROOT, 'scripts', 'release.mjs'), 'utf8');

  it('never attaches a build artifact to the GitHub release it creates', () => {
    expect(source).not.toMatch(/RELEASE_AAB|RELEASE_IPA|app-release\.aab|App\.ipa/);
  });

  it('points at the separate publish step instead', () => {
    expect(source).toMatch(/release:publish/);
  });
});
