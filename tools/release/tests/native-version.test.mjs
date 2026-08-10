import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANDROID_GRADLE_PATH,
  bumpAndroidGradle,
  bumpIosPbxproj,
  IOS_PBXPROJ_PATH,
} from '../lib/native-version.mjs';

const repoRoot = join(import.meta.dirname, '..', '..');
const { version: packageVersion } = JSON.parse(
  readFileSync(join(repoRoot, 'package.json'), 'utf8')
);
const realGradle = readFileSync(join(repoRoot, ANDROID_GRADLE_PATH), 'utf8');
const realPbxproj = readFileSync(join(repoRoot, IOS_PBXPROJ_PATH), 'utf8');

it('keeps the committed package and native versions in agreement', () => {
  const [, androidVersionCode] = realGradle.match(/^\s*versionCode\s+(\d+)\s*$/m);
  expect(bumpAndroidGradle(realGradle, packageVersion, Number(androidVersionCode))).toBe(
    realGradle
  );
  expect(bumpIosPbxproj(realPbxproj, packageVersion, Number(androidVersionCode))).toBe(realPbxproj);
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
    const [, currentCode] = realGradle.match(/versionCode (\d+)/);
    const [, currentName] = realGradle.match(/versionName "([^"]*)"/);
    expect(bumpAndroidGradle(realGradle, currentName, Number(currentCode))).toBe(realGradle);
  });

  it('throws on a versionNameSuffix line instead of rewriting it', () => {
    const source = realGradle.replace(
      /^(\s*)versionName "[^"]*"$/m,
      '$&\n$1versionNameSuffix ".debug"'
    );
    expect(() => bumpAndroidGradle(source, '1.0.0', 1)).toThrow(/versionNameSuffix/);
  });

  it('throws on an inline comment on the version assignment line', () => {
    const source = realGradle.replace(
      /^(\s*versionName "[^"]*")$/m,
      '$1 // keep in sync with package.json'
    );
    expect(() => bumpAndroidGradle(source, '1.0.0', 1)).toThrow(/Unrecognized line.*versionName/);
  });

  it('throws on a comment mentioning versionCode', () => {
    const source = `${realGradle}\n// bump versionCode before release\n`;
    expect(() => bumpAndroidGradle(source, '1.0.0', 1)).toThrow(/Unrecognized line/);
  });

  it('throws on a duplicate versionName assignment', () => {
    const source = `${realGradle}\nversionName "2.0.0"\n`;
    expect(() => bumpAndroidGradle(source, '1.0.0', 1)).toThrow(/exactly one "versionName"/);
  });

  it('throws when a key is missing', () => {
    const source = realGradle.replace(/^\s*versionName "[^"]*"\n/m, '');
    expect(() => bumpAndroidGradle(source, '1.0.0', 1)).toThrow(/Could not find "versionName"/);
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
