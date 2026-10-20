import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
} from '../lib/js-bundle.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'js-bundle-test-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const nodeModule = (path) => {
  const resolved = join(APP_DIR, '..', '..', 'node_modules', path);
  return readFileSync(resolved, 'utf8');
};
const gradlePlugin = (file) => {
  const root = '@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin';
  return nodeModule(`${root}/com/facebook/react/${file}`);
};
const native = {
  xcode: nodeModule('react-native/scripts/react-native-xcode.sh'),
  hermesTask: gradlePlugin('tasks/BundleHermesCTask.kt'),
  extension: gradlePlugin('ReactExtension.kt'),
  configuration: gradlePlugin('TaskConfiguration.kt'),
};
const PATHS = { cli: 'CLI', entry: 'ENTRY', bundle: 'B', assets: 'A', sourcemap: 'M' };
const IO = { input: 'IN', output: 'OUT' };

// The Release flags each native build passes, read from React Native's own build scripts.
function nativeReleaseFlags({ xcode, hermesTask, extension, configuration }) {
  const xcodeHermes = /"\$HERMES_CLI_PATH" (.+?) \$EXTRA_COMPILER_ARGS -out/.exec(xcode)?.[1];
  const xcodeRelease = /else\s+EXTRA_COMPILER_ARGS=(\S+)/.exec(xcode)?.[1];
  const gradleHermes = /windowsAwareCommandLine\(\s*hermesCommand,([\s\S]+?)"-out"/.exec(
    hermesTask
  );
  const gradleFlags = /hermesFlags[\s\S]+?convention\(listOf\(([^)]*)\)\)/.exec(extension)?.[1];
  const quoted = (text) => [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  return {
    ios: {
      hermes: [...xcodeHermes.split(' '), xcodeRelease],
      minifyFalse: /\$USE_HERMES != false && \$DEV == false[\s\S]{0,40}"--minify" "false"/.test(
        xcode
      ),
      resetCache: /--dev \$DEV \\\s+--reset-cache/.test(xcode),
    },
    android: {
      hermes: [...quoted(gradleHermes[1]), ...quoted(gradleFlags)],
      minifyFalse: /task\.minifyEnabled\.set\(!isHermesEnabledInThisVariant\)/.test(configuration),
      devFalse: /task\.devEnabled\.set\(false\)/.test(configuration),
      sourcemap: /add\("--sourcemap-output"\)/.test(hermesTask),
    },
  };
}

function assertMatchesNative(sources) {
  const flags = nativeReleaseFlags(sources);
  const ios = hermescArgs('ios', IO);
  expect(ios).toEqual([...flags.ios.hermes, '-out', 'OUT', 'IN']);
  const android = hermescArgs('android', IO);
  const out = android.indexOf('-out');
  expect(android.slice(out, out + 3)).toEqual(['-out', 'OUT', 'IN']);
  expect(android.toSpliced(out, 3)).toEqual(flags.android.hermes);
  for (const platform of ['android', 'ios']) {
    const args = bundleArgs(platform, PATHS).join(' ');
    expect(args).toContain('export:embed --platform ' + platform + ' --dev false --reset-cache');
    expect(args).toContain('--minify false');
  }
  expect(flags.ios).toMatchObject({ minifyFalse: true, resetCache: true });
  expect(flags.android).toMatchObject({ minifyFalse: true, devFalse: true, sourcemap: true });
  expect(bundleArgs('android', PATHS)).toContain('--sourcemap-output');
}

describe('the swapped bundle is built as the native Release builds build it', () => {
  it('passes the bundle and Hermes flags React Native’s Gradle task and Xcode script pass', () => {
    expect(() => assertMatchesNative(native)).not.toThrow();
  });

  it.each([
    ['xcode', 'EXTRA_COMPILER_ARGS=-O\n', 'EXTRA_COMPILER_ARGS=-Os\n'],
    ['hermesTask', '"-emit-binary",', '"-emit-binary", "-g",'],
    ['extension', 'listOf("-O", "-output-source-map")', 'listOf("-O")'],
    ['configuration', 'task.devEnabled.set(false)', 'task.devEnabled.set(true)'],
  ])('fails when the %s changes its Release flags', (source, from, to) => {
    const changed = native[source].replace(from, to);
    expect(changed).not.toBe(native[source]);
    expect(() => assertMatchesNative({ ...native, [source]: changed })).toThrow();
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
