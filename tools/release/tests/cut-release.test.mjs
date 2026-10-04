import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  chooseVersionCode,
  findHandEditedVersionFiles,
  findStrayReleasePaths,
  GIT_STATUS_ARGS,
  parseReleaseArgs,
  pnpmVersionArgs,
  releaseSetPaths,
  renderReleaseFile,
} from '../cut-release.mjs';
import {
  ANDROID_GRADLE_PATH,
  bumpAndroidGradle,
  bumpIosPbxproj,
  IOS_PBXPROJ_PATH,
  readAndroidVersion,
} from '../lib/native-version.mjs';
import { parseFrontmatter } from '../lib/release-frontmatter.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');

// A checkout at 1.6.0 (versionCode 8), where each test cuts 1.7.0 (versionCode 9).
const HEAD_VERSION_FILES = {
  'package.json': `${JSON.stringify({ name: 'splotch', version: '1.6.0', private: true }, null, 2)}\n`,
  [ANDROID_GRADLE_PATH]:
    'android {\n    defaultConfig {\n        versionCode 8\n        versionName "1.6.0"\n    }\n}\n',
  [IOS_PBXPROJ_PATH]: ['Debug', 'Release']
    .map(
      (configuration) =>
        `\t\t${configuration} = {\n\t\t\tbuildSettings = {\n` +
        '\t\t\t\tCURRENT_PROJECT_VERSION = 8;\n\t\t\t\tMARKETING_VERSION = 1.6.0;\n\t\t\t};\n\t\t};\n'
    )
    .join(''),
};
const BUMPED_VERSION_FILES = {
  'package.json': `${JSON.stringify({ name: 'splotch', version: '1.7.0', private: true }, null, 2)}\n`,
  [ANDROID_GRADLE_PATH]: bumpAndroidGradle(HEAD_VERSION_FILES[ANDROID_GRADLE_PATH], '1.7.0', 9),
  [IOS_PBXPROJ_PATH]: bumpIosPbxproj(HEAD_VERSION_FILES[IOS_PBXPROJ_PATH], '1.7.0', 9),
};
const DEVELOPMENT_TEAM_LINE = '\t\t\t\tDEVELOPMENT_TEAM = ABCDE12345;\n';

const releaseDocument = (version, androidVersionCode) =>
  renderReleaseFile(
    [`version: ${version}`, 'date: 2026-10-01']
      .concat(androidVersionCode ? [`androidVersionCode: ${androidVersionCode}`] : [])
      .join('\n'),
    `## New\n\n* What ${version} adds`
  );

// The releases as a 1.7.0 cut leaves them: the new release pinned at versionCode 9.
const RELEASES_AFTER_CUT = [
  {
    filename: '1.7.0.md',
    meta: { version: '1.7.0', androidVersionCode: '9' },
    body: '## New\n\n* What 1.7.0 adds',
  },
  {
    filename: '1.6.0.md',
    meta: { version: '1.6.0', androidVersionCode: '8' },
    body: '## New\n\n* What 1.6.0 adds',
  },
];
const RELEASE_SET = releaseSetPaths('1.7.0', RELEASES_AFTER_CUT);

// A `git status --porcelain -z` listing: every field NUL-terminated, a rename's
// source in a field of its own.
const listing = (...fields) => fields.map((field) => `${field}\0`).join('');

// What a dry run of 1.7.0 leaves, and so what a real cut finds before its first write.
const DRY_RUN_LISTING = listing(
  ' M package.json',
  ` M ${ANDROID_GRADLE_PATH}`,
  ` M ${IOS_PBXPROJ_PATH}`,
  '?? releases/1.7.0.md',
  ' M web/src/lib/releases.json',
  ' M web/src/lib/components/settings/CurrentReleaseNotes.svelte',
  ' M web/src/lib/components/page/ReleaseHistory.svelte',
  '?? fastlane/metadata/android/en-US/changelogs/9.txt',
  ' M fastlane/metadata/en-US/release_notes.txt'
);

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function scratchDir() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-release-cut-'));
  roots.push(root);
  return root;
}

