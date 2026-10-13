import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const INPUT = new URL('../inputs/offline-library-source-extension.json', import.meta.url);
const INPUT_SHA256 = '6adab8cbe6f71984dcd00f4c8a1e8779e60d3cdddca421d229fbea9f04164cfb';
const NATIVE_BASELINE_MEMBERS = [
  [
    'package/android/app/src/main/AndroidManifest.xml',
    '2bb28f4f3e9f37feeaff9e4d3fb63d1cbff962924a91c712b55c6c5fdd114c7c',
  ],
  [
    'package/android/app/src/main/java/com/helloworld/MainApplication.kt',
    '48d80b82ca5ff0072a94178634ebf7f8fe6ef7d5991d480fbe0f4140ff1df707',
  ],
  [
    'package/ios/HelloWorld.xcodeproj/project.pbxproj',
    '7b7cfc31b77069762f4ef9ed4c6f86dd57dd491cfbfdd710168c578ab2e25f8f',
  ],
];
const TARGETS = Object.freeze([
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/java/art/splotch/migration/probe/MainApplication.kt',
  'ios/HelloWorld.xcodeproj/project.pbxproj',
  'src/platform/drawingFiles.ts',
  'src/platform/drawingFiles.web.ts',
  'android/app/src/main/java/art/splotch/migration/probe/SplotchLibraryEnvironment.kt',
  'ios/HelloWorld/SplotchLibraryEnvironment.m',
  'ios/HelloWorld/SplotchLibraryEnvironment.swift',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function readOfflineSourceExtension() {
  const path = fileURLToPath(INPUT);
  if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== path)
    throw new Error('Offline source extension alias');
  const bytes = readFileSync(path);
  if (sha256(bytes) !== INPUT_SHA256) throw new Error('Offline source extension input changed');
  const value = JSON.parse(bytes);
  if (
    value.schemaVersion !== 1 ||
    value.identity !== 'offline-library-v1' ||
    JSON.stringify(value.entries.map((entry) => entry.target)) !== JSON.stringify(TARGETS)
  )
    throw new Error('Offline source extension inventory changed');
  return value;
}

export function replayOfflineSourceExtension(target, baseline) {
  const entry = readOfflineSourceExtension().entries.find((row) => row.target === target);
  if (!entry) return baseline;
  let bytes;
  if (entry.baseline) {
    if (
      !Buffer.isBuffer(baseline) ||
      sha256(baseline) !== entry.baseline.sha256 ||
      !baseline.equals(Buffer.from(entry.baseline.text))
    )
      throw new Error(`Offline source extension baseline changed: ${target}`);
    let source = baseline.toString('utf8');
    for (const { before, after } of entry.edits) {
      if (!before || source.split(before).length !== 2)
        throw new Error(`Offline source extension replacement changed: ${target}`);
      source = source.replace(before, after);
    }
    bytes = Buffer.from(source);
  } else {
    if (baseline !== undefined)
      throw new Error(`Offline source extension addition exists: ${target}`);
    bytes = Buffer.from(entry.text);
  }
  if (sha256(bytes) !== entry.sha256)
    throw new Error(`Offline source extension output changed: ${target}`);
  return bytes;
}

export function offlineNativeAdditionRecords(manifest) {
  const members = NATIVE_BASELINE_MEMBERS.map(([path]) =>
    manifest.members.find((member) => member.path === path)
  );
  if (members.every((member) => !member)) return [];
  if (members.some((member, index) => member?.sha256 !== NATIVE_BASELINE_MEMBERS[index][1]))
    throw new Error('Offline native extension template baseline changed');
  return readOfflineSourceExtension()
    .entries.filter((entry) => !entry.baseline)
    .map((entry) => ({
      source: `offline-library-v1/${entry.target}`,
      sourceSha256: entry.sha256,
      target: entry.target,
      change: 'owned-offline-library-v1',
      targetSha256: entry.sha256,
      mode: '0o644',
    }));
}

export function assertOfflineAdapterBytes(target, actual, retainedBlob) {
  const entry = readOfflineSourceExtension().entries.find((row) => row.target === target);
  const baseline = Buffer.from(entry.baseline.text);
  const blob = createHash('sha1')
    .update(`blob ${baseline.length}\0`)
    .update(baseline)
    .digest('hex');
  if (blob !== retainedBlob || blob !== entry.baseline.gitBlob)
    throw new Error(`Retained N1 adapter baseline changed: ${target}`);
  if (!replayOfflineSourceExtension(target, baseline).equals(actual))
    throw new Error(`Offline adapter extension changed: ${target}`);
}
