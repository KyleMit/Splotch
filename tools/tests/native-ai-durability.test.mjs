import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  readMaintainedNativeFiles,
  readCandidateEntry,
} from '../migration/lib/native-source-files.mjs';
import { readTemplateManifest } from '../migration/lib/native-template.mjs';
import { assertNativeSourceContract } from '../migration/lib/native-source-contract.mjs';
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
const cases = [
  [android, 'recovery(value); recoveryProgress(before, value)', 'recovery(value)'],
  [
    apple,
    '_ = try recovery(value); try recoveryProgress(before, value)',
    '_ = try recovery(value)',
  ],
  [android, 'status.getString("headerExpiresAt") == expiry.toString()', 'true'],
  [apple, 'string(status, "headerExpiresAt") == String(expiry)', 'true'],
  [android, 'expiry.getString("provenance") == "admitted-status-202"', 'true'],
  [apple, 'string(expiry, "provenance") == "admitted-status-202"', 'true'],

  [android, 'recoveryProgress(value, first)', 'Unit'],
  [apple, 'try recoveryProgress(value, first)', 'try checked(true)'],
  [android, 'r.getString("id") == digest(envelope)', 'true'],
  [apple, 'string(r, "id") == hash(envelope)', 'true'],
  [android, 'integer(older, "schema") == integer(newer, "schema")', 'true'],
  [apple, 'integer(older, "schema") == integer(newer, "schema")', 'true'],
  [android, 'a.getString("intent") != "committed" || b.getString("intent") == "committed"', 'true'],
  [apple, 'string(a, "intent") != "committed" || string(b, "intent") == "committed"', 'true'],
  [
    android,
    'expiry.getString("kind") != "known" || same(expiry, b.getJSONObject("expiry"))',
    'true',
  ],
  [apple, 'string(expiry, "kind") != "known" || same(expiry, object(b["expiry"]))', 'true'],
  [android, 'integer(pinned, "schema") == 1L', 'true'],
  [apple, 'integer(pinned, "schema") == 1', 'true'],

  [
    android,
    'maxUploadReply = ((maxUpload + 2) / 3) * 4 + maxJournal',
    'maxUploadReply = maxUpload * 4',
  ],
  [
    apple,
    'maxUploadReply: Int { ((maxUpload + 2) / 3) * 4 + maxJournal }',
    'maxUploadReply: Int { maxUpload * 4 }',
  ],
  [android, 'input.getString("nonce") == pinned.getString("nonce")', 'true'],
  [apple, 'string(input, "nonce") == string(pinned, "nonce")', 'true'],
  [
    android,
    'if (kind in setOf("readPreparedUpload", "readRecoveryUpload")) maxUploadReply else maxJournal',
    'maxUploadReply',
  ],
  [
    apple,
    '["readPreparedUpload", "readRecoveryUpload"].contains(kind) ? self.maxUploadReply : self.maxJournal',
    'self.maxUploadReply',
  ],
  [android, 'val pinned = confirm(dir, latest(dir))', 'val pinned = latest(dir)'],
  [apple, 'let pinned = try confirm(dir, latest(dir))', 'let pinned = try latest(dir)'],
  [android, 'meta.getString("sha256") == digest(bytes)', 'true'],
  [apple, 'string(meta, "sha256") == hash(bytes)', 'true'],
  [android, 'integer(input, "revision") == pinned.getLong("revision")', 'true'],
  [apple, 'integer(input, "revision") == integer(pinned, "revision")', 'true'],
  [android, 'stream.fd.sync()', 'Unit'],
  [android, 'Os.fsync(fd)', 'Unit'],
  [android, 'Os.remove(it.path)', 'Os.unlink(it.path)'],
  [android, 'Os.remove(it.path)', 'it.delete()'],
  [
    android,
    '    fence(dir)\n    return JSONObject().put("receipt", receipt(confirm(dir, latest(dir))))',
    '    Unit\n    return JSONObject().put("receipt", receipt(confirm(dir, latest(dir))))',
  ],
  [android, 'check(OsConstants.S_ISREG(stat.st_mode) && stat.st_nlink == 1L)', 'check(true)'],
  [android, 'stream.channel.lock()', 'stream.channel.tryLock()'],
  [android, 'maxQuota = 128L * 1024 * 1024', 'maxQuota = 129L * 1024 * 1024'],
  [apple, 'fcntl(descriptor, F_FULLFSYNC)', 'fcntl(descriptor, F_GETFD)'],
  [apple, 'flock(descriptor, LOCK_EX)', 'flock(descriptor, LOCK_SH)'],
  [apple, 'maxAttempts = 32', 'maxAttempts = 33'],
  [android, 'confirm(it, latest(it))', 'latest(it)'],
  [apple, 'confirm($0, latest($0))', 'latest($0)'],
  [android, 'receipt(confirm(dir, value))', 'receipt(value)'],
  [apple, 'receipt(confirm(dir, value))', 'receipt(value)'],
  [android, 'receipt(confirm(dir, latest(dir)))', 'receipt(latest(dir))'],
  [apple, 'receipt(confirm(dir, latest(dir)))', 'receipt(latest(dir))'],
];
it.each(cases)(
  'rejects a missing native durability boundary in %s: %s',
  (path, token, replacement) => {
    const files = readMaintainedNativeFiles(
      candidate.pathname.replace(/\/$/, ''),
      readTemplateManifest(root.pathname)
    );
    const { packageManifest, indexSource } = readCandidateEntry(
      candidate.pathname.replace(/\/$/, '')
    );
    expect(() => assertNativeSourceContract(files, packageManifest, indexSource)).not.toThrow();
    const source = files.get(path).toString('utf8');
    expect(source).toContain(token);
    files.set(path, Buffer.from(source.replaceAll(token, replacement)));
    expect(() => assertNativeSourceContract(files, packageManifest, indexSource)).toThrow(
      'journal contract'
    );
  }
);
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
