// Bumps the native app version numbers directly in the Android and iOS project
// files — the two edits the release script used to shell out to the archived
// `capacitor-set-version` package for (issue #332). The regexes mirror that
// package's exactly so the produced diffs are byte-identical to before:
//
//   Android (android/app/build.gradle, Groovy):
//     versionName "<x.y.z>"   and   versionCode <n>
//   iOS (ios/App/App.xcodeproj/project.pbxproj, modern managed versions):
//     MARKETING_VERSION = <x.y.z>;   and   CURRENT_PROJECT_VERSION = <n>;
//
// Only the modern (non-legacy) iOS layout is handled: this project's Info.plist
// resolves CFBundleShortVersionString from $(MARKETING_VERSION), so the values
// live in project.pbxproj — no plist rewrite (and no `plist` dependency) needed.
//
// The pure string transforms are exported alongside the file wrappers so they
// can be exercised without touching the real project files.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ANDROID_GRADLE_PATH = join('android', 'app', 'build.gradle');
export const IOS_PBXPROJ_PATH = join('ios', 'App', 'App.xcodeproj', 'project.pbxproj');

// Groovy build.gradle: rewrite the whole `versionName`/`versionCode` lines.
// `.*` (no newline match) keeps each line's leading indentation and replaces
// only its value, and the /g flag updates every occurrence — matching the
// upstream behaviour on files that carry the pair once.
export function bumpAndroidGradle(source, version, versionCode) {
  if (!/versionName.*/.test(source)) {
    throw new Error(`Could not find "versionName" in ${ANDROID_GRADLE_PATH}`);
  }
  if (!/versionCode.*/.test(source)) {
    throw new Error(`Could not find "versionCode" in ${ANDROID_GRADLE_PATH}`);
  }
  return source
    .replace(/versionName.*/g, `versionName "${version}"`)
    .replace(/versionCode.*/g, `versionCode ${versionCode}`);
}

// Modern Xcode pbxproj: the version/build appear once per build config (Debug +
// Release), so the /g flag rewrites both. The trailing `;` is part of the
// pbxproj assignment syntax.
export function bumpIosPbxproj(source, version, versionCode) {
  if (!/MARKETING_VERSION = .*/.test(source)) {
    throw new Error(`Could not find "MARKETING_VERSION" in ${IOS_PBXPROJ_PATH}`);
  }
  if (!/CURRENT_PROJECT_VERSION = .*/.test(source)) {
    throw new Error(`Could not find "CURRENT_PROJECT_VERSION" in ${IOS_PBXPROJ_PATH}`);
  }
  return source
    .replace(/(MARKETING_VERSION = ).*/g, `MARKETING_VERSION = ${version};`)
    .replace(/(CURRENT_PROJECT_VERSION = ).*/g, `CURRENT_PROJECT_VERSION = ${versionCode};`);
}

export function setAndroidVersion(root, version, versionCode) {
  const path = join(root, ANDROID_GRADLE_PATH);
  writeFileSync(path, bumpAndroidGradle(readFileSync(path, 'utf8'), version, versionCode), 'utf8');
}

export function setIosVersion(root, version, versionCode) {
  const path = join(root, IOS_PBXPROJ_PATH);
  writeFileSync(path, bumpIosPbxproj(readFileSync(path, 'utf8'), version, versionCode), 'utf8');
}
