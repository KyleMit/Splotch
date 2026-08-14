import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The redteam and model-eval harnesses build their corpus paths as strings
// (`join(ROOT, 'tools', 'redteam')`), not import specifiers, so
// tool-specifier-resolution.test.mjs cannot see them. Both are excluded from
// `npm test` because they make real paid model calls, which leaves their paths
// exercised only during a run someone pays for — the ADR-0108 migration pointed
// all five of these bases at a deleted tree and every gate stayed green.
//
// These assertions are cheap because they check the committed half only: the
// encrypted fixtures and the tracked gen__* inputs. The plaintext and output
// trees are gitignored by design (ADR-0023) and must not be asserted here.
const repoRoot = join(import.meta.dirname, '..', '..');

/**
 * The repo-relative directory a `const <name> = join(ROOT, …)` line builds.
 * Accepts both spellings the harnesses use — segment-per-argument and one
 * slash-joined string.
 */
function declaredBase(file, name) {
  const source = readFileSync(join(repoRoot, file), 'utf8');
  const match = source.match(new RegExp(String.raw`const ${name} = join\(ROOT,\s*([^)]+)\)`));
  expect(match, `${file} no longer declares ${name} as a join(ROOT, …)`).not.toBeNull();
  return match[1]
    .split(',')
    .map((segment) => segment.trim().replace(/^['"]|['"]$/g, ''))
    .join('/');
}

describe('redteam corpus (ADR-0023)', () => {
  const bases = [
    ['tools/redteam/run-safety-evaluation.mjs', 'BASE_DIR'],
    ['tools/redteam/manage-encrypted-fixtures.mjs', 'BASE'],
  ].map(([file, name]) => ({ file, base: declaredBase(file, name) }));

  it.each(bases)('$file points at a directory that exists', ({ base }) => {
    expect(existsSync(join(repoRoot, base))).toBe(true);
  });

  it('agrees on one base across the runner and the fixture tool', () => {
    expect(new Set(bases.map(({ base }) => base)).size).toBe(1);
  });

  it('finds the committed encrypted fixtures under that base', () => {
    const encrypted = join(repoRoot, bases[0].base, 'encrypted');
    expect(readdirSync(encrypted).filter((name) => name.endsWith('.enc')).length).toBeGreaterThan(
      0
    );
  });
});

describe('model-eval corpus', () => {
  const bases = [
    ['tools/model-eval/run-model-evaluation.mjs', 'BASE'],
    ['tools/model-eval/gen-model-fixtures.mjs', 'OUT'],
    ['tools/model-eval/gen-model-inputs.mjs', 'OUT'],
  ].map(([file, name]) => ({ file, base: declaredBase(file, name) }));

  it.each(bases)('$file points at a directory that exists', ({ base }) => {
    expect(existsSync(join(repoRoot, base))).toBe(true);
  });

  it('has the two generators writing where the runner reads', () => {
    const [runner, ...generators] = bases;
    for (const { file, base } of generators) {
      expect(base, `${file} writes outside the runner's corpus`).toBe(`${runner.base}/inputs`);
    }
  });

  // Both authored prefixes are tracked because neither is reproducible: a rerun
  // of the generator draws different art. The deterministic fixtures under the
  // other prefixes are gitignored and rebuilt on demand.
  it.each(['gen__', 'line__'])('finds the tracked %s inputs under that base', (prefix) => {
    const inputs = join(repoRoot, bases[1].base);
    expect(readdirSync(inputs).filter((name) => name.startsWith(prefix)).length).toBeGreaterThan(0);
  });
});
