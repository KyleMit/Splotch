import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The /dev/engine harness supplies its navigate-and-wait-for-readiness step as
// a `page` fixture override on the `test` it exports (web/tests/engine-harness.ts).
// A spec that pulls in a harness helper but takes `test` from '@playwright/test'
// gets no navigation at all and runs against about:blank — the failure mode
// behind issue #624, which reads as flake because it only bites when another
// engine spec loaded the (module-cached) harness first in the same worker.
//
// Regex-level on purpose: no TypeScript parser runs in this Node-only suite,
// and these specs' imports are dprint-formatted at the top of the file.
const repoRoot = join(import.meta.dirname, '..', '..');
const testsDir = join(repoRoot, 'web', 'tests');
const HARNESS_MODULE = './engine-harness';

const specs = readdirSync(testsDir)
  .filter((name) => name.endsWith('.spec.ts'))
  .map((name) => ({ name, source: readFileSync(join(testsDir, name), 'utf8') }));

/** Named bindings a file imports from `module`, or null when it doesn't import it. */
function importedBindings(source, module) {
  const match = source.match(new RegExp(String.raw`import \{([^}]*)\} from '${module}';`, 's'));
  if (!match) return null;
  return match[1]
    .split(',')
    .map((binding) => binding.trim())
    .filter(Boolean);
}

const harnessSpecs = specs.filter(({ source }) => source.includes(`from '${HARNESS_MODULE}'`));

describe('engine harness specs', () => {
  it('finds the harness specs to check', () => {
    expect(harnessSpecs.length).toBeGreaterThan(0);
  });

  for (const { name, source } of harnessSpecs) {
    it(`${name} takes test from the harness, not @playwright/test`, () => {
      expect(importedBindings(source, HARNESS_MODULE)).toContain('test');
      expect(importedBindings(source, '@playwright/test') ?? []).not.toContain('test');
    });
  }
});
