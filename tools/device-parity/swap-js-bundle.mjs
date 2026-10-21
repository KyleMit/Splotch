// Rebuilds only the React Native app's JavaScript and puts it into a Release build that a full
// Gradle or Xcode build already produced, then installs that copy. A JS-only change reaches the
// device in about a minute instead of a native rebuild (issue 3083). Native code, resources and
// signing entitlements come unchanged from the base build, so a Kotlin or Swift change, or a new
// Android image or sound, still needs the full build; the Android route refuses an asset the base
// APK lacks.
//
// Android: the bundle replaces assets/index.android.bundle, then the APK is page-aligned and signed
// again with the base build's keystore, so `adb install -r` keeps the app's data.
// iOS: the bundle and its assets replace the .app's own, then the app is signed again with the
// given identity, keeping the base build's entitlements and its embedded provisioning profile.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fail, isMain, runMain } from '../lib/proc.mjs';
import { ADB, ANDROID_HOME } from '../mobile/android/lib/android-toolchain.mjs';
import { STORE_APP_ID } from '../release/lib/native-app.mjs';
import { choiceFlag, parseFlags } from './lib/cli-flags.mjs';
import {
  APK_BUNDLE_ENTRY,
  APP_DIR,
  BUNDLE_NAME,
  PLATFORMS,
  apkResourceNames,
  bundleArgs,
  expoCliPath,
  exportedAndroidResources,
  hbcHeader,
  hermescArgs,
  hermescPath,
  hermescVersion,
  xcodeBuildEnv,
} from './lib/js-bundle.mjs';

// Uncompressed native libraries in the base APK sit on 16 KB pages; the copy keeps them there.
const ANDROID_PAGE_ALIGN_KB = '16';
const ZIP_ALIGN_BYTES = '4';
// A Release bundle is about 10 MB, and `aapt2 dump resources` prints well past spawnSync's 1 MB
// default.
const OUTPUT_LIMIT_BYTES = 256 << 20;

const FLAGS = {
  platform: { type: 'string' },
  base: { type: 'string' },
  bundle: { type: 'string' },
  out: { type: 'string' },
  device: { type: 'string' },
  keystore: { type: 'string' },
  'key-alias': { type: 'string' },
  'ks-pass': { type: 'string' },
  'key-pass': { type: 'string' },
  identity: { type: 'string' },
};

// apksigner's `file:` form names a path; `env:` and `pass:` pass through.
const passwordSource = (value) =>
  value?.startsWith('file:') ? `file:${resolve(value.slice('file:'.length))}` : value;

export function parseSwapFlags(argv) {
  const { values } = parseFlags(argv, {
    options: FLAGS,
    required: ['platform', 'base', 'bundle', 'out'],
  });
  const platform = choiceFlag(values, 'platform', PLATFORMS);
  // The Play Store and App Store app. A swapped bundle never goes near it.
  if (values.bundle === STORE_APP_ID) fail(`--bundle ${STORE_APP_ID} is the store app`);
  const needed = platform === 'android' ? ['keystore', 'key-alias', 'ks-pass'] : ['identity'];
  const missing = needed.filter((name) => values[name] === undefined);
  if (missing.length) {
    fail(`--platform=${platform} needs ${missing.map((name) => `--${name}`).join(', ')}`);
  }
  if (platform === 'ios' && process.platform !== 'darwin') fail('The iOS route needs macOS');
  // Every path resolves against the caller's directory: the steps run from the app's.
  const out = resolve(values.out);
  if (existsSync(out) && readdirSync(out).length) {
    fail(`--out ${out} already holds files; give each run its own directory`);
  }
  return {
    platform,
    base: resolve(values.base),
    bundleId: values.bundle,
    out,
    device: values.device,
    keystore: values.keystore === undefined ? undefined : resolve(values.keystore),
    keyAlias: values['key-alias'],
    ksPass: passwordSource(values['ks-pass']),
    keyPass: passwordSource(values['key-pass'] ?? values['ks-pass']),
    identity: values.identity,
  };
}

function step(cmd, args, { cwd = APP_DIR, encoding = 'utf8', env = process.env } = {}) {
  const result = spawnSync(cmd, args, { cwd, encoding, env, maxBuffer: OUTPUT_LIMIT_BYTES });
  if (result.status !== 0) {
    const reason = result.error ? `: ${result.error.message}` : '';
    fail(`${cmd} ${args[0] ?? ''} failed (exit ${result.status})${reason}\n${result.stderr ?? ''}`);
  }
  return result.stdout;
}

function buildTool(name) {
  const root = join(ANDROID_HOME, 'build-tools');
  const versions = readdirSync(root).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  if (!versions.length) fail(`No Android build-tools under ${root}`);
  return join(root, versions.at(-1), name);
}

function appEntry(platform, { node, env }) {
  const script = "require('expo/scripts/resolveAppEntry')";
  return step(node, ['-e', script, APP_DIR, platform, 'absolute'], { env })
    .trim()
    .split('\n')
    .at(-1);
}

// Gradle bundles in the environment it was started from; Xcode's phase also sources its env files
// and runs NODE_BINARY. Exported for js-bundle.test.mjs, which pins that wiring.
export function bundleEnvironment(platform) {
  if (platform === 'android') return { node: process.execPath, env: process.env };
  const env = xcodeBuildEnv();
  return { node: env.NODE_BINARY || process.execPath, env };
}

