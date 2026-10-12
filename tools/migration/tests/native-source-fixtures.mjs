import { join } from 'node:path';
import { expect } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { assertNativeSourceContract } from '../lib/native-source-contract.mjs';
import { readCandidateEntry, readMaintainedNativeFiles } from '../lib/native-source-files.mjs';
import { readTemplateManifest } from '../lib/native-template.mjs';

const root = join(import.meta.dirname, '../../..');
const candidate = join(root, CANDIDATE_DIRECTORY);

export function fixture() {
  return {
    files: readMaintainedNativeFiles(candidate, readTemplateManifest(root)),
    ...readCandidateEntry(candidate),
  };
}

export function assertFixture(value) {
  assertNativeSourceContract(value.files, value.packageManifest, value.indexSource);
}

export function replace(value, path, from, to) {
  const source = value.files.get(path).toString('utf8');
  expect(source).toContain(from);
  value.files.set(path, Buffer.from(source.replace(from, to)));
}
