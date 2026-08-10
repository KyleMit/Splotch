// Bumps the native app version numbers directly in the Android and iOS project
// files — the two edits the release script used to shell out to the archived
// `capacitor-set-version` package for (issue #332):
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

function bumpLines(lines, { token, pattern, render, exactlyOne, path }) {
  const matched = new Set();
  const out = lines.map((line, i) => {
    const m = line.match(pattern);
    if (!m) return line;
    matched.add(i);
    return render(m[1]);
  });
  lines.forEach((line, i) => {
    if (line.includes(token) && !matched.has(i)) {
      throw new Error(
        `Unrecognized line mentioning "${token}" in ${path}: ${line.trim()} — ` +
          `normalize the line or update tools/release/lib/native-version.mjs`
      );
    }
  });
  if (matched.size === 0) {
    throw new Error(`Could not find "${token}" in ${path}`);
  }
  if (exactlyOne && matched.size > 1) {
    throw new Error(`Expected exactly one "${token}" in ${path}, found ${matched.size}`);
  }
  return out;
}

export function bumpAndroidGradle(source, version, versionCode) {
  let lines = source.split('\n');
  lines = bumpLines(lines, {
    token: 'versionName',
    pattern: /^(\s*)versionName\s+"[^"]*"\s*$/,
    render: (indent) => `${indent}versionName "${version}"`,
    exactlyOne: true,
    path: ANDROID_GRADLE_PATH,
  });
  lines = bumpLines(lines, {
    token: 'versionCode',
    pattern: /^(\s*)versionCode\s+\d+\s*$/,
    render: (indent) => `${indent}versionCode ${versionCode}`,
    exactlyOne: true,
    path: ANDROID_GRADLE_PATH,
  });
  return lines.join('\n');
}

export function bumpIosPbxproj(source, version, versionCode) {
  let lines = source.split('\n');
  lines = bumpLines(lines, {
    token: 'MARKETING_VERSION',
    pattern: /^(\s*)MARKETING_VERSION = [^;]+;\s*$/,
    render: (indent) => `${indent}MARKETING_VERSION = ${version};`,
    exactlyOne: false,
    path: IOS_PBXPROJ_PATH,
  });
  lines = bumpLines(lines, {
    token: 'CURRENT_PROJECT_VERSION',
    pattern: /^(\s*)CURRENT_PROJECT_VERSION = \d+;\s*$/,
    render: (indent) => `${indent}CURRENT_PROJECT_VERSION = ${versionCode};`,
    exactlyOne: false,
    path: IOS_PBXPROJ_PATH,
  });
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
