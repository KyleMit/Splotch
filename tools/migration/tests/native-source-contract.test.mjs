import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { c } from 'tar';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { NATIVE_CONTRACT } from '../lib/native-source-contract.mjs';
import { readTemplateManifest, sha256 } from '../lib/native-template.mjs';
import { candidateTemplateTarget } from '../lib/native-template-transforms.mjs';
import { runNativeCandidateCheck } from '../check-native-candidate.mjs';
import { runNativeCandidateMaterialization } from '../materialize-native-candidate.mjs';

import { assertFixture, fixture, replace } from './native-source-fixtures.mjs';

const root = join(import.meta.dirname, '../../..');
const candidate = join(root, CANDIDATE_DIRECTORY);

const RESTRICTIVE_UMASK = 0o077;
const materializerDirectories = [];
const materializerToolPaths = [
  'tools/lib/proc.mjs',
  'tools/lib/native-candidate.mjs',
  'tools/migration/check-native-candidate.mjs',
  'tools/migration/materialize-native-candidate.mjs',
  'tools/migration/lib/archive-inventory.mjs',
  'tools/migration/lib/native-template.mjs',
  'tools/migration/lib/native-template-transforms.mjs',
  'tools/migration/lib/native-source-contract.mjs',
  'tools/migration/lib/native-apple-scene.mjs',
  'tools/migration/lib/native-gemfile.mjs',
  'tools/migration/lib/native-source-files.mjs',
];
const umaskChild = `
import { pathToFileURL } from 'node:url';
const [, entry, mask, ...args] = process.argv;
process.umask(Number(mask));
process.argv = [process.execPath, entry, ...args];
await import(pathToFileURL(entry).href);
`;

afterEach(() =>
  materializerDirectories.splice(0).forEach((path) => rmSync(path, { recursive: true }))
);

function writeMaterializerFixture(fixtureRoot, path, bytes, mode = 0o644) {
  const target = join(fixtureRoot, path);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, bytes, { flag: 'wx', mode });
  chmodSync(target, mode);
}

function fixtureOriginal(member) {
  if (member.originalText !== undefined) return Buffer.from(member.originalText, 'utf8');
  const target = candidateTemplateTarget(member.path);
  if (target) return readFileSync(join(candidate, target));
  if (member.path === 'package/package.json') {
    const { name, version } = readTemplateManifest(root).template;
    return Buffer.from(JSON.stringify({ name, version }));
  }
  return Buffer.from(`omitted fixture member ${member.path}\n`);
}

async function materializerFixture() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'splotch-native-mode-test-'));
  materializerDirectories.push(fixtureRoot);
  const reviewed = readTemplateManifest(root);
  const fixtureManifest = structuredClone(reviewed);
  const archiveRoot = join(fixtureRoot, 'archive-members');
  for (const member of fixtureManifest.members) {
    const bytes = fixtureOriginal(member);
    member.bytes = bytes.length;
    member.sha256 = sha256(bytes);
    writeMaterializerFixture(archiveRoot, member.path, bytes, Number(member.mode));
  }
  const chunks = [];
  for await (const chunk of c(
    { cwd: archiveRoot, gzip: true, portable: true },
    fixtureManifest.members.map((member) => member.path)
  ))
    chunks.push(chunk);
  const archive = Buffer.concat(chunks);
  fixtureManifest.template.integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
  fixtureManifest.archive.bytes = archive.length;
  fixtureManifest.archive.sha256 = sha256(archive);
  const metadataPath = `tools/migration/inputs/${reviewed.template.name}-${reviewed.template.version}.metadata.json.txt`;
  const metadata = JSON.parse(readFileSync(join(root, metadataPath), 'utf8'));
  metadata.dist.integrity = fixtureManifest.template.integrity;
  metadata.dist.fileCount = fixtureManifest.members.length;
  metadata.dist.unpackedSize = fixtureManifest.members.reduce(
    (sum, member) => sum + member.bytes,
    0
  );
  const metadataBytes = Buffer.from(JSON.stringify(metadata));
  fixtureManifest.registryMetadata.sha256 = sha256(metadataBytes);
  const alignment = JSON.parse(readFileSync(join(candidate, 'alignment.json'), 'utf8'));
  alignment.template = fixtureManifest.template;
  writeMaterializerFixture(fixtureRoot, 'package.json', JSON.stringify({ type: 'module' }));
  writeMaterializerFixture(fixtureRoot, metadataPath, metadataBytes);
  writeMaterializerFixture(
    fixtureRoot,
    'tools/migration/inputs/native-template-manifest.json',
    JSON.stringify(fixtureManifest)
  );
  writeMaterializerFixture(
    fixtureRoot,
    `${CANDIDATE_DIRECTORY}/alignment.json`,
    JSON.stringify(alignment)
  );
  for (const path of ['package.json', NATIVE_CONTRACT.entry, 'Gemfile', 'Gemfile.lock'])
    writeMaterializerFixture(
      fixtureRoot,
      `${CANDIDATE_DIRECTORY}/${path}`,
      readFileSync(join(candidate, path))
    );
  for (const path of materializerToolPaths)
    writeMaterializerFixture(fixtureRoot, path, readFileSync(join(root, path)));
  symlinkSync(join(root, 'node_modules'), join(fixtureRoot, 'node_modules'), 'dir');
  writeMaterializerFixture(fixtureRoot, 'template-fixture.tgz', archive);
  return {
    root: fixtureRoot,
    candidate: join(fixtureRoot, CANDIDATE_DIRECTORY),
    archive: join(fixtureRoot, 'template-fixture.tgz'),
  };
}

