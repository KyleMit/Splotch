// Cuts a release from releases/<version>.md (which must already exist — the
// /release slash command writes it). This is the deterministic, scriptable half
// of the workflow; the AI-drafting + review half lives in .claude/skills/release/SKILL.md.
//
//   node scripts/release.mjs 1.2.0              full: bump, generate, commit, tag, push, GitHub release
//   node scripts/release.mjs 1.2.0 --no-publish bump, generate, commit, tag locally — no push, no gh
//   node scripts/release.mjs 1.2.0 --dry-run    bump + generate files only, no git at all
//
// Native version numbers are set directly in the Android/iOS project files by
// scripts/lib/native-version.mjs so the two stay in sync; package.json is the
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
import { ROOT, fail, run, capture, isMain, parseFrontmatter } from './lib/utils.mjs';
import { RELEASE_AAB } from './lib/android.mjs';
import { setAndroidVersion, setIosVersion } from './lib/native-version.mjs';

const RELEASE_PATHS = [
  'package.json',
  'package-lock.json',
  'web/src/lib/releases.json',
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

function parseReleaseArgs(args) {
  const version = args.find((arg) => !arg.startsWith('-'));
  if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    fail(
      'Usage: node scripts/release.mjs <semver> [--no-publish] [--dry-run]\n  <semver> must look like 1.2.0'
    );
  }
  return {
    version,
    dryRun: args.includes('--dry-run'),
    noPublish: args.includes('--no-publish'),
  };
}

function releasePath(version) {
  const file = join(ROOT, 'releases', `${version}.md`);
  if (!existsSync(file)) {
    fail(`Missing ${file}\nCreate the notes first (or run the /release command), then re-run.`);
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
    writeFileSync(releaseFile, `---\n${frontmatter.trim()}\n---\n${body}\n`);
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
  run('npm', ['version', version, '--no-git-tag-version', '--allow-same-version']);
}

function generateArtifacts() {
  run('node', [join('scripts', 'generate-releases.mjs')]);
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

  const ghArgs = [
    'release',
    'create',
    `v${version}`,
    '--title',
    `v${version}`,
    '--notes-file',
    notesPath,
  ];
  if (existsSync(RELEASE_AAB)) {
    ghArgs.push(RELEASE_AAB);
    console.log('Attaching built release bundle: app-release.aab');
  } else {
    console.log('(no app-release.aab found — run `npm run android:bundle` first to attach it)');
  }
  run('gh', ghArgs);
  rmSync(notesDir, { recursive: true, force: true });

  console.log(
    `\n✓ Released v${version}: https://github.com/KyleMit/Splotch/releases/tag/v${version}`
  );
}

export function main(args = process.argv.slice(2)) {
  const { version, dryRun, noPublish } = parseReleaseArgs(args);
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
    return;
  }

  publish(version, body);
}

if (isMain(import.meta.url)) main();
