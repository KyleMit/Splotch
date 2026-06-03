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

import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith('-'));
const dryRun = args.includes('--dry-run');
const noPublish = args.includes('--no-publish');

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('Usage: node scripts/release.mjs <semver> [--no-publish] [--dry-run]');
  console.error('  <semver> must look like 1.2.0');
  process.exit(1);
}

const releaseFile = join(ROOT, 'releases', `${version}.md`);
if (!existsSync(releaseFile)) {
  console.error(`Missing ${releaseFile}`);
  console.error(`Create the notes first (or run the /release command), then re-run.`);
  process.exit(1);
}

// npm/npx/gh are .cmd shims on Windows, so we go through the shell — which means
// quoting any argument that contains whitespace (e.g. the commit message).
function run(cmd, cmdArgs) {
  const full = [cmd, ...cmdArgs.map((a) => (/\s/.test(a) ? `"${a}"` : a))].join(' ');
  console.log(`$ ${full}`);
  return execSync(full, { cwd: ROOT, stdio: 'inherit' });
}

// --- 1. resolve the Android versionCode ----------------------------------

const gradlePath = join(ROOT, 'android', 'app', 'build.gradle');
const gradle = readFileSync(gradlePath, 'utf8');
const currentCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? 0);

// Reuse the code already pinned in the release file if present (idempotent
// re-runs); otherwise assign the next monotonic integer and pin it.
const raw = readFileSync(releaseFile, 'utf8');
const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
if (!fm) {
  console.error(`${releaseFile}: malformed frontmatter`);
  process.exit(1);
}
let frontmatter = fm[1];
const body = fm[2].trim();
const pinned = Number(frontmatter.match(/androidVersionCode:\s*(\d+)/)?.[1]);
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

const notesPath = join(mkdtempSync(join(tmpdir(), 'splotch-rel-')), 'notes.md');
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

console.log(`\n✓ Released v${version}: https://github.com/KyleMit/Splotch/releases/tag/v${version}`);