function writeFiles(root, files) {
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
}

// Git with no global or system config, so this machine's signing, hooks, or default
// branch cannot change what happens in a scratch repository.
const SCRATCH_GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

function commitEverything(root) {
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', env: SCRATCH_GIT_ENV });
  git('init', '-q', '--initial-branch=main', '.');
  git('config', 'user.email', 'release@test');
  git('config', 'user.name', 'release test');
  git('add', '-A');
  git('commit', '-qm', 'before the release');
  return git;
}

describe('parseReleaseArgs', () => {
  it('takes a version and the two flags', () => {
    expect(parseReleaseArgs(['1.4.0'])).toEqual({
      version: '1.4.0',
      dryRun: false,
      noPublish: false,
    });
    expect(parseReleaseArgs(['1.4.0', '--dry-run']).dryRun).toBe(true);
    expect(parseReleaseArgs(['--no-publish', '1.4.0']).noPublish).toBe(true);
  });

  // gen-release-notes reads only x.y.z release files, so a prerelease cut used to
  // tag and ship the previous release's notes; App Store Connect then rejected
  // the non-integer MARKETING_VERSION after the tag was public.
  it('rejects a prerelease version before anything is written', () => {
    expect(() => parseReleaseArgs(['1.4.0-beta.1'])).toThrow(/no prerelease suffix/);
    expect(() => parseReleaseArgs(['1.4.0-rc1', '--dry-run'])).toThrow(/must look like 1\.2\.0/);
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

describe('chooseVersionCode', () => {
  const gradle = { gradleCode: 8, gradleVersionName: '1.6.0' };
  const choose = (pin, version = '1.7.0') => chooseVersionCode({ pin, version, ...gradle });

  it('assigns the next code when the release file has no pin', () => {
    expect(choose(undefined)).toEqual({ versionCode: 9, pinned: false });
  });

  // Number('') is 0, so a placeholder `androidVersionCode:` line used to pin
  // versionCode 0 into Gradle and iOS and ship it through tag and GitHub Release.
  it('treats a blank pin as unpinned', () => {
    expect(choose('')).toEqual({ versionCode: 9, pinned: false });
  });

  it('accepts a pin that moves forward', () => {
    expect(choose('12')).toEqual({ versionCode: 12, pinned: true });
  });

  it('rejects a pin at or below the current code for a new version', () => {
    expect(() => choose('8')).toThrow(
      '1.7.0.md pins androidVersionCode 8, which does not move past versionCode 8 (versionName 1.6.0)'
    );
    expect(() => choose('3')).toThrow(/does not move past versionCode 8/);
    expect(() => choose('0')).toThrow(/does not move past versionCode 8/);
  });

  // An earlier dry run or --no-publish cut of this same version already wrote
  // the pinned code into Gradle; re-running it must not trip the forward check.
  it('accepts a pin equal to the current code on a re-run of the same version', () => {
    expect(choose('8', '1.6.0')).toEqual({ versionCode: 8, pinned: true });
    expect(() => choose('7', '1.6.0')).toThrow(/does not move past/);
  });

  it('rejects a pin that is not a whole number', () => {
    expect(() => choose('9.5')).toThrow('1.7.0.md: androidVersionCode must be a whole number');
    expect(() => choose('nine')).toThrow(/whole number/);
    expect(() => choose('-1')).toThrow(/whole number/);
  });

  // Number('9007199254740993') is 9007199254740992, so an oversized pin would
  // write a different code into Gradle than the release file records.
  it('rejects a pin above the largest code Play accepts', () => {
    expect(choose('2100000000')).toEqual({ versionCode: 2100000000, pinned: true });
    expect(() => choose('2100000001')).toThrow(/whole number up to 2100000000/);
    expect(() => choose('9007199254740993')).toThrow(/whole number up to/);
    expect(() => choose('9'.repeat(400))).toThrow(/whole number up to/);
  });

  it('rejects a Gradle file without a versionCode', () => {
    expect(() =>
      chooseVersionCode({ pin: '', version: '1.7.0', gradleCode: NaN, gradleVersionName: '1.6.0' })
    ).toThrow(/no versionCode line/);
  });
});

describe('renderReleaseFile', () => {
  // Pinning androidVersionCode rewrites the file; dropping the blank line after
  // the closing fence makes the release commit fail CI's `dprint check`.
  it('keeps a blank line between the frontmatter fence and the body', () => {
    const rendered = renderReleaseFile(
      'version: 1.4.0\nandroidVersionCode: 6',
      '## New\n\n* Thing'
    );

    expect(rendered).toBe('---\nversion: 1.4.0\nandroidVersionCode: 6\n---\n\n## New\n\n* Thing\n');
  });

  it('round-trips through parseFrontmatter without drifting', () => {
    const once = renderReleaseFile('version: 1.4.0', '## New\n\n* Thing');
    const parsed = parseFrontmatter(once);

    expect(renderReleaseFile(parsed.frontmatter, parsed.body)).toBe(once);
  });
});

describe('releaseSetPaths', () => {
  it('is exactly the version files, the release document, and every generator output', () => {
    expect(RELEASE_SET).toEqual([
      'package.json',
      'android/app/build.gradle',
      'ios/App/App.xcodeproj/project.pbxproj',
      'releases/1.7.0.md',
      'web/src/lib/releaseHues.ts',
      'web/src/lib/releases.json',
      'web/src/lib/components/settings/CurrentReleaseNotes.svelte',
      'web/src/lib/components/page/ReleaseHistory.svelte',
      'fastlane/metadata/android/en-US/changelogs/9.txt',
      'fastlane/metadata/android/en-US/changelogs/8.txt',
      'fastlane/metadata/en-US/release_notes.txt',
    ]);
  });
});

describe('findStrayReleasePaths', () => {
  // The documented flow is `--dry-run`, then the real cut of the same version.
  it('passes the tree a dry run of the same version leaves', () => {
    expect(findStrayReleasePaths(DRY_RUN_LISTING, RELEASE_SET)).toEqual([]);
  });

  it('refuses a changed file beside the version files, such as Info.plist', () => {
    expect(findStrayReleasePaths(listing(' M ios/App/App/Info.plist'), RELEASE_SET)).toEqual([
      'ios/App/App/Info.plist',
    ]);
  });

  // The generator reads every releases/*.md, so a draft of the next release would
  // ship as the newest What's New and App Store notes inside this release.
  it('refuses a draft of the next release', () => {
    expect(findStrayReleasePaths(listing('?? releases/1.8.0.md'), RELEASE_SET)).toEqual([
      'releases/1.8.0.md',
    ]);
  });

  it('refuses a file inside a new directory', () => {
    const plugin = 'android/app/src/main/java/art/splotch/app/DebugPlugin.java';

    expect(findStrayReleasePaths(listing(`?? ${plugin}`), RELEASE_SET)).toEqual([plugin]);
  });

  it('reports a change outside the set after generation', () => {
    const generated = DRY_RUN_LISTING + listing(' M web/src/lib/releaseSections.ts');

    expect(findStrayReleasePaths(generated, RELEASE_SET)).toEqual([
      'web/src/lib/releaseSections.ts',
    ]);
  });

  // A rename deletes its source in the commit, so both of its paths are checked.
  it('checks both paths of a rename', () => {
    expect(
      findStrayReleasePaths(listing('R  releases/1.7.0.md', 'tools/old.mjs'), RELEASE_SET)
    ).toEqual(['tools/old.mjs']);
    expect(
      findStrayReleasePaths(listing('R  tools/new.mjs', 'releases/1.7.0.md'), RELEASE_SET)
    ).toEqual(['tools/new.mjs']);
  });

  // A version bump does not rewrite pnpm-lock.yaml the way it rewrote
  // package-lock.json, so a dirty lockfile here is somebody else's change
  // and `git add -A` would sweep it into the release commit.
  it('treats a dirty lockfile as a stray change', () => {
    expect(findStrayReleasePaths(listing(' M pnpm-lock.yaml'), RELEASE_SET)).toEqual([
      'pnpm-lock.yaml',
    ]);
  });

  it('refuses a listing it cannot read', () => {
    expect(() => findStrayReleasePaths(listing('Mpackage.json'), RELEASE_SET)).toThrow(
      new Error('Unreadable git status record: "Mpackage.json"')
    );
    expect(() => findStrayReleasePaths(listing('R  releases/1.7.0.md'), RELEASE_SET)).toThrow(
      new Error('git status record has no source path: "R  releases/1.7.0.md"')
    );
  });
});

describe('findHandEditedVersionFiles', () => {
  const editedAfter = (edits) =>
    findHandEditedVersionFiles({
      version: '1.7.0',
      versionCode: 9,
      head: HEAD_VERSION_FILES,
      working: { ...BUMPED_VERSION_FILES, ...edits },
    });

  it('passes version files that hold exactly the bump', () => {
    expect(editedAfter({})).toEqual([]);
  });

  // Xcode writes the signing Team into project.pbxproj when one is picked in its UI.
  it('refuses a DEVELOPMENT_TEAM line in the pbxproj', () => {
    const pbxproj = BUMPED_VERSION_FILES[IOS_PBXPROJ_PATH].replace(
      '\t\t\t\tMARKETING_VERSION',
      `${DEVELOPMENT_TEAM_LINE}\t\t\t\tMARKETING_VERSION`
    );

    expect(editedAfter({ [IOS_PBXPROJ_PATH]: pbxproj })).toEqual([IOS_PBXPROJ_PATH]);
  });

  it('refuses a debugging edit in build.gradle', () => {
    const gradle = BUMPED_VERSION_FILES[ANDROID_GRADLE_PATH].replace(
      'versionName "1.7.0"',
      'versionName "1.7.0"\n        debuggable true'
    );

    expect(editedAfter({ [ANDROID_GRADLE_PATH]: gradle })).toEqual([ANDROID_GRADLE_PATH]);
  });

  // pnpm decides package.json's formatting; only its data is the release's business.
  it('compares package.json as data', () => {
    const bumped = { name: 'splotch', version: '1.7.0', private: true };

    expect(editedAfter({ 'package.json': JSON.stringify(bumped) })).toEqual([]);
    expect(
      editedAfter({ 'package.json': JSON.stringify({ ...bumped, dependencies: { left: '1' } }) })
    ).toEqual(['package.json']);
  });
});

describe('the git status listing', () => {
  // -z and --untracked-files=all are only meaningful as git's behavior: without them a
  // new directory lists as `?? android/`, and a path with spaces or non-ASCII comes back
  // quoted and octal-escaped, so neither matches an exact path.
  it('names each new file raw, and both paths of a staged rename', () => {
    const root = scratchDir();
    writeFiles(root, {
      'package.json': '{}\n',
      'releases/1.6.0.md': releaseDocument('1.6.0', 8),
      'tools/old.mjs': 'export {};\n',
    });
    const git = commitEverything(root);
    git('mv', 'tools/old.mjs', 'releases/1.7.0.md');
    writeFiles(root, {
      'android/app/src/main/java/art/splotch/app/DebugPlugin.java': 'class DebugPlugin {}\n',
      'releases/draft notes für 1.8.0.md': 'draft\n',
    });

    expect(findStrayReleasePaths(git(...GIT_STATUS_ARGS), RELEASE_SET).sort()).toEqual([
      'android/app/src/main/java/art/splotch/app/DebugPlugin.java',
      'releases/draft notes für 1.8.0.md',
      'tools/old.mjs',
    ]);
  });
});

// Driving the real pnpm rather than asserting on the flag strings: the strings
// are only meaningful as behavior, and the behavior is surprising. pnpm refuses
// to bump a dirty tree even under --no-git-tag-version, and bumpVersions() has
// always written the Android/iOS version files by the time it bumps package.json
// — so the tree this runs against is never clean. A release cut is the worst
// place to find that out, and it is not reachable from any other test.
describe('the pnpm version bump', () => {
  /** A git repo mid-release: committed, then dirtied the way bumpVersions() dirties it. */
  function releaseInProgress() {
    const root = scratchDir();
    writeFiles(root, {
      'package.json': `${JSON.stringify({ name: 'p', version: '1.5.0' })}\n`,
      'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
      'build.gradle': 'versionName "1.5.0"\n',
    });
    const git = commitEverything(root);
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

// The release scripts and every module they import, copied rather than imported:
// ROOT is two folders above tools/lib/proc.mjs, so the copies run the real cut
// against the scratch checkout, end to end.
const RELEASE_SCRIPTS = [
  'tools/lib/html.mjs',
  'tools/lib/proc.mjs',
  'tools/release/cut-release.mjs',
  'tools/release/gen-release-notes.mjs',
  'tools/release/lib/native-version.mjs',
  'tools/release/lib/release-frontmatter.mjs',
  'tools/release/lib/release-markdown.mjs',
];

// A cut launches node, pnpm, the generator, and git several times over. The dry run
// plus real cut takes about 1.4 s on a Mac; process launches run up to nine times
// slower on a loaded CI runner (see PNPM_LAUNCHES_TIMEOUT_MS in
// tools/rival-agent/tests/worktree.test.mjs), which still leaves this twice over.
const SCRATCH_CUT_TIMEOUT_MS = 30_000;

// The order these pin is the point: the stray-path refusal comes before the first
// write, and the hand-edit refusal comes before the commit.
describe('a release cut in a scratch checkout', () => {
  /** A 1.6.0 checkout with its generated notes committed and an unpinned 1.7.0.md. */
  function scratchCheckout() {
    const root = scratchDir();
    writeFiles(root, {
      ...Object.fromEntries(
        RELEASE_SCRIPTS.map((path) => [path, readFileSync(join(repoRoot, path), 'utf8')])
      ),
      ...HEAD_VERSION_FILES,
      'ios/App/App/Info.plist': '<plist version="1.0"><dict/></plist>\n',
      'releases/1.6.0.md': releaseDocument('1.6.0', 8),
    });
    execFileSync('node', ['tools/release/gen-release-notes.mjs'], { cwd: root });
    const git = commitEverything(root);
    writeFiles(root, { 'releases/1.7.0.md': releaseDocument('1.7.0') });
    const cut = (...flags) =>
      spawnSync('node', ['tools/release/cut-release.mjs', '1.7.0', ...flags], {
        cwd: root,
        encoding: 'utf8',
        env: SCRATCH_GIT_ENV,
      });
    const contents = () =>
      Object.fromEntries(
        git('ls-files', '-z', '--cached', '--others')
          .split('\0')
          .filter(Boolean)
          .map((path) => [path, readFileSync(join(root, path), 'utf8')])
      );
    return { root, git, cut, contents };
  }

  it('refuses a stray change before writing anything', { timeout: SCRATCH_CUT_TIMEOUT_MS }, () => {
    const { root, git, cut, contents } = scratchCheckout();
    writeFiles(root, {
      'ios/App/App/Info.plist': '<plist version="1.0"><dict/><!-- x --></plist>\n',
    });
    const before = contents();

    const result = cut('--no-publish');

    expect(result.stderr).toContain(
      'Working tree has changes outside the release set:\n  ios/App/App/Info.plist\n'
    );
    expect(result.status).toBe(1);
    expect(contents()).toEqual(before);
    expect(git('rev-list', '--count', 'HEAD').trim()).toBe('1');
  });

  it(
    'commits exactly the changed release set after a dry run of the same version',
    { timeout: SCRATCH_CUT_TIMEOUT_MS },
    () => {
      const { git, cut } = scratchCheckout();

      const dryRun = cut('--dry-run');
      expect(dryRun.status, dryRun.stderr).toBe(0);
      const release = cut('--no-publish');
      expect(release.status, release.stderr).toBe(0);

      expect(git('show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort()).toEqual([
        'android/app/build.gradle',
        'fastlane/metadata/android/en-US/changelogs/9.txt',
        'fastlane/metadata/en-US/release_notes.txt',
        'ios/App/App.xcodeproj/project.pbxproj',
        'package.json',
        'releases/1.7.0.md',
        'web/src/lib/components/page/ReleaseHistory.svelte',
        'web/src/lib/components/settings/CurrentReleaseNotes.svelte',
        'web/src/lib/releases.json',
      ]);
      expect(readAndroidVersion(git('show', `HEAD:${ANDROID_GRADLE_PATH}`))).toEqual({
        versionName: '1.7.0',
        versionCode: 9,
      });
      expect(git('tag', '--points-at', 'HEAD').trim()).toBe('v1.7.0');
      expect(git(...GIT_STATUS_ARGS)).toBe('');
    }
  );

  it(
    'refuses a hand edit inside a version file and commits nothing',
    { timeout: SCRATCH_CUT_TIMEOUT_MS },
    () => {
      const { root, git, cut } = scratchCheckout();
      writeFiles(root, {
        [IOS_PBXPROJ_PATH]: HEAD_VERSION_FILES[IOS_PBXPROJ_PATH].replace(
          '\t\t\t\tMARKETING_VERSION',
          `${DEVELOPMENT_TEAM_LINE}\t\t\t\tMARKETING_VERSION`
        ),
      });

      const result = cut('--no-publish');

      expect(result.stderr).toContain(
        `These version files differ from HEAD by more than the version bump:\n  ${IOS_PBXPROJ_PATH}\n`
      );
      expect(result.status).toBe(1);
      expect(git('rev-list', '--count', 'HEAD').trim()).toBe('1');
      expect(git('tag').trim()).toBe('');
    }
  );

  // A checkout under core.autocrlf=true holds CRLF files that git reports as
  // unchanged; HEAD read as stored bytes (LF) would make every cut there refuse
  // both native files as hand-edited.
  it(
    'accepts the line endings a checkout converts the version files to',
    { timeout: SCRATCH_CUT_TIMEOUT_MS },
    () => {
      const { root, git, cut } = scratchCheckout();
      git('config', 'core.autocrlf', 'true');
      for (const path of [ANDROID_GRADLE_PATH, IOS_PBXPROJ_PATH]) rmSync(join(root, path));
      git('checkout', '--', ANDROID_GRADLE_PATH, IOS_PBXPROJ_PATH);
      expect(readFileSync(join(root, ANDROID_GRADLE_PATH), 'utf8')).toContain('versionCode 8\r\n');

      const release = cut('--no-publish');

      expect(release.status, release.stderr).toBe(0);
      expect(git('tag', '--points-at', 'HEAD').trim()).toBe('v1.7.0');
    }
  );

  // --dry-run skips the tree check, so the release document's own check is what
  // stops a 1.7.0.md copied forward from 1.6.0 before the pin is written.
  it(
    'refuses a release document whose version is not its filename, before writing anything',
    { timeout: SCRATCH_CUT_TIMEOUT_MS },
    () => {
      const { root, cut, contents } = scratchCheckout();
      writeFiles(root, { 'releases/1.7.0.md': releaseDocument('1.6.0') });
      const before = contents();

      const result = cut('--dry-run');

      expect(result.stderr).toContain(
        '1.7.0.md: frontmatter version 1.6.0 does not match the filename version 1.7.0'
      );
      expect(result.status).toBe(1);
      expect(contents()).toEqual(before);
    }
  );

  it('fails a cut whose iOS project is missing', { timeout: SCRATCH_CUT_TIMEOUT_MS }, () => {
    const { root, git, cut } = scratchCheckout();
    rmSync(join(root, 'ios'), { recursive: true });
    git('add', '-A');
    git('commit', '-qm', 'no iOS project');

    const result = cut('--dry-run');

    expect(result.stderr).toMatch(/ENOENT: no such file or directory, open '.*project\.pbxproj'/);
    expect(result.status).toBe(1);
  });
});
