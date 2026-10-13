import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const INPUT = new URL('../inputs/native-ai-source-extension.json', import.meta.url);
const INPUT_SHA256 = 'bfc6bf1297653c19a7ed25b9f4c59e229fb85daf57da9bfab5e84719630738bf';
const TARGETS = [
  'android/app/src/main/java/art/splotch/migration/probe/MainApplication.kt',
  'ios/HelloWorld.xcodeproj/project.pbxproj',
  'android/app/src/main/java/art/splotch/migration/probe/SplotchAIEnvironment.kt',
  'ios/HelloWorld/SplotchAIEnvironment.swift',
  'ios/HelloWorld/SplotchAIEnvironment.m',
  'android/app/src/main/java/art/splotch/migration/probe/SplotchAIJournal.kt',
  'ios/HelloWorld/SplotchAIJournal.swift',
];
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
export function readAiSourceExtension() {
  const path = fileURLToPath(INPUT);
  if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== path)
    throw new Error('AI native source extension alias');
  const bytes = readFileSync(path);
  if (sha256(bytes) !== INPUT_SHA256) throw new Error('AI native source recipe changed');
  const value = JSON.parse(bytes);
  if (
    value.schemaVersion !== 1 ||
    value.identity !== 'native-ai-environment-v1' ||
    JSON.stringify(value.entries.map((entry) => entry.target)) !== JSON.stringify(TARGETS)
  )
    throw new Error('AI source inventory changed');
  return value;
}
export function replayAiSourceExtension(target, baseline) {
  const entry = readAiSourceExtension().entries.find((row) => row.target === target);
  if (!entry) return baseline;
  let bytes;
  if (entry.baseline) {
    if (
      !Buffer.isBuffer(baseline) ||
      sha256(baseline) !== entry.baseline.sha256 ||
      !baseline.equals(Buffer.from(entry.baseline.text))
    )
      throw new Error(`AI baseline changed: ${target}`);
    let source = baseline.toString('utf8');
    for (const { before, after } of entry.edits) {
      if (!before || source.split(before).length !== 2)
        throw new Error(`AI source replacement changed: ${target}`);
      source = source.replace(before, after);
    }
    bytes = Buffer.from(source);
  } else {
    if (baseline !== undefined) throw new Error(`AI source addition exists: ${target}`);
    bytes = Buffer.from(entry.text);
  }
  if (sha256(bytes) !== entry.sha256) throw new Error(`AI source output changed: ${target}`);
  return bytes;
}
export function aiNativeAdditionRecords(manifest) {
  const path = 'package/android/app/src/main/java/com/helloworld/MainApplication.kt';
  const member = manifest.members.find((row) => row.path === path);
  if (!member) return [];
  if (member.sha256 !== '48d80b82ca5ff0072a94178634ebf7f8fe6ef7d5991d480fbe0f4140ff1df707')
    throw new Error('AI native template baseline changed');
  return readAiSourceExtension()
    .entries.filter((entry) => !entry.baseline)
    .map((entry) => ({
      source: `native-ai-environment-v1/${entry.target}`,
      sourceSha256: entry.sha256,
      target: entry.target,
      change: 'owned-native-ai-environment-v1',
      targetSha256: entry.sha256,
      mode: '0o644',
    }));
}
