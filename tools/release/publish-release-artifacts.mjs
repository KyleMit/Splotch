// Uploads the built store artifacts to the GitHub Release for a version.
//
//   node tools/release/publish-release-artifacts.mjs                 publish package.json's version
//   node tools/release/publish-release-artifacts.mjs 1.4.0           publish a specific version
//   node tools/release/publish-release-artifacts.mjs --only=android  just the .aab (or ios for just the .ipa)
//   node tools/release/publish-release-artifacts.mjs --dry-run       verify versions, upload nothing
//
// This is deliberately a third step rather than part of cut-release.mjs. A release
// has to bump the version and tag it *before* an artifact carrying that version
// can be built, so at no point during `npm run release` does a correct .aab
// exist. cut-release.mjs used to attach whatever sat in the build output directory,
// which put a 1.2.0 bundle on the v1.4.0 release. See ADR-0077.
//
// Every artifact is verified against the release it is being attached to by
// reading the version out of the binary itself — a stale build is refused, not
// uploaded.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { ROOT, fail, run, isMain, parseOrFail } from '../lib/proc.mjs';
import { parseFrontmatter, SEMVER } from './lib/release-frontmatter.mjs';
import { RELEASE_AAB } from '../mobile/android/lib/android-toolchain.mjs';
import { RELEASE_IPA } from '../mobile/ios/open-release-artifacts.mjs';
import { readAabVersion, readIpaVersion } from './lib/artifact-version.mjs';

const PLATFORMS = ['android', 'ios'];

const ARTIFACTS = {
  android: {
    label: 'Android bundle',
    path: RELEASE_AAB,
    read: readAabVersion,
    rebuild: 'npm run android:bundle',
  },
  ios: { label: 'iOS app', path: RELEASE_IPA, read: readIpaVersion, rebuild: 'npm run ios:ipa' },
};

const PUBLISH_USAGE =
  'Usage: node tools/release/publish-release-artifacts.mjs [semver] [--only=android|ios] [--dry-run]';

// Strict parsing is the safety here: a mistyped --dry-run must not fall through
// to a real upload, so an unknown flag is rejected rather than ignored. Throws
// instead of exiting so tests can observe the rejection; main() turns the throw
// into the usual one-line exit.
export function parsePublishArgs(args) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: { only: { type: 'string' }, 'dry-run': { type: 'boolean' } },
    });
  } catch (err) {
    throw new Error(`${err.message}\n${PUBLISH_USAGE}`, { cause: err });
  }

  const [version, ...extra] = parsed.positionals;
  if (extra.length) {
    throw new Error(`Unexpected argument: ${extra[0]}\n${PUBLISH_USAGE}`);
  }
  if (version && !SEMVER.test(version)) {
    throw new Error(`Not a version: ${version}\n${PUBLISH_USAGE}`);
  }

  // Tested against undefined rather than falsiness: `--only=` parses as the
  // empty string, and a truthiness check would let it through as "no filter",
  // widening a scoped publish back to every platform.
  const only = parsed.values.only;
  if (only !== undefined && !PLATFORMS.includes(only)) {
    throw new Error(`--only must be one of: ${PLATFORMS.join(', ')}`);
  }

  return { version, only, dryRun: parsed.values['dry-run'] ?? false };
}

// Pure so the mismatch rules are testable without building a real bundle.
export function compareArtifactVersion(expected, actual) {
  const problems = [];
  if (actual.versionName !== expected.version) {
    problems.push(`versionName is ${actual.versionName}, expected ${expected.version}`);
  }
  if (
    expected.versionCode != null &&
    actual.versionCode != null &&
    String(actual.versionCode) !== String(expected.versionCode)
  ) {
    problems.push(`versionCode is ${actual.versionCode}, expected ${expected.versionCode}`);
  }
  return problems;
}

function resolveVersion(explicit) {
  if (explicit) return explicit;
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
}

