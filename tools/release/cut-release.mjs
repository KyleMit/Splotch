// Cuts a release from releases/<version>.md (which must already exist — the
// release skill writes it). This is the deterministic, scriptable half
// of the workflow; the AI-drafting + review half lives in .claude/skills/release/SKILL.md.
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
import { parseArgs } from 'node:util';
import { ROOT, fail, run, capture, isMain, parseOrFail } from '../lib/proc.mjs';
import { parseFrontmatter, SEMVER } from './lib/release-frontmatter.mjs';
import { setAndroidVersion, setIosVersion } from './lib/native-version.mjs';

// No lockfile entry: pnpm-lock.yaml records dependency resolutions, not the root
// package's own version, so a version bump leaves it untouched and a dirty
// lockfile during a release is a stray change worth aborting on.
const RELEASE_PATHS = [
  'package.json',
  'web/src/lib/releases.json',
  'web/src/lib/components/settings/CurrentReleaseNotes.svelte',
  'web/src/lib/components/page/ReleaseHistory.svelte',
  'android/',
  'ios/',
  'fastlane/',
  'releases/',
];

const isReleasePath = (path) =>
  RELEASE_PATHS.some((allowed) =>
    allowed.endsWith('/') ? path.startsWith(allowed) : path === allowed
  );

export const findStrayReleasePaths = (status) =>
  status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3))
    .map((path) => (path.includes(' -> ') ? path.split(' -> ')[1] : path))
    .map((path) => path.replace(/^"(.*)"$/, '$1'))
    .filter((path) => !isReleasePath(path));

const RELEASE_USAGE =
  'Usage: node tools/release/cut-release.mjs <semver> [--no-publish] [--dry-run]\n  <semver> must look like 1.2.0';

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

function releasePath(version) {
  const file = join(ROOT, 'releases', `${version}.md`);
  if (!existsSync(file)) {
    fail(`Missing ${file}\nCreate the notes first (or run the release skill), then re-run.`);
  }
  return file;
}

function resolveVersionCode(releaseFile, version) {
  const gradle = readFileSync(join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
  const currentCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? 0);
  const parsed = parseFrontmatter(readFileSync(releaseFile, 'utf8'));
  if (!parsed) fail(`${releaseFile}: malformed frontmatter`);
  let { frontmatter, body } = parsed;
  const pinned = Number(parsed.meta.androidVersionCode);
  const versionCode = Number.isInteger(pinned) ? pinned : currentCode + 1;

  if (!Number.isInteger(pinned)) {
    frontmatter = /androidVersionCode:/.test(frontmatter)
      ? frontmatter.replace(/androidVersionCode:.*/i, `androidVersionCode: ${versionCode}`)
      : `${frontmatter}\nandroidVersionCode: ${versionCode}`;
    writeFileSync(releaseFile, renderReleaseFile(frontmatter, body));
    console.log(`Pinned androidVersionCode: ${versionCode} in ${version}.md`);
  }

  return { body, versionCode };
}

function bumpVersions(version, versionCode) {
  setAndroidVersion(ROOT, version, versionCode);
  console.log(`Set Android versionName ${version} / versionCode ${versionCode}`);
  if (existsSync(join(ROOT, 'ios'))) {
    setIosVersion(ROOT, version, versionCode);
    console.log(`Set iOS MARKETING_VERSION ${version} / CURRENT_PROJECT_VERSION ${versionCode}`);
  } else {
    console.log('(no ios/ project yet — skipping iOS version bump)');
  }
  // pnpm, not npm: `npm version` syncs the lockfile it expects to find, which
  // would author a competing package-lock.json alongside pnpm-lock.yaml.
  run('pnpm', ['version', version, '--no-git-tag-version', '--allow-same-version']);
}

function generateArtifacts() {
  run('node', [join('tools', 'release', 'gen-release-notes.mjs')]);
}

function assertOnlyReleasePaths() {
  const stray = findStrayReleasePaths(capture('git', ['status', '--porcelain']));
  if (stray.length) {
    fail(
      `\nWorking tree has changes outside the release artifacts:\n` +
        stray.map((path) => `  ${path}`).join('\n') +
        '\n\nCommit, stash, or revert them before releasing — otherwise `git add -A`\n' +
        'would sweep them into the release commit.'
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
  const { body, versionCode } = resolveVersionCode(releasePath(version), version);

  console.log(`\nReleasing v${version} (versionCode ${versionCode})\n`);
  bumpVersions(version, versionCode);
  generateArtifacts();

  if (dryRun) {
    console.log('\n--dry-run: files updated, no git actions taken.');
    return;
  }

  assertOnlyReleasePaths();
  commitAndTag(version);

  if (noPublish) {
    console.log(`\n--no-publish: committed and tagged v${version} locally.`);
    console.log(`Push and publish when ready:`);
    console.log(`  git push && git push origin v${version}`);
    console.log(`  gh release create v${version} --title "v${version}" --notes-file <body>`);
    console.log(`Then build the artifacts and attach them with: npm run release:publish`);
    return;
  }

  publish(version, body);
}

if (isMain(import.meta.url)) main();
