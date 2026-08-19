import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import {
  compareArtifactVersion,
  parsePublishArgs,
  resolveReleaseTagCommit,
} from '../publish-release-artifacts.mjs';

const RELEASE_COMMIT = '0123456789abcdef0123456789abcdef01234567';
const STALE_COMMIT = '89abcdef0123456789abcdef0123456789abcdef';
const expected = { version: '1.4.0', versionCode: 6, commitSha: RELEASE_COMMIT };

describe('compareArtifactVersion', () => {
  it('accepts an artifact whose embedded version matches the release', () => {
    expect(
      compareArtifactVersion(expected, {
        versionName: '1.4.0',
        versionCode: '6',
        commitSha: RELEASE_COMMIT,
      })
    ).toEqual([]);
  });

  // The v1.4.0 regression: a bundle left in the output directory two releases back.
  it('rejects a stale artifact on both versionName and versionCode', () => {
    expect(
      compareArtifactVersion(expected, {
        versionName: '1.2.0',
        versionCode: '4',
        commitSha: RELEASE_COMMIT,
      })
    ).toEqual(['versionName is 1.2.0, expected 1.4.0', 'versionCode is 4, expected 6']);
  });

  it('still rejects when only the versionCode drifted', () => {
    expect(
      compareArtifactVersion(expected, {
        versionName: '1.4.0',
        versionCode: '5',
        commitSha: RELEASE_COMMIT,
      })
    ).toEqual(['versionCode is 5, expected 6']);
  });

  it('skips the versionCode check only when a side genuinely has none', () => {
    expect(
      compareArtifactVersion(
        { ...expected, versionCode: null },
        { versionName: '1.4.0', versionCode: '6', commitSha: RELEASE_COMMIT }
      )
    ).toEqual([]);
    expect(
      compareArtifactVersion(expected, {
        versionName: '1.4.0',
        versionCode: null,
        commitSha: RELEASE_COMMIT,
      })
    ).toEqual([]);
  });

  it('rejects same-version staleness and names both full commits', () => {
    expect(
      compareArtifactVersion(expected, {
        versionName: '1.4.0',
        versionCode: '6',
        commitSha: STALE_COMMIT,
      })
    ).toEqual([`artifact commit is ${STALE_COMMIT}; release tag commit is ${RELEASE_COMMIT}`]);
  });

  it('rejects a pre-provenance artifact and names the expected tag commit', () => {
    expect(
      compareArtifactVersion(expected, {
        versionName: '1.4.0',
        versionCode: '6',
        commitSha: null,
      })
    ).toEqual([
      `artifact commit is missing (no build-provenance.json); release tag commit is ${RELEASE_COMMIT}`,
    ]);
  });
});

describe('resolveReleaseTagCommit', () => {
  it('accepts a full commit resolved from the release tag', () => {
    expect(resolveReleaseTagCommit('1.4.0', () => RELEASE_COMMIT)).toBe(RELEASE_COMMIT);
  });

  it.each([undefined, '0123456'])('rejects a missing or abbreviated tag commit', (commitSha) => {
    expect(() => resolveReleaseTagCommit('1.4.0', () => commitSha)).toThrow(
      /Could not resolve release tag v1\.4\.0/
    );
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
    expect(() => parsePublishArgs(['1.4.0', '--dryrun'])).toThrow(/publish-release-artifacts\.mjs/);
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

// cut-release.mjs attaching a build artifact is the bug this whole seam exists to
// prevent: at `gh release create` time the only artifact that can exist is one
// built for an *earlier* version, because this run is what bumps the version.
describe('cut-release.mjs', () => {
  const source = readFileSync(join(ROOT, 'tools', 'release', 'cut-release.mjs'), 'utf8');

  it('never attaches a build artifact to the GitHub release it creates', () => {
    expect(source).not.toMatch(/RELEASE_AAB|RELEASE_IPA|app-release\.aab|App\.ipa/);
  });

  it('points at the separate publish step instead', () => {
    expect(source).toMatch(/release:publish/);
  });
});
