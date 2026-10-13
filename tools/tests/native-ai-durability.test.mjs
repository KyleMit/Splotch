import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  RECOVERY_ADMISSION_AGE_MS,
  RECOVERY_FUTURE_SKEW_MS,
  RECOVERY_TTL_MS,
} from '../../web/src/lib/ai/generationAttempt.ts';
import { JOB_TTL_MS } from '../../experiments/native-architecture/src/ai/contract.ts';
const root = new URL('../../', import.meta.url);
const candidate = new URL('experiments/native-architecture/', root);
const android = 'android/app/src/main/java/art/splotch/migration/probe/SplotchAIJournal.kt';
const apple = 'ios/HelloWorld/SplotchAIJournal.swift';
it('closes the transitive native operation vocabulary and preserves the legacy generation wire', () => {
  const storage = readFileSync(new URL('src/platform/durableAiStorage.ts', candidate), 'utf8');
  const vocabulary = storage.match(/type Operation\s*=([\s\S]*?);/)[1];
  expect(vocabulary).toContain('RecoveryStorageOperation');
  const recoveryStorage = readFileSync(
    new URL('src/platform/aiRecoveryStorage.native.ts', candidate),
    'utf8'
  );
  const recoveryVocabulary = recoveryStorage.match(
    /type RecoveryStorageOperation\s*=([\s\S]*?);/
  )[1];
  expect([...recoveryVocabulary.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual([
    'prepareRecoverySendFromHeld',
    'markRecoverySubmission',
    'readRecoveryUpload',
    'recordRecoveryAdmission',
    'recordRecoveryTerminal',
    'retainRecoveryResult',
    'recordAck',
    'readRecoveryAttempt',
  ]);
  expect([...vocabulary.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual([
    'read',
    'prepare',
    'importLegacy',
    'write',
    'retain',
    'pictures',
    'readPreparedUpload',
    'prepareRecovery',
    'commitRecoveryIntent',
    'recordRecoveryStatus',
  ]);
  expect(storage).not.toContain('file.write(');
  expect(storage).not.toContain('file.move(');
  const generation = readFileSync(new URL('src/ai/generation.ts', candidate), 'utf8');
  expect(generation).toContain('await this.persistPrepared(journal, prepared)');
  expect(generation).not.toMatch(/acknowledge|generation-result-ack|X-Recovery/);
  for (const path of [android, apple]) {
    const source = readFileSync(new URL(path, candidate), 'utf8');
    expect(source).toContain('splotch-ai-pictures-v1');
    expect(source).toContain('maxLegacy = 256');
    expect(source).toContain('drop');
    expect(source).toContain('original.bin');
    expect(source).toContain('upload.bin');
    expect(source).not.toMatch(/readCredential|writeCredential|apiKey|accessCode/);
  }
});

it('pins native original-expiry interval to the actual recovery protocol skew without local-clock admission', () => {
  const protocol = readFileSync(new URL('src/ai/recoveryContract.ts', candidate), 'utf8');
  expect(protocol).toMatch(/from '(?:\.\.\/){4}web\/src\/lib\/ai\/generationAttempt'/);
  expect(protocol).toContain('RECOVERY_ADMISSION_AGE_MS as ADMISSION_AGE_MS');
  expect(protocol).toContain('RECOVERY_FUTURE_SKEW_MS as FUTURE_SKEW_MS');
  expect(RECOVERY_ADMISSION_AGE_MS).toBe(60_000);
  expect(RECOVERY_FUTURE_SKEW_MS).toBe(30_000);
  expect(RECOVERY_TTL_MS).toBe(1_200_000);
  expect(JOB_TTL_MS).toBe(RECOVERY_TTL_MS);
  expect(RECOVERY_TTL_MS - RECOVERY_FUTURE_SKEW_MS).toBe(1_170_000);
  expect(RECOVERY_TTL_MS + RECOVERY_ADMISSION_AGE_MS).toBe(1_260_000);
  for (const path of [android, apple]) {
    const source = readFileSync(new URL(path, candidate), 'utf8');
    expect(source).toContain('splotch-ai-recovery-v1');
    expect(source).toMatch(/minimumRecoveryExpiryDeltaMs(?:: Int64)? = 1170000L?/);
    expect(source).toMatch(/maximumRecoveryExpiryDeltaMs(?:: Int64)? = 1260000L?/);
    expect(source).toContain('recovery-held');
  }
});
