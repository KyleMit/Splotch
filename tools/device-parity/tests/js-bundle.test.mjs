import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  APP_DIR,
  apkResourceNames,
  bundleArgs,
  exportedAndroidResources,
  hbcHeader,
  hermescArgs,
  hermescPath,
  hermescVersion,
  xcodeBuildEnv,
} from '../lib/js-bundle.mjs';
import { bundleEnvironment, parseSwapFlags } from '../swap-js-bundle.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'js-bundle-test-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const repo = join(APP_DIR, '..', '..');
const read = (path) => readFileSync(join(repo, path), 'utf8');
const KOTLIN =
  'node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react';
const native = {
  xcode: read('node_modules/react-native/scripts/react-native-xcode.sh'),
  hermesTask: read(`${KOTLIN}/tasks/BundleHermesCTask.kt`),
  extension: read(`${KOTLIN}/ReactExtension.kt`),
  configuration: read(`${KOTLIN}/TaskConfiguration.kt`),
  appGradle: read('experiments/native-architecture/android/app/build.gradle'),
  gradleProperties: read('experiments/native-architecture/android/gradle.properties'),
  xcodeProject: read('experiments/native-architecture/ios/HelloWorld.xcodeproj/project.pbxproj'),
  infoPlist: read('experiments/native-architecture/ios/HelloWorld/Info.plist'),
  expoEmbedOptions: read('node_modules/@expo/cli/build/src/export/embed/resolveOptions.js'),
};
const PATH = '<path>';
const PATHS = { cli: PATH, entry: PATH, bundle: PATH, assets: PATH, sourcemap: PATH };
const IO = { input: 'IN', output: 'OUT' };

// Each flag with its value: the next token unless that is a flag, or true for a bare switch.
function flagValues(tokens) {
  const values = {};
  tokens.forEach((token, index) => {
    if (!token.startsWith('--')) return;
    const next = tokens[index + 1];
    values[token] = next === undefined || next.startsWith('--') ? true : next;
  });
  return values;
}

// The Gradle task's bundle command for this app's Release variant, built from its own add() calls.
// `--config` needs a bundleConfig the app never sets, and `--verbose` only changes logging.
function gradleBundleCommand({ hermesTask, configuration, appGradle, gradleProperties }) {
  expect(appGradle).not.toMatch(/bundleConfig|extraPackagerArgs|hermesFlags/);
  const body = /fun getBundleCommand[\s\S]+?return windowsAwareCommandLine/.exec(hermesTask)[0];
  const setting = (name) => new RegExp(`task\\.${name}\\.set\\(([^)]+)\\)`).exec(configuration)[1];
  const hermes = /^hermesEnabled=true$/m.test(gradleProperties);
  const valueOf = (expression) => {
    const literal = /^"(.*)"$/.exec(expression);
    if (literal) return literal[1];
    if (expression === 'bundleCommand.get()') return /bundleCommand = "([^"]+)"/.exec(appGradle)[1];
    if (expression === 'devEnabled.get().toString()') return setting('devEnabled');
    if (expression === 'minifyEnabled.get().toString()') {
      const minify = setting('minifyEnabled');
      return minify === '!isHermesEnabledInThisVariant' ? String(!hermes) : minify;
    }
    return PATH;
  };
  const tokens = [...body.matchAll(/\badd\((.+)\)\n/g)].map((match) => valueOf(match[1].trim()));
  const omitted = new Set(['--config', '--verbose']);
  return tokens.filter((token, index) => !omitted.has(token) && !omitted.has(tokens[index - 1]));
}

// The Xcode script's bundle command for a Release device build, with the EXTRA_ARGS it adds for
// Hermes. It adds a source map only for a SOURCEMAP_FILE, an asset catalog only for
// RCTUseAssetCatalog, and a --config only for a BUNDLE_CONFIG, none of which this app sets; it
// always adds --config-cmd, which Expo's export:embed parses and never reads.
function xcodeBundleCommand({ xcode, xcodeProject, infoPlist, expoEmbedOptions }) {
  expect(xcodeProject).not.toMatch(/SOURCEMAP_FILE|BUNDLE_CONFIG|EXTRA_PACKAGER_ARGS/);
  expect(infoPlist).not.toContain('RCTUseAssetCatalog');
  expect(expoEmbedOptions).not.toContain("'--config-cmd'");
  const command =
    /"\$NODE_BINARY" \$NODE_ARGS "\$CLI_PATH" \$BUNDLE_COMMAND([\s\S]+?)\$EXTRA_PACKAGER_ARGS/.exec(
      xcode
    )[1];
  const minify =
    /\$USE_HERMES != false && \$DEV == false \]\]; then\s+EXTRA_ARGS\+=\("--minify" "(\w+)"\)/.exec(
      xcode
    );
  const values = {
    $DEV: /\*\)\s+DEV=(\w+)/.exec(xcode)[1],
    '"$BUNDLE_PLATFORM"': /\*\)\s+BUNDLE_PLATFORM="(\w+)"/.exec(xcode)[1],
    '"${EXTRA_ARGS[@]}"': minify ? ['--minify', minify[1]] : [],
  };
  const tokens = command
    .split(/\s+/)
    .filter((token) => token && token !== '\\' && token !== '$CONFIG_ARG');
  const bundleCommand = /BUNDLE_COMMAND=\\"([\w:]+)\\"/.exec(xcodeProject)[1];
  return [
    PATH,
    bundleCommand,
    ...tokens.flatMap((token) => values[token] ?? (token.startsWith('--') ? token : PATH)),
  ];
}

