import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  readMaintainedNativeFiles,
  readCandidateEntry,
} from '../migration/lib/native-source-files.mjs';
import { readTemplateManifest } from '../migration/lib/native-template.mjs';
import { assertNativeSourceContract } from '../migration/lib/native-source-contract.mjs';
const root = new URL('../../', import.meta.url);
const candidate = new URL('experiments/native-architecture/', root);
const android = 'android/app/src/main/java/art/splotch/migration/probe/SplotchAIJournal.kt';
const apple = 'ios/HelloWorld/SplotchAIJournal.swift';
const cases = [
  [android, 'stream.fd.sync()', 'Unit'],
  [android, 'Os.fsync(fd)', 'Unit'],
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
it('closes the native operation vocabulary and preserves the legacy wire without an ACK caller', () => {
  const storage = readFileSync(new URL('src/platform/durableAiStorage.ts', candidate), 'utf8');
  const vocabulary = storage.match(/type Operation\s*=([\s\S]*?);/)[1];
  expect([...vocabulary.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual([
    'read',
    'prepare',
    'importLegacy',
    'write',
    'retain',
    'pictures',
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
