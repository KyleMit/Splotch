import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Agent instructions cite Playwright specs and their helper modules by path —
// "run `npm run test:e2e -- flows.spec.ts -g …`", "`retryOpen` lives in
// tests/helpers.ts". Nothing links the prose to the files, so splitting or
// renaming a spec leaves the citation pointing at a file that no longer
// exists, and the documented command silently selects zero tests (Playwright
// treats the positional arg as a path pattern). That was issue #785: one spec
// split stranded eight citations across two skills.
const repoRoot = join(import.meta.dirname, '..', '..');
const testsDir = join(repoRoot, 'web', 'tests');

// The live instruction surface — what an agent is told is true *now*. Design
// history (skill notes), ADRs, and the audit backlog are deliberately outside
// it: those record what was true at the time and may name a deleted file.
const INSTRUCTION_ROOTS = ['.ruler', '.claude', '.agents'];
const INSTRUCTION_FILENAMES = ['CLAUDE.md', 'AGENTS.md'];
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'skill-notes',
  'build',
  'dist',
  '.gradle',
  '.svelte-kit',
  '.netlify',
  'coverage',
  'test-results',
  'playwright-report',
  'Pods',
  'DerivedData',
]);

function walk(dir, keep, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) walk(join(dir, entry.name), keep, found);
    } else if (keep(entry.name)) {
      found.push(join(dir, entry.name));
    }
  }
  return found;
}

const isMarkdown = (name) => name.endsWith('.md') || name.endsWith('.md.template');

const docs = [
  ...INSTRUCTION_ROOTS.filter((root) => existsSync(join(repoRoot, root))).flatMap((root) =>
    walk(join(repoRoot, root), isMarkdown)
  ),
  ...walk(repoRoot, (name) => INSTRUCTION_FILENAMES.includes(name)),
];

// A contiguous, unquoted, unbracketed token ending in `.ts` — captured greedily
// backwards so a glob or placeholder ("engine-*.spec.ts", "tests/<name>.ts")
// comes back whole and can be rejected as prose rather than silently truncated
// into a bogus filename.
const PATH_TOKEN = /[^\s`'"(),;:|]+\.ts\b/g;
const NOT_A_LITERAL_PATH = /[*<>{}$?]/;
// Either a bare spec basename (the Playwright CLI pattern form) or a path into
// the E2E tree, which also covers the shared helper modules beside the specs.
const CITATION = /^(?:\.\/)?(?:web\/)?(?:tests\/)?([A-Za-z0-9_.-]+\.spec\.ts)$/;
const TREE_PATH = /^(?:\.\/)?(?:web\/)?tests\/([A-Za-z0-9_.\-/]+\.ts)$/;

function citedTestPaths(source) {
  const cited = new Set();
  for (const [token] of source.matchAll(PATH_TOKEN)) {
    if (NOT_A_LITERAL_PATH.test(token)) continue;
    const match = CITATION.exec(token) ?? TREE_PATH.exec(token);
    if (match) cited.add(match[1]);
  }
  return [...cited];
}

describe('agent instructions cite E2E test files that exist', () => {
  it('finds the instruction docs to check', () => {
    expect(docs.length).toBeGreaterThan(0);
    expect(existsSync(testsDir)).toBe(true);
  });

  // Self-check: the matcher must actually resolve real citations, or the suite
  // would pass by finding nothing at all.
  it('resolves at least one real spec citation', () => {
    const cited = docs.flatMap((doc) => citedTestPaths(readFileSync(doc, 'utf8')));

    expect(cited.filter((path) => path.endsWith('.spec.ts')).length).toBeGreaterThan(0);
  });

  it('reads a glob or placeholder as prose, not a citation', () => {
    expect(citedTestPaths('the `engine-*.spec.ts` family and `tests/<name>.spec.ts`')).toEqual([]);
    expect(citedTestPaths('`web/tests/helpers.ts` and `flows-undo-persistence.spec.ts`')).toEqual([
      'helpers.ts',
      'flows-undo-persistence.spec.ts',
    ]);
  });

  for (const doc of docs) {
    const cited = citedTestPaths(readFileSync(doc, 'utf8'));
    if (cited.length === 0) continue;

    it(`${relative(repoRoot, doc).split(sep).join('/')} names only files in web/tests/`, () => {
      const missing = cited.filter((path) => {
        const target = join(testsDir, path);
        return !existsSync(target) || !statSync(target).isFile();
      });

      expect(missing).toEqual([]);
    });
  }
});
