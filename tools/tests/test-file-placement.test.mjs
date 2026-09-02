import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The two web test tiers split by extension and home: `.test.ts` is a Vitest
// unit test colocated with its subject under web/src (plus the build-time
// modules at the web root), `.spec.ts` is a Playwright spec in web/tests.
// ESLint enforces the vocabulary half (it()/describe() vs test()) by glob, so
// a file in the wrong home silently gets the wrong ruleset — and Vitest and
// Playwright each discover by their own glob, so a misplaced file can simply
// run in no tier at all. This guard closes the placement half.
const repoRoot = join(import.meta.dirname, '..', '..');

function filesUnder(dir, suffix) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => relative(repoRoot, join(entry.parentPath, entry.name)));
}

describe('test file placement', () => {
  it('keeps Playwright .spec.ts files out of web/src', () => {
    expect(filesUnder(join(repoRoot, 'web', 'src'), '.spec.ts')).toEqual([]);
  });

  it('keeps Vitest .test.ts files out of web/tests', () => {
    expect(filesUnder(join(repoRoot, 'web', 'tests'), '.test.ts')).toEqual([]);
  });
});