// The Release Hermes flags each native build passes.
function nativeHermesFlags({ xcode, hermesTask, extension }) {
  const xcodeHermes = /"\$HERMES_CLI_PATH" (.+?) \$EXTRA_COMPILER_ARGS -out/.exec(xcode)[1];
  const xcodeRelease = /else\s+EXTRA_COMPILER_ARGS=(\S+)/.exec(xcode)[1];
  const gradleHermes = /windowsAwareCommandLine\(\s*hermesCommand,([\s\S]+?)"-out"/.exec(
    hermesTask
  )[1];
  const gradleFlags = /hermesFlags[\s\S]+?convention\(listOf\(([^)]*)\)\)/.exec(extension)[1];
  const quoted = (text) => [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  return {
    ios: [...xcodeHermes.split(' '), xcodeRelease],
    android: [...quoted(gradleHermes), ...quoted(gradleFlags)],
  };
}

function assertMatchesNative(sources) {
  const gradle = gradleBundleCommand(sources);
  const android = bundleArgs('android', PATHS);
  expect(android[1]).toBe(gradle[1]);
  expect(flagValues(android)).toEqual(flagValues(gradle));
  const xcode = xcodeBundleCommand(sources);
  const ios = bundleArgs('ios', PATHS);
  expect(ios[1]).toBe(xcode[1]);
  expect(flagValues(ios)).toEqual(flagValues(xcode));

  const hermes = nativeHermesFlags(sources);
  expect(hermescArgs('ios', IO)).toEqual([...hermes.ios, '-out', 'OUT', 'IN']);
  const compiled = hermescArgs('android', IO);
  const out = compiled.indexOf('-out');
  expect(compiled.slice(out, out + 3)).toEqual(['-out', 'OUT', 'IN']);
  expect(compiled.toSpliced(out, 3)).toEqual(hermes.android);
}

describe('the swapped bundle is built as the native Release builds build it', () => {
  it('passes the bundle and Hermes arguments React Native’s Gradle task and Xcode script pass', () => {
    expect(() => assertMatchesNative(native)).not.toThrow();
  });

  it.each([
    ['hermesTask', 'add("--dev")', 'add("--development")'],
    ['hermesTask', '          add("--reset-cache")\n', ''],
    ['configuration', 'task.devEnabled.set(false)', 'task.devEnabled.set(true)'],
    ['gradleProperties', 'hermesEnabled=true', 'hermesEnabled=false'],
    ['appGradle', 'bundleCommand = "export:embed"', 'bundleCommand = "bundle"'],
    [
      'appGradle',
      '    autolinkLibrariesWithApp()',
      '    bundleConfig = file("x")\n    autolinkLibrariesWithApp()',
    ],
    ['xcode', '  --reset-cache \\\n', ''],
    ['xcode', 'EXTRA_ARGS+=("--minify" "false")', 'EXTRA_ARGS+=("--minify" "true")'],
    ['xcode', '    DEV=false', '    DEV=true'],
    ['xcode', 'EXTRA_COMPILER_ARGS=-O\n', 'EXTRA_COMPILER_ARGS=-Os\n'],
    ['xcodeProject', 'BUNDLE_COMMAND=\\"export:embed\\"', 'BUNDLE_COMMAND=\\"bundle\\"'],
    ['hermesTask', '"-emit-binary",', '"-emit-binary", "-g",'],
    ['extension', 'listOf("-O", "-output-source-map")', 'listOf("-O")'],
  ])('fails when the %s changes a Release argument (%s)', (source, from, to) => {
    const changed = native[source].replace(from, to);
    expect(changed).not.toBe(native[source]);
    expect(() => assertMatchesNative({ ...native, [source]: changed })).toThrow(/expected/);
  });
});

describe('Hermes bytecode headers', () => {
  // A real compile pins the header offsets: the version hermesc reports, and the SHA-1 of the
  // JavaScript it compiled.
  it('reads the version and source hash hermesc writes', () => {
    const input = join(scratch, 'main.jsbundle');
    const output = join(scratch, 'main.hbc');
    writeFileSync(input, 'globalThis.answer = 42;\n');
    const compiler = hermescPath();
    const compiled = spawnSync(compiler, hermescArgs('ios', { input, output }));
    expect(compiled.status).toBe(0);
    const header = hbcHeader(readFileSync(output));
    const reported = spawnSync(compiler, ['-version'], { encoding: 'utf8' }).stdout;
    expect(header.version).toBe(hermescVersion(reported));
    expect(header.sourceHash).toBe(createHash('sha1').update(readFileSync(input)).digest('hex'));
  });

  it('refuses a file that is not Hermes bytecode', () => {
    expect(() => hbcHeader(Buffer.from('var a = 1;'.repeat(8)))).toThrow('not a Hermes bytecode');
  });
});

describe('Android assets', () => {
  it('names each exported image and sound as the APK resource table does, minus the keep rules', () => {
    const dir = join(scratch, 'res');
    for (const file of ['drawable-mdpi/src_icon.png', 'raw/src_audio_tap.wav', 'raw/keep.xml']) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), '');
    }
    expect(exportedAndroidResources(dir)).toEqual(['drawable/src_icon', 'raw/src_audio_tap']);
  });

  it('reads resource names from aapt2’s dump', () => {
    const dump = [
      'Package name=art.splotch.migration.probe id=7f',
      '  type raw id=11 entryCount=2',
      '    resource 0x7f110005 raw/src_audio_tap',
      '      () (file) res/Aa.wav type=UNKNOWN',
      '    resource 0x7f080001 drawable/$mtrl_checkbox__0',
    ].join('\n');
    expect([...apkResourceNames(dump)]).toEqual([
      'raw/src_audio_tap',
      'drawable/$mtrl_checkbox__0',
    ]);
  });
});

