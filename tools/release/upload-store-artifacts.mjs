// Uploads a built, version-verified store artifact through the Fastlane lanes
// in fastlane/Fastfile (issue 241).
//
//   node tools/release/upload-store-artifacts.mjs --only=android|ios [--dry-run]
//
// The store upload is phase 4 of shipping, after publish-release-artifacts.mjs
// (ADR-0077): the same embedded-version check runs here first, so a stale
// bundle is refused before Fastlane ever starts. Credentials are read from the
// environment only and never from the repo.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, fail, hasCommand, isMain, parseOrFail, run } from '../lib/proc.mjs';
import { parseFrontmatter } from './lib/release-frontmatter.mjs';
import { inspectArtifacts } from './publish-release-artifacts.mjs';

export const STORE_CREDENTIAL_ENV = {
  android: ['SPLOTCH_PLAY_JSON_KEY'],
  ios: ['SPLOTCH_ASC_KEY_ID', 'SPLOTCH_ASC_ISSUER_ID', 'SPLOTCH_ASC_KEY_PATH'],
};

const UPLOAD_USAGE =
  'Usage: node tools/release/upload-store-artifacts.mjs --only=android|ios [--dry-run]';

export function parseUploadArgs(args) {
  const parsed = parseArgs({
    args,
    options: { only: { type: 'string' }, 'dry-run': { type: 'boolean' } },
  });
  const platform = parsed.values.only;
  if (!Object.hasOwn(STORE_CREDENTIAL_ENV, platform ?? '')) throw new Error(UPLOAD_USAGE);
  return { platform, dryRun: parsed.values['dry-run'] ?? false };
}

export function missingCredentials(platform, env = process.env) {
  return STORE_CREDENTIAL_ENV[platform].filter((name) => !env[name]);
}

function readExpected() {
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const file = join(ROOT, 'releases', `${version}.md`);
  if (!existsSync(file)) fail(`Missing ${file} — cut the release first.`);
  const versionCode = Number(parseFrontmatter(readFileSync(file, 'utf8'))?.meta.androidVersionCode);
  return { version, versionCode: Number.isInteger(versionCode) ? versionCode : null };
}

export function main(args = process.argv.slice(2)) {
  const { platform, dryRun } = parseOrFail(() => parseUploadArgs(args));
  const expected = readExpected();
  const { matched, stale, missing } = inspectArtifacts(expected, [platform]);
  if (stale.length)
    fail(`Refusing to upload a stale ${platform} artifact:\n  ${stale[0].problems.join('\n  ')}`);
  if (missing.length) fail(`No ${platform} artifact built — run ${missing[0].rebuild} first.`);
  console.log(
    `  ✓ ${matched[0].label}: ${matched[0].actual.versionName} (${matched[0].actual.versionCode})`
  );

  const absent = missingCredentials(platform);
  if (absent.length) {
    fail(
      `Missing store credentials in the environment: ${absent.join(', ')}\nSee docs/MOBILE/native.md §7 for where each one comes from.`
    );
  }
  if (!hasCommand('bundle'))
    fail('Bundler is not installed — `gem install bundler && bundle install` first.');

  // run() inherits process.env; the lane reads the dry-run switch from it.
  process.env.SPLOTCH_STORE_DRY_RUN = dryRun ? 'true' : 'false';
  run('bundle', ['exec', 'fastlane', platform, 'upload']);
}

if (isMain(import.meta.url)) main();
