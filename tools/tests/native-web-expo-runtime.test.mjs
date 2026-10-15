import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { webAssetUri } from '../../experiments/native-architecture/src/platform/webAsset.ts';
import { ROOT } from '../lib/proc.mjs';

const SRC = join(ROOT, 'experiments/native-architecture/src');
const EXPO = join(ROOT, 'node_modules/expo/src');
const ASSET_TRANSFORMER = join(
  ROOT,
  'node_modules/@expo/metro-config/build/transform-worker/asset-transformer.js'
);
const WEB_LAUNCHER = 'platform/registerRoot.web.ts';
// The expo package's index, which also loads expo-modules-core, and expo-asset, which loads it too.
const EXPO_RUNTIME_IMPORT = /from\s*'expo(?:-asset)?'|import\(\s*'expo(?:-asset)?'\s*\)/;
const PLATFORM_ONLY = /\.(?:native|ios|android)\.tsx?$/;

function sources(directory = SRC) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [relative(SRC, path)] : [];
  });
}

// Metro bundles a file for web unless a platform suffix keeps it native or a .web sibling
// replaces it.
function bundledForWeb(path) {
  if (PLATFORM_ONLY.test(path)) return false;
  const stem = path.replace(/\.tsx?$/, '');
  return (
    stem.endsWith('.web') ||
    !['.web.ts', '.web.tsx'].some((suffix) => existsSync(join(SRC, `${stem}${suffix}`)))
  );
}

describe('the web export leaves Expo’s native-module runtime out', () => {
  it('imports neither the expo index nor expo-asset from any module it bundles', () => {
    const offenders = sources().filter(
      (path) =>
        bundledForWeb(path) && EXPO_RUNTIME_IMPORT.test(readFileSync(join(SRC, path), 'utf8'))
    );
    expect(offenders).toEqual([]);
    expect("import { Asset } from 'expo-asset';").toMatch(EXPO_RUNTIME_IMPORT);
    expect("export { registerRootComponent } from 'expo';").toMatch(EXPO_RUNTIME_IMPORT);
    expect(bundledForWeb('platform/registerRoot.ts')).toBe(false);
    expect(bundledForWeb(WEB_LAUNCHER)).toBe(true);
  });

  it('launches through the same registerRootComponent the expo index exports', () => {
    const [, path] = /from '(expo\/src\/[^']+)'/.exec(
      readFileSync(join(SRC, WEB_LAUNCHER), 'utf8')
    );
    // The index's own relative specifier for the module the web launcher imports by package path.
    const fromIndex = path.replace('expo/src/', './');
    expect(readFileSync(join(EXPO, 'Expo.ts'), 'utf8')).toContain(
      `export { default as registerRootComponent } from '${fromIndex}';`
    );
  });

  it('keeps Expo’s web setup, which installs the loader for the lazy chunks', () => {
    expect(readFileSync(join(EXPO, 'launch/registerRootComponent.web.tsx'), 'utf8')).toMatch(
      /^import '\.\.\/Expo\.fx';$/m
    );
    expect(readFileSync(join(EXPO, 'Expo.fx.web.tsx'), 'utf8')).toMatch(
      /^import '\.\/async-require';$/m
    );
  });
});

describe('webAssetUri', () => {
  it('reads both shapes Expo’s web asset transform exports', () => {
    const transformer = readFileSync(ASSET_TRANSFORMER, 'utf8');
    expect(transformer).toContain(
      'module.exports = { uri: FILE_PATH, width: WIDTH, height: HEIGHT, toString() { return this.uri } };'
    );
    expect(transformer).toContain('module.exports = FILE_PATH;');
    expect(webAssetUri('/assets/clear-page-turn.mp3')).toBe('/assets/clear-page-turn.mp3');
    expect(webAssetUri({ uri: '/assets/paper.webp', width: 148, height: 148 })).toBe(
      '/assets/paper.webp'
    );
  });

  it('refuses a native asset id instead of reading a URL from it', () => {
    expect(() => webAssetUri(7)).toThrow('Asset 7 is a native asset id');
  });
});
