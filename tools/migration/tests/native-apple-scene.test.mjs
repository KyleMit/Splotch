import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import {
  APPLE_BUNDLE_OVERRIDES,
  HERMES_COMPILER_VERSION,
  NATIVE_CONTRACT,
} from '../lib/native-source-contract.mjs';
import {
  assertAppleSceneContract,
  readExpoSceneSupport,
  SCENE_MANIFEST_XML,
} from '../lib/native-apple-scene.mjs';
import { transformTemplateMember } from '../lib/native-template-transforms.mjs';
import {
  assertNativeProvenance,
  assertTemplateManifest,
  expectedNativeProvenance,
  readTemplateManifest,
} from '../lib/native-template.mjs';

const root = join(import.meta.dirname, '../../..');
const candidate = join(root, CANDIDATE_DIRECTORY);
const delegateMember = 'package/ios/HelloWorld/AppDelegate.swift';
const plistMember = 'package/ios/HelloWorld/Info.plist';
const fixtureDirectories = [];
const PHASE_CONTROLS_TIMEOUT_MS = 15000;
const PHASE_CHILD_TIMEOUT_MS = 5000;
const scenePaths = [
  'ios/AppDelegates/ExpoAppSceneDelegate.swift',
  'ios/AppDelegates/ExpoReactNativeFactoryProvider.swift',
  'ios/AppDelegates/SceneEventForwarder.swift',
];

afterEach(() => fixtureDirectories.splice(0).forEach((path) => rmSync(path, { recursive: true })));

function sourceFixture() {
  const manifest = readTemplateManifest(root);
  const delegate = manifest.members.find((member) => member.path === delegateMember);
  const plist = manifest.members.find((member) => member.path === plistMember);
  return {
    manifest,
    delegate: transformTemplateMember(
      delegateMember,
      Buffer.from(delegate.originalText)
    ).bytes.toString('utf8'),
    plist: transformTemplateMember(plistMember, Buffer.from(plist.originalText)).bytes.toString(
      'utf8'
    ),
  };
}

function ownedWrite(rootPath, path, value, mode = 0o644) {
  const file = join(rootPath, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value, { mode });
  chmodSync(file, mode);
}

function expoFixture() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'splotch-expo-scene-source-'));
  fixtureDirectories.push(fixtureRoot);
  const resolved = createRequire(join(candidate, 'package.json')).resolve('expo/package.json');
  const publishedRoot = dirname(realpathSync(resolved));
  const metadata = JSON.parse(readFileSync(resolved, 'utf8'));
  const expoRoot = join(fixtureRoot, 'node_modules/expo');
  for (const path of scenePaths)
    ownedWrite(expoRoot, path, readFileSync(join(publishedRoot, path)));
  ownedWrite(
    expoRoot,
    'package.json',
    JSON.stringify({
      name: metadata.name,
      version: metadata.version,
      exports: { './package.json': './package.json' },
    })
  );
  ownedWrite(
    fixtureRoot,
    'candidate/package.json',
    JSON.stringify({ name: 'owned-scene-source-fixture' })
  );
  return { candidate: join(fixtureRoot, 'candidate'), expoRoot, version: metadata.version };
}

function replace(value, key, from, to) {
  expect(value[key].split(from)).toHaveLength(2);
  value[key] = value[key].replace(from, to);
}

