import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readReleases } from '../gen-release-notes.mjs';
import {
  ANDROID_GRADLE_PATH,
  bumpAndroidGradle,
  bumpIosPbxproj,
  IOS_PBXPROJ_PATH,
  readAndroidVersion,
} from '../lib/native-version.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const { version: packageVersion } = JSON.parse(
  readFileSync(join(repoRoot, 'package.json'), 'utf8')
);
const realGradle = readFileSync(join(repoRoot, ANDROID_GRADLE_PATH), 'utf8');
const realPbxproj = readFileSync(join(repoRoot, IOS_PBXPROJ_PATH), 'utf8');

// The newest release document is what the generator ships as the current notes,
// so a committed draft of the next release would ship its What's New and store
// notes while every version file still names the previous release.
it('keeps the committed package, native, and newest release versions in agreement', () => {
  const android = readAndroidVersion(realGradle);
  const [newest] = readReleases();

  expect(android.versionName).toBe(packageVersion);
  expect(bumpAndroidGradle(realGradle, packageVersion, android.versionCode)).toBe(realGradle);
  expect(bumpIosPbxproj(realPbxproj, packageVersion, android.versionCode)).toBe(realPbxproj);
  expect(newest.meta.version).toBe(packageVersion);
  expect(Number(newest.meta.androidVersionCode)).toBe(android.versionCode);
});

// The shapes the bump refuses to rewrite. The reader refuses the same ones, so a cut
// never chooses its versionCode from a line the bump would then reject or miss.
const REFUSED_GRADLE_SHAPES = [
  [
    'a versionNameSuffix line',
    realGradle.replace(/^(\s*)versionName "[^"]*"$/m, '$&\n$1versionNameSuffix ".debug"'),
    /Unrecognized line mentioning "versionName" .*versionNameSuffix/,
  ],
  [
    'an inline comment on the version assignment line',
    realGradle.replace(/^(\s*versionName "[^"]*")$/m, '$1 // keep in sync with package.json'),
    /Unrecognized line mentioning "versionName"/,
  ],
  [
    'a comment mentioning versionCode',
    `${realGradle}\n// bump versionCode before release\n`,
    /Unrecognized line mentioning "versionCode"/,
  ],
  [
    'a duplicate versionName assignment',
    `${realGradle}\nversionName "2.0.0"\n`,
    /Expected exactly one "versionName" in android\/app\/build\.gradle, found 2/,
  ],
  [
    'a missing versionName',
    realGradle.replace(/^\s*versionName "[^"]*"\n/m, ''),
    /Could not find "versionName"/,
  ],
  [
    'a missing versionCode',
    realGradle.replace(/^\s*versionCode \d+\n/m, ''),
    /Could not find "versionCode"/,
  ],
];

describe.each([
  ['bumpAndroidGradle', (source) => bumpAndroidGradle(source, '1.0.0', 1)],
  ['readAndroidVersion', readAndroidVersion],
])('%s fails closed', (_name, apply) => {
  it.each(REFUSED_GRADLE_SHAPES)('on %s', (_shape, source, error) => {
    expect(() => apply(source)).toThrow(error);
  });
});

describe('readAndroidVersion', () => {
  it('reads back exactly what bumpAndroidGradle writes', () => {
    expect(readAndroidVersion(bumpAndroidGradle(realGradle, '9.8.7', 42))).toEqual({
      versionName: '9.8.7',
      versionCode: 42,
    });
  });
});

describe('bumpAndroidGradle', () => {
  it('rewrites the committed build.gradle version lines, preserving indentation', () => {
    const bumped = bumpAndroidGradle(realGradle, '9.8.7', 42);
    const [nameLine] = bumped.split('\n').filter((line) => line.includes('versionName'));
    const [codeLine] = bumped.split('\n').filter((line) => line.includes('versionCode'));
    const [originalNameLine] = realGradle
      .split('\n')
      .filter((line) => line.includes('versionName'));
    expect(nameLine).toBe(originalNameLine.replace(/"[^"]*"/, '"9.8.7"'));
    expect(nameLine).toMatch(/^\s+versionName "9\.8\.7"$/);
    expect(codeLine).toMatch(/^\s+versionCode 42$/);
  });

  it('is byte-identical when re-applying the committed version', () => {
    const { versionName, versionCode } = readAndroidVersion(realGradle);
    expect(bumpAndroidGradle(realGradle, versionName, versionCode)).toBe(realGradle);
  });
});

describe('bumpIosPbxproj', () => {
  it('rewrites both build configurations in the committed project.pbxproj', () => {
    const bumped = bumpIosPbxproj(realPbxproj, '9.8.7', 42);
    const marketing = bumped.split('\n').filter((line) => line.includes('MARKETING_VERSION'));
    const current = bumped.split('\n').filter((line) => line.includes('CURRENT_PROJECT_VERSION'));
    expect(marketing).toHaveLength(2);
    expect(current).toHaveLength(2);
    for (const line of marketing) expect(line).toMatch(/^\s+MARKETING_VERSION = 9\.8\.7;$/);
    for (const line of current) expect(line).toMatch(/^\s+CURRENT_PROJECT_VERSION = 42;$/);
  });

  it('is byte-identical when re-applying the committed version', () => {
    const [, currentCode] = realPbxproj.match(/CURRENT_PROJECT_VERSION = (\d+);/);
    const [, currentName] = realPbxproj.match(/MARKETING_VERSION = ([^;]+);/);
    expect(bumpIosPbxproj(realPbxproj, currentName, Number(currentCode))).toBe(realPbxproj);
  });

  it('throws on a compact buildSettings dictionary instead of silently skipping it', () => {
    const source = `${realPbxproj}\nbuildSettings = { MARKETING_VERSION = 1.2.3; };\n`;
    expect(() => bumpIosPbxproj(source, '1.0.0', 1)).toThrow(/Unrecognized line/);
  });

  it('throws when a key is missing', () => {
    const source = realPbxproj.replaceAll(/^\s*CURRENT_PROJECT_VERSION = \d+;\n/gm, '');
    expect(() => bumpIosPbxproj(source, '1.0.0', 1)).toThrow(
      /Could not find "CURRENT_PROJECT_VERSION"/
    );
  });
});
