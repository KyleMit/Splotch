import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aiNativeAdditionRecords, readAiSourceExtension } from './native-ai-source-extension.mjs';
import {
  offlineNativeAdditionRecords,
  readOfflineSourceExtension,
} from './offline-library-source-extension.mjs';

const INPUT = new URL('../inputs/native-product-source-extension.json', import.meta.url);
const INPUT_SHA256 = 'bf8fe490c10d8747f5ba12ed911f20342e94e4ffe08acb1f711595a66b1de03a';
const TARGETS = [
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/java/art/splotch/migration/probe/MainApplication.kt',
  'ios/HelloWorld.xcodeproj/project.pbxproj',
  'src/platform/drawingFiles.ts',
  'src/platform/drawingFiles.web.ts',
  'android/app/src/main/java/art/splotch/migration/probe/SplotchLibraryEnvironment.kt',
  'ios/HelloWorld/SplotchLibraryEnvironment.m',
  'ios/HelloWorld/SplotchLibraryEnvironment.swift',
  'android/app/src/main/java/art/splotch/migration/probe/SplotchAIEnvironment.kt',
  'ios/HelloWorld/SplotchAIEnvironment.swift',
  'ios/HelloWorld/SplotchAIEnvironment.m',
  'android/app/src/main/java/art/splotch/migration/probe/SplotchAIJournal.kt',
  'ios/HelloWorld/SplotchAIJournal.swift',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function readProductSourceExtension() {
  const path = fileURLToPath(INPUT);
  if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== path)
    throw new Error('Product source extension alias');
  const bytes = readFileSync(path);
  if (sha256(bytes) !== INPUT_SHA256) throw new Error('Product source recipe changed');
  const value = JSON.parse(bytes);
  if (
    value.schemaVersion !== 1 ||
    value.identity !== 'native-product-composition-v1' ||
    JSON.stringify(value.entries.map((entry) => entry.target)) !== JSON.stringify(TARGETS)
  )
    throw new Error('Product source inventory changed');
  const originals = [...readOfflineSourceExtension().entries, ...readAiSourceExtension().entries];
  for (const entry of value.entries) {
    const sources = originals.filter((source) => source.target === entry.target);
    if (sources.length === 0) throw new Error(`Product source origin missing: ${entry.target}`);
    for (const source of sources) {
      if (
        source.baseline?.sha256 !== entry.baseline?.sha256 ||
        source.baseline?.text !== entry.baseline?.text ||
        (source.baseline?.gitBlob && source.baseline.gitBlob !== entry.baseline?.gitBlob)
      )
        throw new Error(`Product source baseline ownership changed: ${entry.target}`);
    }
    if (sources.length === 1 && JSON.stringify(sources[0]) !== JSON.stringify(entry))
      throw new Error(`Product source body ownership changed: ${entry.target}`);
  }
  return value;
}

export function replayProductSourceExtension(target, baseline) {
  const entry = readProductSourceExtension().entries.find((row) => row.target === target);
  if (!entry) return baseline;
  let bytes;
  if (entry.baseline) {
    if (
      !Buffer.isBuffer(baseline) ||
      sha256(baseline) !== entry.baseline.sha256 ||
      !baseline.equals(Buffer.from(entry.baseline.text))
    )
      throw new Error(`Product source baseline changed: ${target}`);
    let source = baseline.toString('utf8');
    for (const { before, after } of entry.edits) {
      if (!before || source.split(before).length !== 2)
        throw new Error(`Product source replacement changed: ${target}`);
      source = source.replace(before, after);
    }
    bytes = Buffer.from(source);
  } else {
    if (baseline !== undefined) throw new Error(`Product source addition exists: ${target}`);
    bytes = Buffer.from(entry.text);
  }
  if (sha256(bytes) !== entry.sha256) throw new Error(`Product source output changed: ${target}`);
  return bytes;
}

export function productNativeAdditionRecords(manifest) {
  const records = [...offlineNativeAdditionRecords(manifest), ...aiNativeAdditionRecords(manifest)];
  const targets = new Set();
  const entries = readProductSourceExtension().entries;
  for (const record of records) {
    const entry = entries.find((entry) => entry.target === record.target);
    if (
      targets.has(record.target) ||
      !entry ||
      entry.baseline ||
      entry.sha256 !== record.targetSha256
    )
      throw new Error(`Product native addition ownership changed: ${record.target}`);
    targets.add(record.target);
  }
  return records;
}