describe('swap-js-bundle refusals', () => {
  const entry = join(import.meta.dirname, '..', 'swap-js-bundle.mjs');
  const run = (args) => spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });
  const required = ['--base=x.apk', `--out=${join(scratch, 'out')}`];

  it('refuses the store app before reading anything', () => {
    const result = run(['--platform=android', '--bundle=art.splotch.app', ...required]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('--bundle art.splotch.app is the store app\n');
  });

  it('refuses an Android swap without the base build’s signing key', () => {
    const result = run(['--platform=android', '--bundle=probe', ...required]);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('--platform=android needs --keystore, --key-alias, --ks-pass\n');
  });

  it('refuses an output directory that already holds a run', () => {
    const out = join(scratch, 'used');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'app.apk'), '');
    const signing = ['--keystore=k', '--key-alias=a', '--ks-pass=pass:x'];
    const args = ['--platform=android', '--bundle=probe', '--base=x.apk', `--out=${out}`];
    const result = run([...args, ...signing]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('already holds files');
  });
});

describe('the environment each bundle step runs in', () => {
  const writeEnvFiles = (dir, files) => {
    mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  };

  // An EXPO_PUBLIC_* value exported from an Xcode env file reaches the full build's bundle, so it
  // has to reach the swapped one too.
  // The files are ordinary shell; one that prints must not corrupt the environment read back.
  it('applies the Xcode env files in the order the bundle phase sources them', () => {
    const dir = join(scratch, 'ios-env');
    writeEnvFiles(dir, {
      '.xcode.env':
        'echo "Using configured Node"\nexport NODE_BINARY=/opt/node\nexport EXPO_PUBLIC_SWAP_CHECK=from-env\n',
      '.xcode.env.local': 'export EXPO_PUBLIC_SWAP_CHECK=from-local\n',
    });
    const env = xcodeBuildEnv(dir, { PATH: process.env.PATH, KEPT: 'caller' });
    expect(env).toMatchObject({
      NODE_BINARY: '/opt/node',
      EXPO_PUBLIC_SWAP_CHECK: 'from-local',
      KEPT: 'caller',
    });
    rmSync(join(dir, '.xcode.env.local'));
    expect(xcodeBuildEnv(dir, { PATH: process.env.PATH }).EXPO_PUBLIC_SWAP_CHECK).toBe('from-env');
  });

  it('bundles for iOS with the sourced environment and its NODE_BINARY', () => {
    const runtime = bundleEnvironment('ios');
    expect(runtime.env).toEqual(xcodeBuildEnv());
    expect(runtime.node).toBe(runtime.env.NODE_BINARY || process.execPath);
    expect(bundleEnvironment('android')).toEqual({ node: process.execPath, env: process.env });
  });
});

describe('swap-js-bundle paths', () => {
  // Every step runs from the app's directory, so a path the caller gave relative to their own
  // directory is resolved before any of them.
  it('resolves the base, output, keystore and a password file against the caller', () => {
    const options = parseSwapFlags([
      '--platform=android',
      '--bundle=probe',
      '--base=build/app.apk',
      `--out=${join('scratch-out', String(Date.now()))}`,
      '--keystore=keys/candidate-release.keystore',
      '--key-alias=a',
      '--ks-pass=file:keys/password.txt',
      '--key-pass=env:KEY_PASSWORD',
    ]);
    expect(options).toMatchObject({
      base: resolve('build/app.apk'),
      keystore: resolve('keys/candidate-release.keystore'),
      ksPass: `file:${resolve('keys/password.txt')}`,
      keyPass: 'env:KEY_PASSWORD',
    });
    expect(options.out.startsWith(resolve('scratch-out'))).toBe(true);
  });
});