function readExpected(version) {
  const file = join(ROOT, 'releases', `${version}.md`);
  if (!existsSync(file)) {
    fail(
      `Missing ${file}\nThere is no release notes file for ${version} — run the cut-release skill first.`
    );
  }
  const parsed = parseFrontmatter(readFileSync(file, 'utf8'));
  if (!parsed) fail(`${file}: malformed frontmatter`);
  const versionCode = Number(parsed.meta.androidVersionCode);
  return { version, versionCode: Number.isInteger(versionCode) ? versionCode : null };
}

function assertReleaseExists(version) {
  const probe = spawnSync('gh', ['release', 'view', `v${version}`, '--json', 'tagName'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (probe.status !== 0) {
    fail(
      `No GitHub Release found for v${version}.\n` +
        `Cut the release first (the cut-release skill), then build, then publish.\n${probe.stderr ?? ''}`
    );
  }
}

// Reads each selected artifact's real version and sorts it into built / stale /
// missing. Nothing uploads until every present artifact has been accounted for.
export function inspectArtifacts(expected, platforms) {
  const matched = [];
  const stale = [];
  const missing = [];

  for (const platform of platforms) {
    const artifact = ARTIFACTS[platform];
    if (!existsSync(artifact.path)) {
      missing.push({ platform, ...artifact });
      continue;
    }
    let actual;
    try {
      actual = artifact.read(artifact.path);
    } catch (error) {
      stale.push({ platform, ...artifact, problems: [`unreadable: ${error.message}`] });
      continue;
    }
    const problems = compareArtifactVersion(expected, actual);
    if (problems.length) stale.push({ platform, ...artifact, actual, problems });
    else matched.push({ platform, ...artifact, actual });
  }

  return { matched, stale, missing };
}

export function main(args = process.argv.slice(2)) {
  const { version: explicit, only, dryRun } = parseOrFail(() => parsePublishArgs(args));
  const version = resolveVersion(explicit);
  const expected = readExpected(version);
  const platforms = only ? [only] : PLATFORMS;

  console.log(
    `\nPublishing artifacts for v${version}` +
      (expected.versionCode == null ? '' : ` (versionCode ${expected.versionCode})`) +
      '\n'
  );

  assertReleaseExists(version);
  const { matched, stale, missing } = inspectArtifacts(expected, platforms);

  for (const artifact of matched) {
    console.log(
      `  ✓ ${artifact.label}: ${artifact.actual.versionName} (${artifact.actual.versionCode})`
    );
  }
  for (const artifact of missing) {
    console.log(`  – ${artifact.label}: not built (${artifact.rebuild})`);
  }

  if (stale.length) {
    fail(
      '\nRefusing to upload — these artifacts do not match the release:\n' +
        stale
          .map(
            (a) => `  ✗ ${a.label} (${a.path})\n${a.problems.map((p) => `      ${p}`).join('\n')}`
          )
          .join('\n') +
        '\n\nThey are leftovers from an earlier version. Rebuild them for this release\n' +
        stale.map((a) => `  ${a.rebuild}`).join('\n') +
        '\nor delete the stale file, then re-run. Nothing was uploaded.'
    );
  }

  if (!matched.length) {
    fail(
      `\nNothing to publish — no artifacts built for ${version}.\n` +
        `Run the build skill (or ${missing.map((a) => a.rebuild).join(' / ')}) first.`
    );
  }

  if (dryRun) {
    console.log('\n--dry-run: versions verified, nothing uploaded.');
    return;
  }

  // --clobber so re-publishing after a rebuild replaces the asset in place.
  run('gh', ['release', 'upload', `v${version}`, ...matched.map((a) => a.path), '--clobber']);

  console.log(
    `\n✓ Published ${matched.length} artifact(s) to https://github.com/KyleMit/Splotch/releases/tag/v${version}`
  );
}

if (isMain(import.meta.url)) main();
