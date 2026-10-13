import { expect, it } from 'vitest';
import {
  readMaintainedNativeFiles,
  readCandidateEntry,
} from '../migration/lib/native-source-files.mjs';
import { readTemplateManifest } from '../migration/lib/native-template.mjs';
import { assertNativeSourceContract } from '../migration/lib/native-source-contract.mjs';
const root = new URL('../../', import.meta.url).pathname;
const candidate = new URL(
  '../../experiments/native-architecture/',
  import.meta.url
).pathname.replace(/\/$/, '');
const android = 'android/app/src/main/java/art/splotch/migration/probe/SplotchAIEnvironment.kt';
const apple = 'ios/HelloWorld/SplotchAIEnvironment.swift';
const registration = 'ios/HelloWorld/SplotchAIEnvironment.m';
it.each([
  [android, 'confirmed.getString("reference") == reference'],
  [android, 'protectedRecord(name)?.getString("reference") != reference'],
  [android, 'confirmed.getString("value") == value'],
  [android, 'current.getString("reference") == reference'],
  [android, 'check(value == installationValue())'],
  [android, 'SecureRandom().nextBytes(it)'],
  [android, 'cipher.doFinal(plain)'],
  [apple, 'confirmed["reference"] == reference'],
  [apple, 'previous?["reference"] != reference'],
  [apple, 'confirmed["value"] == value'],
  [apple, 'current["reference"] == reference'],
  [apple, 'value == (try self.installationValue())'],
  [apple, 'SecRandomCopyBytes'],
  [apple, 'kSecAttrAccessibleWhenUnlockedThisDeviceOnly'],
  [registration, 'RCT_EXTERN_METHOD(readReferencedCredential:'],
])('rejects a missing secure generation boundary in %s: %s', (path, token) => {
  const files = readMaintainedNativeFiles(candidate, readTemplateManifest(root));
  const { packageManifest, indexSource } = readCandidateEntry(candidate);
  expect(() => assertNativeSourceContract(files, packageManifest, indexSource)).not.toThrow();
  const original = files.get(path).toString('utf8');
  expect(original).toContain(token);
  files.set(path, Buffer.from(original.replaceAll(token, 'omitted_generation_guard')));
  expect(() => assertNativeSourceContract(files, packageManifest, indexSource)).toThrow(
    'vault contract'
  );
});
