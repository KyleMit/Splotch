// The React Native app's Release JavaScript bundle, built the way its native builds build it, for
// swap-js-bundle.mjs. The bundle and Hermes arguments are the ones React Native's Gradle task
// (BundleHermesCTask) and Xcode script (react-native-xcode.sh) pass for a Release build; the
// js-bundle test reads both scripts and fails when they change. The order differs from theirs
// where it does not matter.
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';

export const APP_DIR = join(ROOT, 'experiments', 'native-architecture');
export const PLATFORMS = ['android', 'ios'];
// The Play Store and App Store app. A swapped bundle never goes near it.
export const STORE_BUNDLE_ID = 'art.splotch.app';

// Where each native build puts the bundle. Hermes records the compiled file's source name, so the
// intermediate JavaScript file carries the same name.
export const BUNDLE_NAME = { android: 'index.android.bundle', ios: 'main.jsbundle' };
export const APK_BUNDLE_ENTRY = `assets/${BUNDLE_NAME.android}`;

const HBC_MAGIC = Buffer.from([0xc6, 0x1f, 0xbc, 0x03, 0xc1, 0x03, 0x19, 0x1f]);
const HBC_VERSION_OFFSET = 8;
const HBC_SOURCE_HASH_OFFSET = 12;
const HBC_SOURCE_HASH_BYTES = 20;
const HBC_HEADER_BYTES = HBC_SOURCE_HASH_OFFSET + HBC_SOURCE_HASH_BYTES;

// React Native writes ProGuard-style keep rules for its assets into raw/; the shrinker consumes the
// file, so it is never a resource in the APK.
const ASSET_KEEP_RULES = 'raw/keep';

const HERMESC_HOST_DIR = { darwin: 'osx-bin', linux: 'linux64-bin' };

export function bundleArgs(platform, { cli, entry, bundle, assets, sourcemap }) {
  const args = [cli, 'export:embed', '--platform', platform, '--dev', 'false', '--reset-cache'];
  args.push('--entry-file', entry, '--bundle-output', bundle, '--assets-dest', assets);
  if (platform === 'android') args.push('--sourcemap-output', sourcemap);
  // Hermes needs no minified source; both native builds pass this for Release.
  args.push('--minify', 'false');
  return args;
}

export function hermescArgs(platform, { input, output }) {
  const common = ['-emit-binary', '-max-diagnostic-width=80'];
  if (platform === 'android') {
    return ['-w', ...common, '-out', output, input, '-O', '-output-source-map'];
  }
  return [...common, '-O', '-out', output, input];
}

// A Hermes bytecode file's version and the SHA-1 of the JavaScript it was compiled from.
export function hbcHeader(bytes) {
  if (bytes.length < HBC_HEADER_BYTES || !bytes.subarray(0, HBC_MAGIC.length).equals(HBC_MAGIC)) {
    throw new Error('not a Hermes bytecode bundle');
  }
  return {
    version: bytes.readUInt32LE(HBC_VERSION_OFFSET),
    sourceHash: bytes
      .subarray(HBC_SOURCE_HASH_OFFSET, HBC_SOURCE_HASH_OFFSET + HBC_SOURCE_HASH_BYTES)
      .toString('hex'),
  };
}

export function hermescVersion(versionOutput) {
  const match = /HBC bytecode version: (\d+)/.exec(versionOutput);
  if (!match) throw new Error('hermesc printed no bytecode version');
  return Number(match[1]);
}

// `type/name` for every image and sound the bundle step exported, as Android names the resource.
export function exportedAndroidResources(assetsDir) {
  const names = [];
  for (const folder of readdirSync(assetsDir)) {
    const type = folder.split('-')[0];
    for (const file of readdirSync(join(assetsDir, folder))) {
      const name = `${type}/${basename(file, extname(file))}`;
      if (name !== ASSET_KEEP_RULES) names.push(name);
    }
  }
  return names.sort();
}

// The `type/name` of every resource `aapt2 dump resources` lists.
export function apkResourceNames(dump) {
  return new Set([...dump.matchAll(/^\s*resource 0x[0-9a-f]+ (\S+)$/gm)].map((match) => match[1]));
}

export function hermescPath(appDir = APP_DIR, platform = process.platform) {
  const host = HERMESC_HOST_DIR[platform];
  if (!host) throw new Error(`hermesc has no build for ${platform}`);
  const require = createRequire(join(appDir, 'package.json'));
  const reactNative = require.resolve('react-native/package.json');
  const compiler = require.resolve('hermes-compiler/package.json', { paths: [reactNative] });
  return join(dirname(compiler), 'hermesc', host, 'hermesc');
}

export function expoCliPath(appDir = APP_DIR) {
  const require = createRequire(join(appDir, 'package.json'));
  return require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] });
}