describe('native Expo scene source boundary', () => {
  it('derives the reviewed scene successor from exact original template text and retains the floor', () => {
    const value = sourceFixture();
    expect(() => assertAppleSceneContract(value.delegate, value.plist)).not.toThrow();
    expect(value.delegate).toBe(
      readFileSync(join(candidate, 'ios/HelloWorld/AppDelegate.swift'), 'utf8')
    );
    expect(value.plist).toBe(readFileSync(join(candidate, 'ios/HelloWorld/Info.plist'), 'utf8'));
    expect(NATIVE_CONTRACT.ios.deploymentTarget).toBe('16.4');
    const receipt = expectedNativeProvenance(value.manifest);
    expect(receipt).toEqual(
      JSON.parse(readFileSync(join(candidate, 'native-template-provenance.json'), 'utf8'))
    );
    expect(receipt.records.find((record) => record.source === delegateMember).change).toBe(
      'reviewed-expo-scene-support'
    );
  });

  it.each([
    [
      delegateMember,
      'class AppDelegate: ExpoAppDelegate {',
      'class AppDelegate: OtherDelegate {',
      'AppDelegate',
    ],
    [
      delegateMember,
      '    window = UIWindow(frame: UIScreen.main.bounds)',
      '    window = UIWindow()',
      'legacy startup',
    ],
    [delegateMember, '#if os(iOS) || os(tvOS)', '#if os(iOS)', 'legacy startup'],
    [
      plistMember,
      '\t<string>SplashScreen</string>',
      '\t<string>OtherScreen</string>',
      'launch storyboard',
    ],
  ])('rejects a changed scene recipe preimage in %s', (path, from, to, failure) => {
    const manifest = readTemplateManifest(root);
    const original = manifest.members.find((member) => member.path === path).originalText;
    expect(original.split(from)).toHaveLength(2);
    expect(() => transformTemplateMember(path, Buffer.from(original.replace(from, to)))).toThrow(
      failure
    );
  });

  it('refuses an existing scene manifest instead of replacing an unreviewed owner', () => {
    const original = readTemplateManifest(root).members.find(
      (member) => member.path === plistMember
    ).originalText;
    const source = original.replace(
      '\t<key>UILaunchStoryboardName</key>',
      `${SCENE_MANIFEST_XML}\n\t<key>UILaunchStoryboardName</key>`
    );
    expect(source).toContain('UIApplicationSceneManifest');
    expect(() => transformTemplateMember(plistMember, Buffer.from(source))).toThrow(
      'scene manifest already exists'
    );
  });

  it('binds the new AppDelegate original text and rejects old or rewritten provenance', () => {
    const value = sourceFixture();
    const alignment = JSON.parse(readFileSync(join(candidate, 'alignment.json'), 'utf8'));
    const missing = structuredClone(value.manifest);
    delete missing.members.find((member) => member.path === delegateMember).originalText;
    expect(() => assertTemplateManifest(missing, alignment)).toThrow('template member shape');
    const changed = structuredClone(value.manifest);
    changed.members.find((member) => member.path === delegateMember).originalText += '\n';
    expect(() => assertTemplateManifest(changed, alignment)).toThrow(
      'Template original text changed'
    );
    const oldReceipt = structuredClone(expectedNativeProvenance(value.manifest));
    const originalDelegate = value.manifest.members.find((row) => row.path === delegateMember);
    const oldDelegate = oldReceipt.records.find((row) => row.source === delegateMember);
    oldDelegate.change = 'unchanged';
    oldDelegate.targetSha256 = originalDelegate.sha256;
    expect(() => assertNativeProvenance(oldReceipt, value.manifest)).toThrow(
      'Native provenance replay mismatch'
    );
    const oldRecipe = structuredClone(value.manifest);
    const member = oldRecipe.members.find((row) => row.path === delegateMember);
    member.originalText = value.delegate;
    member.bytes = Buffer.byteLength(value.delegate);
    member.sha256 = createHash('sha256').update(value.delegate).digest('hex');
    expect(() => expectedNativeProvenance(oldRecipe)).toThrow(
      'Template scene preimage changed: AppDelegate'
    );
  });

  it.each([
    ['delegate', ', ExpoReactNativeFactoryProvider', '', 'provider'],
    [
      'delegate',
      '    reactNativeFactory = factory',
      '    reactNativeFactory = nil',
      'factory storage',
    ],
    [
      'delegate',
      '    let factory = ExpoReactNativeFactory(delegate: delegate)',
      '    let factory = OtherFactory()',
      'factory creation',
    ],
    [
      'delegate',
      '    reactNativeFactory = factory',
      '    reactNativeFactory = factory\n    factory.startReactNative()',
      'duplicate startup or event owner',
    ],
    [
      'delegate',
      '  var window: UIWindow?',
      '  var window: UIWindow?\n  func scene() {}',
      'duplicate startup or event owner',
    ],
    [
      'delegate',
      '  var window: UIWindow?',
      '  var window: UIWindow?\n  func applicationDidEnterBackground() {}',
      'duplicate startup or event owner',
    ],
    [
      'delegate',
      'return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)',
      'return true',
      'warm URL forwarding',
    ],
    [
      'delegate',
      'return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result',
      'return result',
      'user activity forwarding',
    ],
    [
      'plist',
      '<string>EXExpoAppSceneDelegate</string>',
      '<string>App.SceneDelegate</string>',
      'single-scene manifest',
    ],
    [
      'plist',
      '<key>UIApplicationSupportsMultipleScenes</key>\n\t\t<false/>',
      '<key>UIApplicationSupportsMultipleScenes</key>\n\t\t<true/>',
      'single-scene manifest',
    ],
    [
      'plist',
      '<key>UISceneConfigurations</key>',
      '<key>UISceneConfigurations</key><key>UISceneConfigurations</key>',
      'single-scene manifest',
    ],
  ])('rejects changed scene source owner %s: %s', (key, from, to, failure) => {
    const value = sourceFixture();
    replace(value, key, from, to);
    expect(() => assertAppleSceneContract(value.delegate, value.plist)).toThrow(failure);
  });

  it('reads the actual Expo resolution and requires its default registered module', () => {
    const value = expoFixture();
    expect(
      readExpoSceneSupport(value.candidate, value.version, NATIVE_CONTRACT.module)
    ).toMatchObject({
      version: value.version,
      defaultModule: NATIVE_CONTRACT.module,
      sources: scenePaths.map((path) => ({ path, sha256: expect.stringMatching(/^[a-f\d]{64}$/) })),
    });
    expect(() =>
      readExpoSceneSupport(value.candidate, 'other-version', NATIVE_CONTRACT.module)
    ).toThrow('differs from candidate pin');
    expect(() => readExpoSceneSupport(value.candidate, value.version, 'wrong')).toThrow(
      'default module'
    );
  });

  it.each([
    [
      'ios/AppDelegates/ExpoAppSceneDelegate.swift',
      'url: connectionOptions.urlContexts.first?.url,',
      'url: nil,',
    ],
    ['ios/AppDelegates/SceneEventForwarder.swift', 'if !observer.wasNotified {', 'if true {'],
    [
      'ios/AppDelegates/ExpoAppSceneDelegate.swift',
      'forwarder.didEnterBackground()',
      'forwarder.didBecomeActive()',
    ],
    ['ios/AppDelegates/ExpoReactNativeFactoryProvider.swift', 'return "main"', 'return "other"'],
  ])(
    'rejects reviewed cold-link/deduplication/lifecycle/module source drift in %s',
    (path, from, to) => {
      const value = expoFixture();
      const original = readFileSync(join(value.expoRoot, path), 'utf8');
      expect(original.split(from)).toHaveLength(2);
      ownedWrite(value.expoRoot, path, original.replace(from, to));
      expect(() =>
        readExpoSceneSupport(value.candidate, value.version, NATIVE_CONTRACT.module)
      ).toThrow(`Reviewed Expo scene source changed: ${path}`);
    }
  );
  it(
    'executes actual Apple phase guards with a stubbed native bundle boundary',
    () => {
      const owned = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-apple-phase-control-')));
      fixtureDirectories.push(owned);
      const project = readFileSync(
        join(candidate, 'ios/HelloWorld.xcodeproj/project.pbxproj'),
        'utf8'
      );
      const script = [...project.matchAll(/shellScript = ("(?:[^"\\]|\\.)*");/g)]
        .map((match) => JSON.parse(match[1]))
        .find((source) => source.includes('Candidate bundle phase requires Debug or Release'));
      expect(script).toContain('Candidate Hermes compiler override is forbidden');
      ownedWrite(owned, 'phase.sh', script);
      ownedWrite(owned, 'package.json', JSON.stringify({ type: 'module' }));
      ownedWrite(owned, 'ios/Pods/control.txt', 'owned pod path');
      ownedWrite(owned, 'src/index.ts', readFileSync(join(candidate, 'src/index.ts')));
      for (const [name, version] of [
        ['react-native', '0.86.3'],
        ['expo', '57.0.26'],
        ['hermes-compiler', HERMES_COMPILER_VERSION],
      ]) {
        ownedWrite(owned, `node_modules/${name}/package.json`, JSON.stringify({ name, version }));
      }
      ownedWrite(
        owned,
        'node_modules/expo/scripts/resolveAppEntry.js',
        "console.log(require('path').join(process.argv[1], 'src/index.ts'));\n"
      );
      ownedWrite(
        owned,
        'node_modules/@expo/cli/package.json',
        JSON.stringify({ name: '@expo/cli', main: 'index.js' })
      );
      ownedWrite(owned, 'node_modules/@expo/cli/index.js', '');
      const compiler = join(owned, 'node_modules/hermes-compiler/hermesc/osx-bin/hermesc');
      ownedWrite(
        owned,
        'node_modules/hermes-compiler/hermesc/osx-bin/hermesc',
        '#!/bin/sh\nexit 99\n',
        0o755
      );
      ownedWrite(owned, 'wrong-hermesc', '#!/bin/sh\nexit 99\n', 0o755);
      // The version fixture isolates the selector; exact Node bytes belong to the Release caller.
      const nodeForwarder = `#!/bin/sh
if [ "$1" = --version ]; then
  printf '%s\\n' '${NATIVE_CONTRACT.nodeVersion}'
else
  exec '${process.execPath.replaceAll("'", "'\\''")}' "$@"
fi
`;
      ownedWrite(owned, 'reviewed-version-node', nodeForwarder, 0o755);
      ownedWrite(owned, 'different-node', '#!/bin/sh\nprintf "v22.1.0\\n"\n', 0o755);
      ownedWrite(
        owned,
        'node_modules/react-native/scripts/react-native-xcode.sh',
        'printf "%s\\n" "$BUNDLE_COMMAND|$ENTRY_FILE|$USE_HERMES|$HERMES_CLI_PATH"\n'
      );
      const environment = {
        ...process.env,
        CONFIGURATION: 'Release',
        PROJECT_DIR: join(owned, 'ios'),
        NODE_BINARY: join(owned, 'reviewed-version-node'),
      };
      for (const name of [...APPLE_BUNDLE_OVERRIDES, 'USE_HERMES', 'HERMES_CLI_PATH'])
        delete environment[name];
      const run = (overrides = {}) =>
        spawnSync('/bin/sh', [join(owned, 'phase.sh')], {
          cwd: owned,
          env: { ...environment, ...overrides },
          encoding: 'utf8',
          timeout: PHASE_CHILD_TIMEOUT_MS,
        });
      const expected = `export:embed|${owned}/src/index.ts|true|${compiler}\n`;
      for (const overrides of [
        {},
        { USE_HERMES: 'true' },
        {
          HERMES_CLI_PATH: join(
            owned,
            'ios/Pods/../../node_modules/hermes-compiler/hermesc/osx-bin/hermesc'
          ),
        },
        { EXTRA_COMPILER_ARGS: 'ineffective ambient override' },
      ]) {
        const result = run(overrides);
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toBe(expected);
      }
      for (const name of APPLE_BUNDLE_OVERRIDES) {
        const result = run({ [name]: 'rejecting control' });
        expect(result.status, name).toBe(1);
        expect(result.stderr).toContain('Candidate bundling overrides are forbidden');
        expect(result.stdout).toBe('');
        expect(run().stdout).toBe(expected);
      }
      const debug = run({ CONFIGURATION: 'Debug', SKIP_BUNDLING: '1' });
      expect(debug.status, debug.stderr).toBe(0);
      expect(debug.stdout).toBe(expected);
      const unsupported = run({ CONFIGURATION: 'Profile' });
      expect(unsupported.status).toBe(1);
      expect(unsupported.stderr).toContain('Candidate bundle phase requires Debug or Release');
      expect(unsupported.stdout).toBe('');
      const jsc = run({ USE_HERMES: 'false' });
      expect(jsc.status).toBe(1);
      expect(jsc.stderr).toContain('Candidate requires Hermes');
      const differentNode = run({ NODE_BINARY: join(owned, 'different-node') });
      expect(differentNode.status).toBe(1);
      expect(differentNode.stderr).toContain(
        'Candidate NODE_BINARY must be the reviewed Node version'
      );
      expect(differentNode.stdout).toBe('');
      expect(run().stdout).toBe(expected);
      const substituted = run({ HERMES_CLI_PATH: join(owned, 'wrong-hermesc') });
      expect(substituted.status).toBe(1);
      expect(substituted.stderr).toContain('Candidate Hermes compiler override is forbidden');
      expect(run().stdout).toBe(expected);
    },
    PHASE_CONTROLS_TIMEOUT_MS
  );
});
