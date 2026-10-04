// Cuts a release from releases/<version>.md (which must already exist — the
// cut-release skill writes it). This is the deterministic, scriptable half
// of the workflow; the AI-drafting + review half lives in .ruler/skills/cut-release/SKILL.md.
//
//   node tools/release/cut-release.mjs 1.2.0              full: bump, generate, commit, tag, push, GitHub release
//   node tools/release/cut-release.mjs 1.2.0 --no-publish bump, generate, commit, tag locally — no push, no gh
//   node tools/release/cut-release.mjs 1.2.0 --dry-run    bump + generate files only, no git at all
//
// It never attaches store artifacts: the .aab/.ipa for this version cannot exist
// until after this script bumps and commits the version. Building them is the build
// skill and attaching them is tools/release/publish-release-artifacts.mjs (ADR-0077).
//
// Native version numbers are set directly in the Android/iOS project files by
// tools/release/lib/native-version.mjs so the two stay in sync; package.json is the
// canonical semver source.
//
// Bump major/minor here for a real release. The package.json *patch* digit is
// web-irrelevant: the web build derives its patch from the commit count since
// this release's git tag (major.minor.<commits-since-tag>, ADR-0030), so the tag
// created below is what resets the web patch to 0. Native still ships the exact
// package.json version.

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { ROOT, fail, run, capture, isMain, parseOrFail } from '../lib/proc.mjs';
import { readReleases, releaseNoteOutputPaths } from './gen-release-notes.mjs';
import {
  assertVersionMatchesFilename,
  parseFrontmatter,
  SEMVER,
} from './lib/release-frontmatter.mjs';
import {
  ANDROID_GRADLE_PATH,
  IOS_PBXPROJ_PATH,
  bumpAndroidGradle,
  bumpIosPbxproj,
  readAndroidVersion,
  setAndroidVersion,
  setIosVersion,
} from './lib/native-version.mjs';

const PACKAGE_JSON_PATH = 'package.json';
const VERSION_FILES = [PACKAGE_JSON_PATH, ANDROID_GRADLE_PATH, IOS_PBXPROJ_PATH];

// Everything a cut may change: the version files, this release's document (the
// androidVersionCode pin), and every file the generator writes for these releases.
// Exact paths, never a directory: an ios/ or releases/ prefix would admit an
// untracked plugin file, or a draft releases/1.8.0.md that the generator would then
// ship as the newest notes. No lockfile: pnpm-lock.yaml records dependency
// resolutions, not the root package's own version, so a version bump leaves it
// untouched and a dirty lockfile during a release is a stray change.
export const releaseSetPaths = (version, releases) => [
  ...VERSION_FILES,
  `releases/${version}.md`,
  ...releaseNoteOutputPaths(releases),
];

// The listing both stray-path checks read, as an argv the tests drive a real git
// with. -z prints each path raw and NUL-terminated, where the default quotes and
// escapes a path with spaces or non-ASCII; --untracked-files=all names each file
// in a new directory instead of the directory, which no exact path can match.
export const GIT_STATUS_ARGS = ['status', '--porcelain', '-z', '--untracked-files=all'];

// Every path a GIT_STATUS_ARGS listing names. A rename or copy carries its source
// as a second field, and a rename deletes that source in the commit, so both count.
function listedPaths(status) {
  const fields = status.split('\0');
  if (fields.at(-1) === '') fields.pop();
  const paths = [];
  for (let i = 0; i < fields.length; i += 1) {
    const record = fields[i];
    if (!/^[ MTADRCU?!]{2} ./s.test(record)) {
      throw new Error(`Unreadable git status record: ${JSON.stringify(record)}`);
    }
    paths.push(record.slice(3));
    if (/[RC]/.test(record.slice(0, 2))) {
      i += 1;
      if (i === fields.length) {
        throw new Error(`git status record has no source path: ${JSON.stringify(record)}`);
      }
      paths.push(fields[i]);
    }
  }
  return paths;
}

export function findStrayReleasePaths(status, releasePaths) {
  const allowed = new Set(releasePaths);
  return listedPaths(status).filter((path) => !allowed.has(path));
}

// A hand edit inside an allowed path passes the path check: Xcode stores a signing
// Team as DEVELOPMENT_TEAM in project.pbxproj (docs/MOBILE/ios.md keeps it in the
// untracked ios/local.xcconfig), and a debugging line can sit in build.gradle. So
// each version file must also equal its HEAD content through the owned bump.
// package.json is compared as data because pnpm owns its formatting.
export function findHandEditedVersionFiles({ version, versionCode, head, working }) {
  const matchesBump = {
    [PACKAGE_JSON_PATH]: isDeepStrictEqual(JSON.parse(working[PACKAGE_JSON_PATH]), {
      ...JSON.parse(head[PACKAGE_JSON_PATH]),
      version,
    }),
    [ANDROID_GRADLE_PATH]:
      working[ANDROID_GRADLE_PATH] ===
      bumpAndroidGradle(head[ANDROID_GRADLE_PATH], version, versionCode),
    [IOS_PBXPROJ_PATH]:
      working[IOS_PBXPROJ_PATH] === bumpIosPbxproj(head[IOS_PBXPROJ_PATH], version, versionCode),
  };
  return VERSION_FILES.filter((path) => !matchesBump[path]);
}

