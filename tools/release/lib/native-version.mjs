// Reads and bumps the native app version numbers directly in the Android and iOS
// project files — the two edits the release script used to shell out to the
// archived `capacitor-set-version` package for (issue #332):
//
//   Android (android/app/build.gradle, Groovy):
//     versionName "<x.y.z>"   and   versionCode <n>
//   iOS (ios/App/App.xcodeproj/project.pbxproj, modern managed versions):
//     MARKETING_VERSION = <x.y.z>;   and   CURRENT_PROJECT_VERSION = <n>;
//
// The transforms are line-based and fail closed: only whole lines matching the
// strict assignment shapes above are rewritten (preserving indentation), and
// any other line that so much as mentions a version token — a comment, a
// `versionNameSuffix`, a compact pbxproj dictionary — throws instead of being
// silently rewritten or skipped. Android requires exactly one of each
// assignment; iOS rewrites every build configuration (Debug + Release).
// readAndroidVersion() reads through the same rules, so it accepts exactly the
// Gradle files bumpAndroidGradle() can rewrite.
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

// Each pattern captures the indentation, then the value.
const ANDROID_VERSION_NAME = {
  token: 'versionName',
  pattern: /^(\s*)versionName\s+"([^"]*)"\s*$/,
  render: (indent, version) => `${indent}versionName "${version}"`,
  exactlyOne: true,
  path: ANDROID_GRADLE_PATH,
};
const ANDROID_VERSION_CODE = {
  token: 'versionCode',
  pattern: /^(\s*)versionCode\s+(\d+)\s*$/,
  render: (indent, versionCode) => `${indent}versionCode ${versionCode}`,
  exactlyOne: true,
  path: ANDROID_GRADLE_PATH,
};
const IOS_MARKETING_VERSION = {
  token: 'MARKETING_VERSION',
  pattern: /^(\s*)MARKETING_VERSION = ([^;]+);\s*$/,
  render: (indent, version) => `${indent}MARKETING_VERSION = ${version};`,
  exactlyOne: false,
  path: IOS_PBXPROJ_PATH,
};
const IOS_CURRENT_PROJECT_VERSION = {
  token: 'CURRENT_PROJECT_VERSION',
  pattern: /^(\s*)CURRENT_PROJECT_VERSION = (\d+);\s*$/,
  render: (indent, versionCode) => `${indent}CURRENT_PROJECT_VERSION = ${versionCode};`,
  exactlyOne: false,
  path: IOS_PBXPROJ_PATH,
};

function findAssignments(lines, { token, pattern, exactlyOne, path }) {
  const assignments = [];
  lines.forEach((line, index) => {
    const match = line.match(pattern);
    if (match) {
      assignments.push({ index, indent: match[1], value: match[2] });
    } else if (line.includes(token)) {
      throw new Error(
        `Unrecognized line mentioning "${token}" in ${path}: ${line.trim()} — ` +
          `normalize the line or update tools/release/lib/native-version.mjs`
      );
    }
  });
  if (assignments.length === 0) {
    throw new Error(`Could not find "${token}" in ${path}`);
  }
  if (exactlyOne && assignments.length > 1) {
    throw new Error(`Expected exactly one "${token}" in ${path}, found ${assignments.length}`);
  }
  return assignments;
}

function bumpLines(lines, rule, value) {
  const out = [...lines];
  for (const { index, indent } of findAssignments(lines, rule)) {
    out[index] = rule.render(indent, value);
  }
  return out;
}

export function readAndroidVersion(source) {
  const lines = source.split('\n');
  const [versionName] = findAssignments(lines, ANDROID_VERSION_NAME);
  const [versionCode] = findAssignments(lines, ANDROID_VERSION_CODE);
  return { versionName: versionName.value, versionCode: Number(versionCode.value) };
}

export function bumpAndroidGradle(source, version, versionCode) {
  let lines = source.split('\n');
  lines = bumpLines(lines, ANDROID_VERSION_NAME, version);
  lines = bumpLines(lines, ANDROID_VERSION_CODE, versionCode);
  return lines.join('\n');
}

export function bumpIosPbxproj(source, version, versionCode) {
  let lines = source.split('\n');
  lines = bumpLines(lines, IOS_MARKETING_VERSION, version);
  lines = bumpLines(lines, IOS_CURRENT_PROJECT_VERSION, versionCode);
  return lines.join('\n');
}

export function setAndroidVersion(root, version, versionCode) {
  const path = join(root, ANDROID_GRADLE_PATH);
  writeFileSync(path, bumpAndroidGradle(readFileSync(path, 'utf8'), version, versionCode), 'utf8');
}

export function setIosVersion(root, version, versionCode) {
  const path = join(root, IOS_PBXPROJ_PATH);
  writeFileSync(path, bumpIosPbxproj(readFileSync(path, 'utf8'), version, versionCode), 'utf8');
}
