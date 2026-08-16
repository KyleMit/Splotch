import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findStrayReleasePaths,
  parseReleaseArgs,
  pnpmVersionArgs,
  renderReleaseFile,
} from '../cut-release.mjs';
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

// Driving the real pnpm rather than asserting on the flag strings: the strings
// are only meaningful as behavior, and the behavior is surprising. pnpm refuses
// to bump a dirty tree even under --no-git-tag-version, and bumpVersions() has
// always written the Android/iOS version files by the time it bumps package.json
// — so the tree this runs against is never clean. A release cut is the worst
// place to find that out, and it is not reachable from any other test.
describe('the pnpm version bump', () => {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  /** A git repo mid-release: committed, then dirtied the way bumpVersions() dirties it. */
  function releaseInProgress() {
    const root = mkdtempSync(join(tmpdir(), 'splotch-release-bump-'));
    roots.push(root);
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

    writeFileSync(
      join(root, 'package.json'),
      `${JSON.stringify({ name: 'p', version: '1.5.0' })}\n`
    );
    writeFileSync(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
    writeFileSync(join(root, 'build.gradle'), 'versionName "1.5.0"\n');
    git('init', '-q', '.');
    git('config', 'user.email', 'release@test');
    git('config', 'user.name', 'release test');
    git('add', '-A');
    git('commit', '-qm', 'before the release');
    writeFileSync(join(root, 'build.gradle'), 'versionName "1.6.0"\n'); // setAndroidVersion
    return { root, git };
  }

  it('bumps package.json on the dirty tree a release cut always has', () => {
    const { root } = releaseInProgress();

    const bump = spawnSync('pnpm', pnpmVersionArgs('1.6.0'), { cwd: root, encoding: 'utf8' });

    expect(`${bump.stdout}${bump.stderr}`).not.toContain('ERR_PNPM_UNCLEAN_WORKING_TREE');
    expect(bump.status).toBe(0);
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version).toBe('1.6.0');
  });

  // The bump is one step of the release, not the release: cut-release.mjs stages,
  // commits, and tags afterward, and pnpm-lock.yaml records no root version, so
  // anything else moving here would be a surprise the release commit swallows.
  it('touches nothing but package.json', () => {
    const { root, git } = releaseInProgress();

    spawnSync('pnpm', pnpmVersionArgs('1.6.0'), { cwd: root, encoding: 'utf8' });

    // --name-only, not --porcelain: porcelain's status prefix is column-aligned,
    // so trimming the block to split it silently eats the first line's leading space.
    const changed = git('diff', '--name-only', 'HEAD').trim().split('\n').sort();
    expect(changed).toEqual(['build.gradle', 'package.json']);
    expect(git('tag').trim()).toBe('');
    expect(git('rev-list', '--count', 'HEAD').trim()).toBe('1');
  });
});
