import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest defaults every unit test to happy-dom, and per-file DOM setup is the suite's biggest
// fixed cost. Server-only tests opt out with a `@vitest-environment node` docblock, which the
// testing rules state as prose — and prose is why three files under lib/server had drifted back
// onto happy-dom, each paying for an environment it never touched. Nothing reports that: the
// tests pass either way, only slower.
//
// Scoped to lib/server because "needs no DOM" is a judgement call for an arbitrary module, while
// everything under lib/server is server-only by construction. A file here that genuinely needs a
// DOM API would be the surprising thing, and would say so by failing this.
const OPT_OUT = '// @vitest-environment node';
const SERVER_TESTS = join('web', 'src', 'lib', 'server');

function serverTestFiles(repoRoot) {
  return readdirSync(join(repoRoot, SERVER_TESTS), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => relative(repoRoot, join(entry.parentPath, entry.name)));
}

describe('server unit tests', () => {
  it('opt out of the happy-dom environment', () => {
    const repoRoot = join(import.meta.dirname, '..', '..');
    const files = serverTestFiles(repoRoot);
    // A glob that stopped matching would leave this green while enforcing nothing.
    expect(files.length).toBeGreaterThan(15);

    const onHappyDom = files.filter(
      (file) => !readFileSync(join(repoRoot, file), 'utf8').startsWith(OPT_OUT)
    );

    expect(onHappyDom).toEqual([]);
  });
});
