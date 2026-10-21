// Builds the React Native app's release artifacts, the build skill's phase 2 (ADR-0077).
//
//   node tools/release/build-native-release.mjs bundle    store .aab, signed with the upload key
//   node tools/release/build-native-release.mjs apk       Release-optimized .dev .apk to install
//   node tools/release/build-native-release.mjs archive   store .xcarchive, signed with the team
//   node tools/release/build-native-release.mjs ipa       store archive, then its App Store export
//
// Store identity is opt-in. Gradle's splotch.store property and ios/Store.xcconfig are the only
// switches to art.splotch.app, and the store targets here are their only callers, so the .apk
// stays art.splotch.app.dev and installs beside the store copy for testing or device performance.
// Each target first deletes what it writes, so a failed build cannot leave an older version's
// file where the publish step looks for this one.

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, isMain, run } from '../lib/proc.mjs';
import {
  ANDROID_PROJECT_DIR,
  DEV_APP_ID,
  IOS_PROJECT_DIR,
  IOS_PROJECT_NAME,
  RELEASE_AAB,
  RELEASE_APK,
  RELEASE_ARCHIVE,
  RELEASE_IPA,
  RELEASE_IPA_DIR,
  STORE_APP_ID,
} from './lib/native-app.mjs';

export const STORE_GRADLE_PROPERTY = '-Psplotch.store=true';
export const STORE_XCCONFIG = 'Store.xcconfig';

const gradle = (...tasks) => ({
  cmd: join(ROOT, ANDROID_PROJECT_DIR, 'gradlew'),
  args: tasks,
  cwd: join(ROOT, ANDROID_PROJECT_DIR),
});

const verifyBundleSignature = {
  cmd: process.execPath,
  args: [
    join(ROOT, 'tools', 'mobile', 'android', 'verify-release-bundle.mjs'),
    join(ROOT, RELEASE_AAB),
  ],
  cwd: ROOT,
};

const ios = (cmd, ...args) => ({ cmd, args, cwd: join(ROOT, IOS_PROJECT_DIR) });

// Pods/ is not committed; Podfile.lock pins what this installs.
const podInstall = ios('pod', 'install');

const storeArchive = ios(
  'xcodebuild',
  '-workspace',
  `${IOS_PROJECT_NAME}.xcworkspace`,
  '-scheme',
  IOS_PROJECT_NAME,
  '-configuration',
  'Release',
  '-destination',
  'generic/platform=iOS',
  '-archivePath',
  join(ROOT, RELEASE_ARCHIVE),
  '-xcconfig',
  STORE_XCCONFIG,
  '-allowProvisioningUpdates',
  'archive'
);

const appStoreExport = ios(
  'xcodebuild',
  '-exportArchive',
  '-archivePath',
  join(ROOT, RELEASE_ARCHIVE),
  '-exportOptionsPlist',
  'ExportOptions.plist',
  '-exportPath',
  join(ROOT, RELEASE_IPA_DIR),
  '-allowProvisioningUpdates'
);

export const TARGETS = {
  bundle: {
    appId: STORE_APP_ID,
    artifact: RELEASE_AAB,
    outputs: [RELEASE_AAB],
    steps: [gradle(STORE_GRADLE_PROPERTY, ':app:bundleRelease'), verifyBundleSignature],
  },
  apk: {
    appId: DEV_APP_ID,
    artifact: RELEASE_APK,
    outputs: [RELEASE_APK],
    steps: [gradle(':app:assembleRelease')],
  },
  archive: {
    appId: STORE_APP_ID,
    artifact: RELEASE_ARCHIVE,
    outputs: [RELEASE_ARCHIVE],
    steps: [podInstall, storeArchive],
  },
  ipa: {
    appId: STORE_APP_ID,
    artifact: RELEASE_IPA,
    outputs: [RELEASE_ARCHIVE, RELEASE_IPA_DIR],
    steps: [podInstall, storeArchive, appStoreExport],
  },
};

const USAGE = `Usage: node tools/release/build-native-release.mjs <${Object.keys(TARGETS).join('|')}>`;

export function main(args = process.argv.slice(2)) {
  const [name, ...extra] = args;
  if (!Object.hasOwn(TARGETS, name ?? '') || extra.length) fail(USAGE);
  const target = TARGETS[name];
  for (const output of target.outputs) rmSync(join(ROOT, output), { recursive: true, force: true });
  for (const { cmd, args: stepArgs, cwd } of target.steps) run(cmd, stepArgs, { cwd });
  console.log(`\nBuilt ${target.appId}: ${target.artifact}`);
}

if (isMain(import.meta.url)) main();
