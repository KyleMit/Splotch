import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import {
  compareArtifactVersion,
  inspectArtifact,
  parseExpected,
  parsePublishArgs,
} from '../publish-release-artifacts.mjs';
import { releaseBundle } from './fixtures/release-bundle.mjs';

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

  // Skipping on a null would quietly shrink the check to versionName alone.
  it('treats a missing versionCode on either side as a mismatch', () => {
    expect(
      compareArtifactVersion(
        { version: '1.4.0', versionCode: null },
        { versionName: '1.4.0', versionCode: '6' }
      )
    ).toEqual(['versionCode is 6, expected none']);
    expect(
      compareArtifactVersion(
        { version: '1.4.0', versionCode: 6 },
        { versionName: '1.4.0', versionCode: null }
      )
    ).toEqual(['versionCode is none, expected 6']);
    expect(
      compareArtifactVersion(
        { version: '1.4.0', versionCode: null },
        { versionName: '1.4.0', versionCode: null }
      )
    ).toEqual(['versionCode is none, expected none']);
  });
});

describe('parseExpected', () => {
  const file = 'releases/1.7.0.md';
  const source = (frontmatter) => `---\nversion: 1.7.0\n${frontmatter}\n---\n\n## New\n\n* Thing\n`;
  const parse = (frontmatter) =>
    parseExpected({ version: '1.7.0', file, source: source(frontmatter) });

  it('reads the versionCode the release file pins', () => {
    expect(parse('androidVersionCode: 9')).toEqual({ version: '1.7.0', versionCode: 9 });
  });

  // Number('') is 0 and Number(undefined) is NaN; neither may stand in for a pin.
  it.each([
    ['no androidVersionCode', 'date: 2026-10-04'],
    ['a blank androidVersionCode', 'androidVersionCode:'],
  ])('refuses a release file with %s', (_name, frontmatter) => {
    expect(() => parse(frontmatter)).toThrow(
      new Error(
        'releases/1.7.0.md has no whole-number androidVersionCode; npm run release 1.7.0 pins it'
      )
    );
  });

  it('names a pin that is not a whole number', () => {
    expect(() => parse('androidVersionCode: 9.5')).toThrow(
      new Error(
        'releases/1.7.0.md has no whole-number androidVersionCode (got "9.5"); ' +
          'npm run release 1.7.0 pins it'
      )
    );
  });

  it('refuses a release file without frontmatter', () => {
    expect(() => parseExpected({ version: '1.7.0', file, source: '## New\n' })).toThrow(
      new Error('releases/1.7.0.md: malformed frontmatter')
    );
  });
});

describe('inspectArtifact on an Android bundle', () => {
  const unsigned =
    'unsigned: no META-INF/*.RSA, *.DSA or *.EC signature block; ' +
    'rebuild it with android/keystore.properties in place';
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'splotch-publish-'));
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function inspectBundle(bytes) {
    const path = join(dir, 'app-release.aab');
    writeFileSync(path, bytes);
    return inspectArtifact({ version: '1.6.0', versionCode: 8 }, 'android', path);
  }

  it.each(['META-INF/UPLOAD.RSA', 'META-INF/CERT.DSA', 'META-INF/KEY0.EC'])(
    'accepts a bundle whose JAR signature block is %s',
    (signatureBlock) => {
      expect(inspectBundle(releaseBundle({ signatureBlock }))).toEqual({
        actual: { versionName: '1.6.0', versionCode: '8' },
        problems: [],
      });
    }
  );

  it('refuses an unsigned bundle and says how to sign it', () => {
    expect(inspectBundle(releaseBundle({ signatureBlock: null })).problems).toEqual([unsigned]);
  });

  // A signature file alone is not a signature, and a block under a module's
  // root/META-INF/ is a packaged resource, not the bundle's own signature.
  it.each(['META-INF/UPLOAD.SF', 'base/root/META-INF/LIBRARY.RSA'])(
    'refuses a bundle whose only signature-like entry is %s',
    (signatureBlock) => {
      expect(inspectBundle(releaseBundle({ signatureBlock })).problems).toEqual([unsigned]);
    }
  );

  it('refuses a bundle whose manifest carries no versionCode', () => {
    expect(inspectBundle(releaseBundle({ versionCode: null })).problems).toEqual([
      'versionCode is none, expected 8',
    ]);
  });

  it('reports an unreadable bundle without running the bundle checks', () => {
    expect(inspectBundle(Buffer.from('not a zip'))).toEqual({
      problems: ['unreadable: not a zip archive (no end-of-central-directory record)'],
    });
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