// The JavaScript, bundled and compiled exactly as the base build's own bundle step does it.
function compileBundle(platform, out) {
  const js = join(out, 'js');
  const assets = join(out, 'assets');
  mkdirSync(js, { recursive: true });
  mkdirSync(assets, { recursive: true });
  const source = join(js, BUNDLE_NAME[platform]);
  const started = Date.now();
  const runtime = bundleEnvironment(platform);
  const args = bundleArgs(platform, {
    cli: expoCliPath(),
    entry: appEntry(platform, runtime),
    bundle: source,
    assets,
    sourcemap: `${source}.packager.map`,
  });
  step(runtime.node, args, { env: runtime.env });
  const compiled = join(out, BUNDLE_NAME[platform]);
  step(hermescPath(), hermescArgs(platform, { input: source, output: compiled }));
  console.log(`bundled and compiled in ${Math.round((Date.now() - started) / 1000)} s`);
  return { compiled, assets };
}

function checkBytecode(base, compiled) {
  const was = hbcHeader(base);
  const now = hbcHeader(readFileSync(compiled));
  const compiler = hermescVersion(step(hermescPath(), ['-version']));
  if (was.version !== compiler || now.version !== compiler) {
    fail(`hermesc emits bytecode ${compiler}; the base build's bundle is ${was.version}`);
  }
  console.log(
    now.sourceHash === was.sourceHash
      ? 'JavaScript: the same as the base build'
      : 'JavaScript: changed from the base build'
  );
}

function baseBundleId({ platform, base }) {
  if (platform === 'android') {
    const badging = step(buildTool('aapt2'), ['dump', 'badging', base]);
    return /^package: name='([^']+)'/m.exec(badging)?.[1];
  }
  const plist = join(base, 'Info.plist');
  return step('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', plist]).trim();
}

function swapAndroid(options, { compiled, assets }) {
  const present = apkResourceNames(step(buildTool('aapt2'), ['dump', 'resources', options.base]));
  const absent = exportedAndroidResources(assets).filter((name) => !present.has(name));
  if (absent.length) {
    fail(`The base APK lacks ${absent.join(', ')}; an added asset needs a full Gradle build`);
  }
  checkBytecode(
    step('unzip', ['-p', options.base, APK_BUNDLE_ENTRY], { encoding: 'buffer' }),
    compiled
  );
  return packageAndroid(options, compiled);
}

function packageAndroid(options, compiled) {
  const stage = join(options.out, 'stage');
  mkdirSync(join(stage, 'assets'), { recursive: true });
  copyFileSync(compiled, join(stage, APK_BUNDLE_ENTRY));
  const unaligned = join(options.out, 'unaligned.apk');
  copyFileSync(options.base, unaligned);
  // Stored, as the Gradle build stores it, so the runtime can map it without inflating.
  step('zip', ['-0', '-X', unaligned, APK_BUNDLE_ENTRY], { cwd: stage });
  const aligned = join(options.out, 'aligned.apk');
  step(buildTool('zipalign'), [
    '-P',
    ANDROID_PAGE_ALIGN_KB,
    '-f',
    ZIP_ALIGN_BYTES,
    unaligned,
    aligned,
  ]);
  const apk = join(options.out, 'app-release-swapped.apk');
  const signer = buildTool('apksigner');
  step(signer, [
    'sign',
    '--ks',
    options.keystore,
    '--ks-key-alias',
    options.keyAlias,
    '--ks-pass',
    options.ksPass,
    '--key-pass',
    options.keyPass,
    '--out',
    apk,
    aligned,
  ]);
  step(signer, ['verify', apk]);
  return apk;
}

function swapIos(options, { compiled, assets }) {
  const app = join(options.out, basename(resolve(options.base)));
  cpSync(options.base, app, { recursive: true, verbatimSymlinks: true });
  checkBytecode(readFileSync(join(app, BUNDLE_NAME.ios)), compiled);
  copyFileSync(compiled, join(app, BUNDLE_NAME.ios));
  // iOS reads the bundle's images and sounds as plain files inside the app, so a changed or added
  // asset travels with the swap.
  cpSync(assets, app, { recursive: true });
  step('codesign', [
    '--force',
    '--sign',
    options.identity,
    '--preserve-metadata=entitlements,requirements,flags',
    '--timestamp=none',
    app,
  ]);
  step('codesign', ['--verify', '--strict', app]);
  return app;
}

function install(options, artifact) {
  if (options.device === undefined) return;
  if (options.platform === 'android') {
    step(ADB, ['-s', options.device, 'install', '-r', artifact]);
  } else {
    step('xcrun', ['devicectl', 'device', 'install', 'app', '--device', options.device, artifact]);
  }
  console.log(`installed ${options.bundleId} on ${options.device}; relaunch the app to load it`);
}

export async function swapJsBundle(argv) {
  const options = parseSwapFlags(argv);
  const bundleId = baseBundleId(options);
  if (bundleId !== options.bundleId) {
    fail(`${options.base} is ${bundleId}, not --bundle ${options.bundleId}`);
  }
  mkdirSync(options.out, { recursive: true });
  const built = compileBundle(options.platform, options.out);
  const artifact =
    options.platform === 'android' ? swapAndroid(options, built) : swapIos(options, built);
  console.log(`swapped build: ${artifact}`);
  install(options, artifact);
}

if (isMain(import.meta.url)) runMain(() => swapJsBundle(process.argv.slice(2)));
