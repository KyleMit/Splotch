// Cuts a release from releases/<version>.md (which must already exist — the
// /release slash command writes it). This is the deterministic, scriptable half
// of the workflow; the AI-drafting + review half lives in .claude/commands/release.md.
//
//   node scripts/release.mjs 1.2.0              full: bump, generate, commit, tag, push, GitHub release
//   node scripts/release.mjs 1.2.0 --no-publish bump, generate, commit, tag locally — no push, no gh
//   node scripts/release.mjs 1.2.0 --dry-run    bump + generate files only, no git at all
//
// Native version numbers are set with capacitor-set-version so Android and iOS
// stay in sync; package.json is the canonical semver source.
//
// Bump major/minor here for a real release. The package.json *patch* digit is
// web-irrelevant: the web build derives its patch from the commit count since
// this release's git tag (major.minor.<commits-since-tag>, ADR-0030), so the tag
// created below is what resets the web patch to 0. Native still ships the exact
// package.json version.

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT, fail, run, capture, parseFrontmatter } from './lib/utils.mjs';

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith('-'));
const dryRun = args.includes('--dry-run');
const noPublish = args.includes('--no-publish');

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  fail('Usage: node scripts/release.mjs <semver> [--no-publish] [--dry-run]\n  <semver> must look like 1.2.0');
}

const releaseFile = join(ROOT, 'releases', `${version}.md`);
if (!existsSync(releaseFile)) {
  fail(`Missing ${releaseFile}\nCreate the notes first (or run the /release command), then re-run.`);
}

// --- 1. resolve the Android versionCode ----------------------------------

const gradle = readFileSync(join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
const currentCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? 0);

// Reuse the code already pinned in the release file if present (idempotent
// re-runs); otherwise assign the next monotonic integer and pin it.
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

console.log(`\nReleasing v${version} (versionCode ${versionCode})\n`);

// --- 2. bump versions ----------------------------------------------------

// Native (Android always; iOS once the project has been added).
run('npx', ['capacitor-set-version', 'set:android', '-v', version, '-b', String(versionCode)]);
if (existsSync(join(ROOT, 'ios'))) {
  run('npx', ['capacitor-set-version', 'set:ios', '-v', version, '-b', String(versionCode)]);
} else {
  console.log('(no ios/ project yet — skipping iOS version bump)');
}

// Canonical semver lives in package.json.
run('npm', ['version', version, '--no-git-tag-version', '--allow-same-version']);

// --- 3. regenerate derived artifacts -------------------------------------

run('node', [join('scripts', 'generate-releases.mjs')]);

if (dryRun) {
  console.log('\n--dry-run: files updated, no git actions taken.');
  process.exit(0);
}

// --- 4. commit + tag -----------------------------------------------------

// Cleanliness guard: by this point everything dirty in the tree should be a
// file the release itself just rewrote (version bumps + generated artifacts).
// Anything else is a stray edit that `git add -A` would silently sweep into the
// release commit — abort so it can't ride along unnoticed.
const RELEASE_PATHS = [
  'package.json',
  'package-lock.json',
  'web/src/lib/releases.json',
  'android/',
  'ios/',
  'fastlane/',
  'releases/'
];
const isReleasePath = (p) =>
  RELEASE_PATHS.some((allowed) => (allowed.endsWith('/') ? p.startsWith(allowed) : p === allowed));

const stray = capture('git', ['status', '--porcelain'])
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => line.slice(3)) // strip the "XY " status columns
  .map((p) => (p.includes(' -> ') ? p.split(' -> ')[1] : p)) // rename: keep the new path
  .map((p) => p.replace(/^"(.*)"$/, '$1')) // unquote paths git escapes
  .filter((p) => !isReleasePath(p));

if (stray.length) {
  fail(
    `\nWorking tree has changes outside the release artifacts:\n` +
      stray.map((p) => `  ${p}`).join('\n') +
      '\n\nCommit, stash, or revert them before releasing — otherwise `git add -A`\n' +
      'would sweep them into the release commit.'
  );
}

run('git', ['add', '-A']);
run('git', ['commit', '-m', `release: v${version}`]);
run('git', ['tag', `v${version}`]);

if (noPublish) {
  console.log(`\n--no-publish: committed and tagged v${version} locally.`);
  console.log(`Push and publish when ready:`);
  console.log(`  git push && git push origin v${version}`);
  console.log(`  gh release create v${version} --title "v${version}" --notes-file <body>`);
  process.exit(0);
}

// --- 5. publish: push + GitHub release -----------------------------------

run('git', ['push']);
run('git', ['push', 'origin', `v${version}`]);

const notesDir = mkdtempSync(join(tmpdir(), 'splotch-rel-'));
const notesPath = join(notesDir, 'notes.md');
writeFileSync(notesPath, body + '\n');

const ghArgs = ['release', 'create', `v${version}`, '--title', `v${version}`, '--notes-file', notesPath];
const aab = join(ROOT, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
if (existsSync(aab)) {
  ghArgs.push(aab);
  console.log('Attaching built release bundle: app-release.aab');
} else {
  console.log('(no app-release.aab found — run `npm run android:bundle` first to attach it)');
}
run('gh', ghArgs);
rmSync(notesDir, { recursive: true, force: true });

console.log(`\n✓ Released v${version}: https://github.com/KyleMit/Splotch/releases/tag/v${version}`);
