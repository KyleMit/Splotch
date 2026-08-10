import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Agent instructions cite Playwright specs and their helper modules by path —
// "run `npm run test:e2e -- flows.spec.ts -g …`", "`retryOpen` lives in
// tests/helpers.ts". Nothing links the prose to the files, so splitting or
// renaming a spec leaves the citation pointing at a file that no longer
// exists, and the documented command silently selects zero tests (Playwright
// treats the positional arg as a path pattern). That was issue #785: one spec
// split stranded citations across the testing and run-splotch skills.
const repoRoot = join(import.meta.dirname, '..', '..');
const testsDir = join(repoRoot, 'web', 'tests');

// The live instruction surface — what an agent is told is true *now*. `scripts`
// is here for the audit-burndown role prompts, which an agent reads and greps
// exactly like a skill. Design history (skill notes), ADRs, and the audit
// backlog are deliberately outside it: those record what was true at the time
// and may name a deleted file.
//
// Markdown only, so the walk never reaches the synthetic spec names that
// `tools/tests/*.test.mjs` feeds its reporter and comment fixtures — payload
// strings that must stay free to name a file that does not exist, and which no
// pattern distinguishes from a real citation. A source comment needing to show
// a spec path spells it as a `tests/<name>.spec.ts` placeholder instead, so
// there is no agreement for this walk to have missed.
const INSTRUCTION_ROOTS = ['.ruler', '.claude', '.agents', 'scripts'];
const INSTRUCTION_FILENAMES = ['CLAUDE.md', 'AGENTS.md'];

// The reference documents ADR-0107 moved out of the skill trees. Their spec
// citations were inside INSTRUCTION_ROOTS before the move and have to stay
// scanned, but `docs/` as a whole must not join that list — ADRs, the handoffs,
// the scratchpad, and the audit backlog all record what was true at the time and
// may name a deleted spec on purpose.
const REFERENCE_DOCS = [
  'docs/ARCHITECTURE.md',
  'docs/API.md',
  'docs/TESTING.md',
  'docs/PROFILING.md',
  'docs/PROFILING-IPAD.md',
  'docs/MOBILE/native.md',
  'docs/MOBILE/android.md',
  'docs/MOBILE/ios.md',
];
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

// A vanished root must be a loud ENOENT from readdirSync, never a quietly
// narrowed scan: the self-checks below stay green on a partial surface, since
// the CLAUDE.md/AGENTS.md walk alone satisfies both.
const docs = [
  ...new Set([
    ...INSTRUCTION_ROOTS.flatMap((root) => walk(join(repoRoot, root), isMarkdown)),
    ...walk(repoRoot, (name) => INSTRUCTION_FILENAMES.includes(name)),
    // Named, not walked: a moved or renamed reference doc must fail loudly here
    // rather than quietly leaving its citations unscanned.
    ...REFERENCE_DOCS.map((doc) => join(repoRoot, doc)),
  ]),
];

// A contiguous, unquoted, unbracketed token ending in `.ts` — captured greedily
// backwards so a glob or placeholder ("engine-*.spec.ts", "tests/<name>.ts")
// comes back whole and can be rejected as prose rather than silently truncated
// into a bogus filename. The trailing lookahead stands in for `\b`, which would
// not end the token at Markdown emphasis (`_flows.spec.ts_`); it rejects a
// longer extension (`.tsx`, `.ts.snap`) while still letting a sentence-ending
// period close the citation.
const PATH_TOKEN = /[^\s`'"(),;:|]+\.ts(?![A-Za-z0-9]|\.[A-Za-z0-9])/g;
// Markdown wrappers ride along on the ends of the token — strip them, or
// `**flows.spec.ts**` gets written off as a glob and a stale citation sails
// through. A real glob or placeholder has its `*`/`<` in the interior, so the
// rejection below still holds after stripping.
const WRAPPER = /^[*_<]+|[*_>]+$/g;
const NOT_A_LITERAL_PATH = /[*<>{}$?]/;
// Either a bare spec basename (the Playwright CLI pattern form) or a path into
// the E2E tree, which also covers the shared helper modules beside the specs.
// Both anchor on an alphanumeric so a stripped-down `*.spec.ts` can't read as
// a filename.
const CITATION = /^(?:\.\/)?(?:web\/)?(?:tests\/)?([A-Za-z0-9][A-Za-z0-9_.-]*\.spec\.ts)$/;
const TREE_PATH = /^(?:\.\/)?(?:web\/)?tests\/([A-Za-z0-9][A-Za-z0-9_.\-/]*\.ts)$/;

function citedTestPaths(source) {
  const cited = new Set();
  for (const [raw] of source.matchAll(PATH_TOKEN)) {
    const token = raw.replace(WRAPPER, '');
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

  // A root emptied rather than deleted would slip past ENOENT, and the two
  // self-checks below survive on the CLAUDE.md/AGENTS.md walk alone — so each
  // root has to prove it still contributes.
  it.each(INSTRUCTION_ROOTS)('scans %s', (root) => {
    const prefix = join(repoRoot, root) + sep;

    expect(docs.filter((doc) => doc.startsWith(prefix))).not.toHaveLength(0);
  });

  // Self-check: the matcher must actually resolve real citations, or the suite
  // would pass by finding nothing at all.
  it('resolves at least one real spec citation', () => {
    const cited = docs.flatMap((doc) => citedTestPaths(readFileSync(doc, 'utf8')));

    expect(cited.filter((path) => path.endsWith('.spec.ts')).length).toBeGreaterThan(0);
  });

  it('reads a glob or placeholder as prose, not a citation', () => {
    expect(citedTestPaths('the `engine-*.spec.ts` family and `tests/<name>.spec.ts`')).toEqual([]);
    expect(citedTestPaths('a bare `*.spec.ts` glob and `tests/{name}.spec.ts`')).toEqual([]);
    expect(citedTestPaths('a `tests/flows.spec.tsx` and a `tests/helpers.ts.snap`')).toEqual([]);
    expect(citedTestPaths('`web/tests/helpers.ts` and `flows-undo-persistence.spec.ts`')).toEqual([
      'helpers.ts',
      'flows-undo-persistence.spec.ts',
    ]);
  });

  // Emphasis, autolink wrappers, and sentence punctuation are ordinary ways to
  // write a filename in a doc; each must stay a citation rather than degrade
  // into prose the scan skips.
  it.each(['**%s**', '*%s*', '_%s_', '__%s__', '<%s>', 'lives in %s.', 'is it %s?', '%s:31'])(
    'reads %s as a citation, not prose',
    (shape) => {
      const cited = citedTestPaths(shape.replace('%s', 'flows-undo-persistence.spec.ts'));

      expect(cited).toEqual(['flows-undo-persistence.spec.ts']);
    }
  );

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