function runModeChild(value, command, args = []) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      umaskChild,
      join(value.root, `tools/migration/${command}.mjs`),
      String(RESTRICTIVE_UMASK),
      ...args,
    ],
    { cwd: value.root, encoding: 'utf8' }
  );
}

function maintainedModeSnapshot(value) {
  const receipt = JSON.parse(
    readFileSync(join(value.candidate, 'native-template-provenance.json'), 'utf8')
  );
  return receipt.records
    .filter((record) => record.target)
    .map((record) => {
      const path = join(value.candidate, record.target);
      return {
        target: record.target,
        mode: lstatSync(path).mode & 0o777,
        sha256: sha256(readFileSync(path)),
        expectedMode: Number(record.mode),
        expectedSha256: record.targetSha256,
      };
    });
}

describe('native maintained source contract', () => {
  it('reads both actual native projects, registered JS entry and complete transformation receipt', () => {
    expect(() => assertFixture(fixture())).not.toThrow();
    expect(runNativeCandidateCheck([])).toMatchObject({
      sourceContract: true,
      template: { version: '57.0.28' },
      gemfile: {
        lockfile: { path: 'Gemfile.lock', ownership: 'maintained-lock-source' },
        resolvedGemGraphQualified: false,
      },
    });
    expect(NATIVE_CONTRACT.identity).toBe('art.splotch.migration.probe');
  });

  it.each([
    [
      'android/gradle.properties',
      'android.minSdkVersion=24',
      'android.minSdkVersion=26',
      'minSdkVersion',
    ],
    ['android/gradle.properties', 'hermesEnabled=true', 'hermesEnabled=false', 'hermesEnabled'],
    [
      'android/app/build.gradle',
      'namespace "art.splotch.migration.probe"',
      'namespace "art.splotch.app"',
      'Shipping identity',
    ],
    [
      'android/app/build.gradle',
      'minSdkVersion rootProject.ext.minSdkVersion',
      'minSdkVersion 26',
      'Android Release',
    ],
    [
      'android/app/build.gradle',
      'bundleCommand = "export:embed"',
      'bundleCommand = "start"',
      'Android Release',
    ],
    [
      'android/app/build.gradle',
      'signingConfig signingConfigs.candidateRelease',
      'signingConfig signingConfigs.debug',
      'Android Release',
    ],
    ['android/app/build.gradle', 'minifyEnabled true', 'minifyEnabled false', 'Android Release'],
    [
      'android/app/build.gradle',
      'shrinkResources true',
      'shrinkResources false',
      'Android Release',
    ],
    [
      'android/app/build.gradle',
      'proguard-android-optimize.txt',
      'proguard-android.txt',
      'Android Release',
    ],
    [
      'android/gradle.properties',
      'EX_DEV_CLIENT_NETWORK_INSPECTOR=false',
      'EX_DEV_CLIENT_NETWORK_INSPECTOR=true',
      'EX_DEV_CLIENT_NETWORK_INSPECTOR',
    ],
    [
      'ios/HelloWorld.xcodeproj/project.pbxproj',
      'IPHONEOS_DEPLOYMENT_TARGET = 16.4;',
      'IPHONEOS_DEPLOYMENT_TARGET = 17.0;',
      'Apple deployment',
    ],
    [
      'ios/HelloWorld.xcodeproj/project.pbxproj',
      'PRODUCT_BUNDLE_IDENTIFIER = art.splotch.migration.probe;',
      'PRODUCT_BUNDLE_IDENTIFIER = other.app;',
      'Apple identifiers',
    ],
    [
      'ios/HelloWorld.xcodeproj/project.pbxproj',
      NATIVE_CONTRACT.nodeVersion,
      'v22.1.0',
      'Apple Node version',
    ],
    [
      'ios/HelloWorld/AppDelegate.swift',
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      'class AppDelegate: ExpoAppDelegate {',
      'scene contract mismatch: provider',
    ],
    [
      'ios/HelloWorld/AppDelegate.swift',
      'forResource: "main", withExtension: "jsbundle"',
      'forResource: "wrong", withExtension: "jsbundle"',
      'Apple Release bundle',
    ],
    [
      'ios/Podfile',
      ':privacy_file_aggregation_enabled => true',
      ':privacy_file_aggregation_enabled => false',
      'Pod privacy',
    ],
    [
      'ios/Podfile.properties.json',
      '"ios.deploymentTarget": "16.4"',
      '"ios.deploymentTarget": "17.0"',
      'Pod.ios.deploymentTarget',
    ],
  ])('rejects source contract drift in %s: %s', (path, from, to, failure) => {
    const value = fixture();
    replace(value, path, from, to);
    expect(() => assertFixture(value)).toThrow(failure);
  });

  it('rejects permission/query additions, cleartext overlays and ATS exceptions', () => {
    const mutations = [
      [
        'android/app/src/main/AndroidManifest.xml',
        '<application',
        '<uses-permission android:name="android.permission.VIBRATE"/><application',
      ],
      ['android/app/src/main/AndroidManifest.xml', '<application', '<queries/><application'],
      [
        'ios/HelloWorld/Info.plist',
        '<key>NSAllowsLocalNetworking</key>\n\t\t<false/>',
        '<key>NSAllowsLocalNetworking</key>\n\t\t<true/>',
      ],
    ];
    for (const [path, from, to] of mutations) {
      const value = fixture();
      replace(value, path, from, to);
      expect(() => assertFixture(value)).toThrow('Unreviewed');
    }
    const value = fixture();
    value.files.set(
      'android/app/src/debug/AndroidManifest.xml',
      Buffer.from('<application android:usesCleartextTraffic="true"/>')
    );
    expect(() => assertFixture(value)).toThrow('Unreviewed Android manifest overlay');
  });

  it('rejects changed wrapper JAR, distribution URL, type and checksum', () => {
    const wrapper = fixture();
    wrapper.files.set(
      'android/gradle/wrapper/gradle-wrapper.jar',
      Buffer.from('unexpected binary')
    );
    expect(() => assertFixture(wrapper)).toThrow('wrapper JAR changed');
    for (const [from, to] of [
      ['gradle-9.3.1-bin.zip', 'gradle-9.3.1-all.zip'],
      [NATIVE_CONTRACT.gradle.distributionSha256, 'a'.repeat(64)],
      ['https\\://services.gradle.org', 'https\\://other.example'],
    ]) {
      const value = fixture();
      replace(value, 'android/gradle/wrapper/gradle-wrapper.properties', from, to);
      expect(() => assertFixture(value)).toThrow('wrapper.');
    }
  });

  it('rejects template debug keys, local bundle overrides and changed JavaScript registration', () => {
    for (const path of [
      'android/app/debug.keystore',
      'ios/.xcode.env.local',
      'ios/.xcode.env.updates',
    ]) {
      const value = fixture();
      value.files.set(path, Buffer.from('unowned'));
      expect(() => assertFixture(value)).toThrow('Unreviewed native source');
    }
    const value = fixture();
    value.packageManifest.main = 'index.js';
    expect(() => assertFixture(value)).toThrow('JavaScript entry changed');
    value.packageManifest.main = NATIVE_CONTRACT.entry;
    value.indexSource = value.indexSource.replace(
      'registerRootComponent(ProbeApp);',
      'registerRootComponent(OtherApp);'
    );
    expect(() => assertFixture(value)).toThrow('Expo JS registration');
  });

  it('materializes exact source modes under a restrictive child umask and preserves idempotence', async () => {
    const value = await materializerFixture();
    const args = [`--archive=${value.archive}`];
    const parentMask = process.umask();
    const created = runModeChild(value, 'materialize-native-candidate', args);
    expect(created.status, created.stderr).toBe(0);
    expect(JSON.parse(created.stdout)).toMatchObject({ unchanged: false, nativeExecution: false });
    const snapshot = maintainedModeSnapshot(value);
    expect(snapshot.some((row) => row.expectedMode === 0o755)).toBe(true);
    for (const row of snapshot) {
      expect(row.mode, row.target).toBe(row.expectedMode);
      expect(row.sha256, row.target).toBe(row.expectedSha256);
    }
    const checked = runModeChild(value, 'check-native-candidate');
    expect(checked.status, checked.stderr).toBe(0);
    expect(JSON.parse(checked.stdout)).toMatchObject({ sourceContract: true });
    const receipt = readFileSync(join(value.candidate, 'native-template-provenance.json'));
    const repeated = runModeChild(value, 'materialize-native-candidate', args);
    expect(repeated.status, repeated.stderr).toBe(0);
    expect(JSON.parse(repeated.stdout)).toMatchObject({ unchanged: true, nativeExecution: false });
    expect(maintainedModeSnapshot(value)).toEqual(snapshot);
    expect(readFileSync(join(value.candidate, 'native-template-provenance.json'))).toEqual(receipt);
    const wrapper = join(value.candidate, 'android/gradlew');
    chmodSync(wrapper, 0o600);
    const existing = maintainedModeSnapshot(value);
    const refused = runModeChild(value, 'materialize-native-candidate', args);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('Maintained native source changed');
    expect(lstatSync(wrapper).mode & 0o777).toBe(0o600);
    expect(maintainedModeSnapshot(value)).toEqual(existing);
    expect(readFileSync(join(value.candidate, 'native-template-provenance.json'))).toEqual(receipt);
    expect(process.umask()).toBe(parentMask);
  });

  it('rejects missing exact-mode assignment at the producer postcondition', async () => {
    const value = await materializerFixture();
    const command = join(value.root, 'tools/migration/materialize-native-candidate.mjs');
    const source = readFileSync(command, 'utf8');
    const assignment = '    fchmodSync(descriptor, file.mode);\n';
    expect(source.split(assignment)).toHaveLength(2);
    writeFileSync(command, source.replace(assignment, ''));
    const created = runModeChild(value, 'materialize-native-candidate', [
      `--archive=${value.archive}`,
    ]);
    expect(created.status).toBe(1);
    expect(created.stderr).toContain('Materialized native mode changed:');
    expect(lstatSync(join(value.candidate, 'android/gradlew')).mode & 0o777).toBe(0o700);
    expect(lstatSync(join(value.candidate, 'TEMPLATE-LICENSE')).mode & 0o777).toBe(0o600);
    const checked = runModeChild(value, 'check-native-candidate');
    expect(checked.status, checked.stderr).toBe(0);
    const repeated = runModeChild(value, 'materialize-native-candidate', [
      `--archive=${value.archive}`,
    ]);
    expect(repeated.status).toBe(1);
    expect(repeated.stderr).toContain('Materialized native mode changed:');
  });

  it('requires the actual checker Expo source guard and exposes its removal with a poisoned fixture', async () => {
    const value = await materializerFixture();
    const materialized = runModeChild(value, 'materialize-native-candidate', [
      '--archive',
      value.archive,
    ]);
    expect(materialized.status).toBe(0);
    const resolved = createRequire(join(candidate, 'package.json')).resolve('expo/package.json');
    const published = dirname(resolved);
    const metadata = JSON.parse(readFileSync(resolved, 'utf8'));
    const expo = join(value.candidate, 'node_modules/expo');
    writeMaterializerFixture(
      expo,
      'package.json',
      JSON.stringify({
        name: 'expo',
        version: metadata.version,
        exports: { './package.json': './package.json' },
      })
    );
    for (const path of [
      'ExpoAppSceneDelegate.swift',
      'ExpoReactNativeFactoryProvider.swift',
      'SceneEventForwarder.swift',
    ])
      writeMaterializerFixture(
        expo,
        `ios/AppDelegates/${path}`,
        readFileSync(join(published, 'ios/AppDelegates', path))
      );
    const positive = runModeChild(value, 'check-native-candidate');
    expect(positive.status).toBe(0);
    expect(JSON.parse(positive.stdout)).toMatchObject({
      expoSceneSources: { defaultModule: NATIVE_CONTRACT.module },
    });
    const forwarder = join(expo, 'ios/AppDelegates/SceneEventForwarder.swift');
    const original = readFileSync(forwarder, 'utf8');
    expect(original.split('if !observer.wasNotified {')).toHaveLength(2);
    writeFileSync(forwarder, original.replace('if !observer.wasNotified {', 'if true {'));
    const refused = runModeChild(value, 'check-native-candidate');
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(
      'Reviewed Expo scene source changed: ios/AppDelegates/SceneEventForwarder.swift'
    );
    const checker = join(value.root, 'tools/migration/check-native-candidate.mjs');
    const source = readFileSync(checker, 'utf8');
    const call =
      /const expoSceneSources = readExpoSceneSupport\(\s*candidate,\s*packageManifest\.devDependencies\?\.expo,\s*NATIVE_CONTRACT\.module,?\s*\);/g;
    expect([...source.matchAll(call)]).toHaveLength(1);
    writeFileSync(
      checker,
      source.replace(call, 'const expoSceneSources = { guardRemoved: true };')
    );
    const inverted = runModeChild(value, 'check-native-candidate');
    expect(inverted.status).toBe(0);
    expect(JSON.parse(inverted.stdout)).toMatchObject({
      sourceContract: true,
      expoSceneSources: { guardRemoved: true },
    });
  });

  it('rejects unknown public flags before materialization or source reads', async () => {
    expect(() => runNativeCandidateCheck(['--repair'])).toThrow('takes no arguments');
    await expect(runNativeCandidateMaterialization(['--repair'])).rejects.toThrow('Unknown option');
    await expect(runNativeCandidateMaterialization([])).rejects.toThrow('Specify one');
    await expect(runNativeCandidateMaterialization(['--archive=a', '--archive=b'])).rejects.toThrow(
      'Specify one'
    );
    expect(readFileSync(join(candidate, 'package.json'), 'utf8')).not.toContain('prebuild');
  });

  it('runs the actual source-check CLI and reports flag errors with a failing exit', () => {
    const command = join(root, 'tools/migration/check-native-candidate.mjs');
    const valid = spawnSync(process.execPath, [command], { cwd: root, encoding: 'utf8' });
    expect(valid.status, valid.stderr).toBe(0);
    expect(JSON.parse(valid.stdout)).toMatchObject({ sourceContract: true });
    const invalid = spawnSync(process.execPath, [command, '--repair'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('takes no arguments');
    const materializer = spawnSync(
      process.execPath,
      [join(root, 'tools/migration/materialize-native-candidate.mjs'), '--repair'],
      { cwd: root, encoding: 'utf8' }
    );
    expect(materializer.status).toBe(1);
    expect(materializer.stderr).toContain('Unknown option');
  });
});