// The bump that moves package.json's version, as an argv the tests drive a real
// pnpm with — the flags are only meaningful as behavior, and a release cut is a
// bad place to discover one is wrong.
//
// --no-git-checks is load-bearing, not defensive. Unlike npm, pnpm refuses to bump
// a dirty working tree (ERR_PNPM_UNCLEAN_WORKING_TREE), and it checks that even
// under --no-git-tag-version — the flag that would suggest it is not going to
// touch git at all. bumpVersions() has already written android/ and ios/ by the
// time it calls this, so the tree is always dirty here and the release would abort
// before package.json moved. refuseStrayChanges() and refuseHandEditedVersionFiles()
// are what actually guard the tree; this call makes no commit and no tag, and
// pnpm-lock.yaml holds no version to resync.
export const pnpmVersionArgs = (version) => [
  'version',
  version,
  '--no-git-tag-version',
  '--allow-same-version',
  '--no-git-checks',
];

const RELEASE_USAGE =
  'Usage: node tools/release/cut-release.mjs <semver> [--no-publish] [--dry-run]\n  <semver> must look like 1.2.0, with no prerelease suffix';

// Strict parsing is the safety here: a mistyped --dry-run must not fall through
// to the real publish path, so an unknown flag is rejected rather than ignored.
// Throws instead of exiting so tests can observe the rejection; main() turns the
// throw into the usual one-line exit.
export function parseReleaseArgs(args) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: { 'dry-run': { type: 'boolean' }, 'no-publish': { type: 'boolean' } },
    });
  } catch (err) {
    throw new Error(`${err.message}\n${RELEASE_USAGE}`, { cause: err });
  }

  const [version, ...extra] = parsed.positionals;
  if (extra.length || !version || !SEMVER.test(version)) throw new Error(RELEASE_USAGE);

  return {
    version,
    dryRun: parsed.values['dry-run'] ?? false,
    noPublish: parsed.values['no-publish'] ?? false,
  };
}

// parseFrontmatter trims the body, so the blank line after the closing fence has
// to be put back explicitly — dprint requires it, and without it pinning the
// versionCode lands a release commit that fails CI's `dprint check`.
export const renderReleaseFile = (frontmatter, body) =>
  `---\n${frontmatter.trim()}\n---\n\n${body}\n`;

function readReleaseFile(version) {
  const file = join(ROOT, 'releases', `${version}.md`);
  if (!existsSync(file)) {
    fail(`Missing ${file}\nCreate the notes first (or run the cut-release skill), then re-run.`);
  }
  return parseOrFail(() => {
    const parsed = parseFrontmatter(readFileSync(file, 'utf8'));
    if (!parsed) throw new Error(`${file}: malformed frontmatter`);
    assertVersionMatchesFilename(`${version}.md`, parsed.meta.version);
    return { file, ...parsed };
  });
}

// The largest versionCode Google Play accepts. A pin above it, or one too long for
// Number to hold exactly, would write a different code into Gradle than the file pins.
const PLAY_MAX_VERSION_CODE = 2_100_000_000;

// Play rejects an upload whose versionCode does not move past the last one, and
// only after this script has tagged, pushed, and created the GitHub Release, so a
// bad pin fails here instead. A blank `androidVersionCode:` is unpinned. A pin
// equal to the Gradle code is a re-run of this version after an earlier cut or
// dry run already bumped Gradle to it.
export function chooseVersionCode({ pin, version, gradleCode, gradleVersionName }) {
  if (!Number.isInteger(gradleCode)) {
    throw new Error('android/app/build.gradle has no versionCode line');
  }
  if (!pin) return { versionCode: gradleCode + 1, pinned: false };
  const versionCode = Number(pin);
  if (!/^\d+$/.test(pin) || versionCode > PLAY_MAX_VERSION_CODE) {
    throw new Error(
      `${version}.md: androidVersionCode must be a whole number up to ` +
        `${PLAY_MAX_VERSION_CODE}, got "${pin}"`
    );
  }
  const rerun = versionCode === gradleCode && gradleVersionName === version;
  if (versionCode <= gradleCode && !rerun) {
    throw new Error(
      `${version}.md pins androidVersionCode ${versionCode}, which does not move past ` +
        `versionCode ${gradleCode} (versionName ${gradleVersionName}) in android/app/build.gradle`
    );
  }
  return { versionCode, pinned: true };
}

function resolveVersionCode(release, version) {
  const { versionCode, pinned } = parseOrFail(() => {
    const gradle = readAndroidVersion(readFileSync(join(ROOT, ANDROID_GRADLE_PATH), 'utf8'));
    return chooseVersionCode({
      pin: release.meta.androidVersionCode,
      version,
      gradleCode: gradle.versionCode,
      gradleVersionName: gradle.versionName,
    });
  });

  if (!pinned) {
    const frontmatter = /^androidVersionCode:/m.test(release.frontmatter)
      ? release.frontmatter.replace(
          /^androidVersionCode:.*$/m,
          `androidVersionCode: ${versionCode}`
        )
      : `${release.frontmatter}\nandroidVersionCode: ${versionCode}`;
    writeFileSync(release.file, renderReleaseFile(frontmatter, release.body));
    console.log(`Pinned androidVersionCode: ${versionCode} in ${version}.md`);
  }

  return versionCode;
}

