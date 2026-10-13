import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { copyCandidateFixture } from './candidate-fixtures.mjs';

it('copies maintained candidate inputs without generated output trees', () => {
  const directory = mkdtempSync(join(tmpdir(), 'splotch-candidate-copy-'));
  const candidate = join(directory, 'source');
  const target = join(directory, 'target');
  const excluded = [
    'node_modules/expo/package.json',
    'src/nested/node_modules/example/index.js',
    '.git/index',
    '.expo/config.json',
    'dist/index.js',
    'android/.gradle/cache.bin',
    'android/.cxx/native.so',
    'android/build/generated.js',
    'android/app/.cxx/native.so',
    'android/app/build/app.apk',
    'ios/Pods/manifest.json',
    'ios/build/generated.js',
  ];
  const maintained = [
    'package.json',
    'app.json',
    'babel.config.cjs',
    'src/index.ts',
    'src/node_modules-notes.ts',
    'android/maintained-helper.js',
    'android/settings.gradle',
    'android/app/build.gradle',
    'android/app/src/main/AndroidManifest.xml',
    'android/.gradle-notes.txt',
    'android/build-tools/helper.js',
    'android/app/build-notes/helper.js',
    'ios/Podfile',
    'ios/maintained-helper.js',
    'ios/Pods-notes/helper.js',
    'dist-notes/helper.js',
  ];
  try {
    for (const path of [...excluded, ...maintained]) {
      const file = join(candidate, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, path);
    }
    copyCandidateFixture(candidate, target);
    for (const path of excluded) expect(existsSync(join(target, path))).toBe(false);
    for (const path of maintained) expect(readFileSync(join(target, path), 'utf8')).toBe(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
