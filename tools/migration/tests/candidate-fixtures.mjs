import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { assertDeclaredCandidateImports, readJson } from '../lib/native-identity.mjs';
const root = join(import.meta.dirname, '../../..');
const candidate = join(root, CANDIDATE_DIRECTORY);
const manifest = readJson(join(candidate, 'package.json'));

export function candidateImport(specifier) {
  return `import ${JSON.stringify(specifier)};`;
}

export function createCandidateFixtures() {
  const fixtures = [];
  function fixture() {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-candidate-imports-')));
    fixtures.push(directory);
    const target = join(directory, 'candidate');
    cpSync(candidate, target, {
      recursive: true,
      filter: (path) => !path.includes('/node_modules'),
    });
    symlinkSync(join(root, 'node_modules'), join(target, 'node_modules'));
    return target;
  }

  function write(candidate, path, source) {
    mkdirSync(dirname(join(candidate, path)), { recursive: true });
    writeFileSync(join(candidate, path), source);
  }

  function expectRejectedMutationAndRestore(candidate, path, source, reason) {
    const original = readFileSync(join(candidate, path), 'utf8');
    write(candidate, path, source);
    expect(() => assertDeclaredCandidateImports(candidate, manifest)).toThrow(reason);
    write(candidate, path, original);
    expect(() => assertDeclaredCandidateImports(candidate, manifest)).not.toThrow();
  }

  return {
    candidate,
    manifest,
    fixture,
    write,
    expectRejectedMutationAndRestore,
    cleanup: () =>
      fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })),
  };
}