function bumpVersions(version, versionCode) {
  setAndroidVersion(ROOT, version, versionCode);
  console.log(`Set Android versionName ${version} / versionCode ${versionCode}`);
  setIosVersion(ROOT, version, versionCode);
  console.log(`Set iOS MARKETING_VERSION ${version} / CURRENT_PROJECT_VERSION ${versionCode}`);
  run('pnpm', pnpmVersionArgs(version));
}

function generateReleaseNotes() {
  run('node', [join('tools', 'release', 'gen-release-notes.mjs')]);
}

function refuseStrayChanges(version) {
  const stray = parseOrFail(() =>
    findStrayReleasePaths(capture('git', GIT_STATUS_ARGS), releaseSetPaths(version, readReleases()))
  );
  if (stray.length) {
    fail(
      `\nWorking tree has changes outside the release set:\n` +
        stray.map((path) => `  ${path}`).join('\n') +
        '\n\nCommit, stash, or revert them before releasing — otherwise `git add -A`\n' +
        'would sweep them into the release commit.'
    );
  }
}

function refuseHandEditedVersionFiles(version, versionCode) {
  const read = (readFile) =>
    Object.fromEntries(VERSION_FILES.map((path) => [path, readFile(path)]));
  const edited = parseOrFail(() =>
    findHandEditedVersionFiles({
      version,
      versionCode,
      // --filters gives HEAD as this checkout would write it: under core.autocrlf
      // the working files hold CRLF that git itself reports as unchanged.
      head: read((path) => capture('git', ['cat-file', '--filters', `HEAD:${path}`])),
      working: read((path) => readFileSync(join(ROOT, path), 'utf8')),
    })
  );
  if (edited.length) {
    fail(
      `\nThese version files differ from HEAD by more than the version bump:\n` +
        edited.map((path) => `  ${path}`).join('\n') +
        '\n\nRevert that edit or commit it separately, then re-run: the release commit\n' +
        'carries the version bump and nothing else.'
    );
  }
}

function commitAndTag(version) {
  run('git', ['add', '-A']);
  run('git', ['commit', '-m', `release: v${version}`]);
  run('git', ['tag', `v${version}`]);
}

function publish(version, body) {
  run('git', ['push']);
  run('git', ['push', 'origin', `v${version}`]);

  const notesDir = mkdtempSync(join(tmpdir(), 'splotch-rel-'));
  const notesPath = join(notesDir, 'notes.md');
  writeFileSync(notesPath, body + '\n');

  // No artifacts are attached here, deliberately. The version this release just
  // bumped to has to be committed before an .aab/.ipa carrying it can be built,
  // so any artifact present now is necessarily from an older version — attaching
  // whatever sat in the build directory is how v1.4.0 shipped a 1.2.0 bundle.
  // `npm run release:publish` attaches them after the build skill, verifying each
  // one's embedded version against this release first (ADR-0077).
  run('gh', [
    'release',
    'create',
    `v${version}`,
    '--title',
    `v${version}`,
    '--notes-file',
    notesPath,
  ]);
  rmSync(notesDir, { recursive: true, force: true });

  console.log(
    `\n✓ Released v${version}: https://github.com/KyleMit/Splotch/releases/tag/v${version}`
  );
  console.log('\nNext: build the store artifacts for this version, then attach them:');
  console.log('  the build skill           (or npm run android:bundle / npm run ios:ipa)');
  console.log(`  npm run release:publish   attaches them to v${version}`);
}

export function main(args = process.argv.slice(2)) {
  const { version, dryRun, noPublish } = parseOrFail(() => parseReleaseArgs(args));
  const release = readReleaseFile(version);
  // --dry-run runs no git at all, so only a committing cut checks the tree here.
  if (!dryRun) refuseStrayChanges(version);
  const versionCode = resolveVersionCode(release, version);

  console.log(`\nReleasing v${version} (versionCode ${versionCode})\n`);
  bumpVersions(version, versionCode);
  generateReleaseNotes();

  if (dryRun) {
    console.log('\n--dry-run: files updated, no git actions taken.');
    return;
  }

  refuseStrayChanges(version);
  refuseHandEditedVersionFiles(version, versionCode);
  commitAndTag(version);

  if (noPublish) {
    console.log(`\n--no-publish: committed and tagged v${version} locally.`);
    console.log(`Push and publish when ready:`);
    console.log(`  git push && git push origin v${version}`);
    console.log(`  gh release create v${version} --title "v${version}" --notes-file <body>`);
    console.log(`Then build the artifacts and attach them with: npm run release:publish`);
    return;
  }

  publish(version, release.body);
}

if (isMain(import.meta.url)) main();
