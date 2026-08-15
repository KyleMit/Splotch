import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';

// A relative specifier that points nowhere is not always an error, so moving a
// file between directory depths breaks these two ways silently:
//
//   vi.mock('<path that no longer exists>')  — mocks nothing, no warning. The
//     suite stays green while the test exercises the real module; during the
//     ADR-0108 migration this had the perf tests running real production builds.
//   join(import.meta.dirname, '..', '..')    — resolves to *a* directory, just
//     the wrong one, so reads fail far from the cause (or silently find nothing).
//
// Both are the same family as web/tests' engine-harness import guard
// (tools/tests/e2e-harness-imports.test.mjs): wrong without being an error, and
// a green suite is exactly the evidence used to conclude a move was clean.
const repoRoot = join(import.meta.dirname, '..', '..');

// Package with its own suite and layout conventions.
const SEPARATELY_CONFIGURED = /^tools\/asset-gen\//;

// Synthetic diff fixtures: opaque strings fed to the audit-burndown diff parser,
// deliberately naming files that do not exist. The second row is this file's
// own positive-control table below, which the repo scan otherwise reads as
// broken imports.
const FIXTURE_SPECIFIERS = new Set([
  ...['./folderSaveSupport', './foo', './lazy', './x', './y'],
  ...['./x.mjs', '../lib/y.mjs', './z.mjs', './dyn.mjs', '../mocked.mjs', './asset.bin'],
]);

const toolFiles = execFileSync('git', ['ls-files', 'tools'], { cwd: repoRoot, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((path) => path.endsWith('.mjs') && !SEPARATELY_CONFIGURED.test(path));

// `import\s*` last so the dynamic-import alternative gets first claim on its
// paren; what it adds is the bare side-effect form (`import './x.mjs'`), which
// has no `from` and slipped every check here until the 2026-08-15 kill-check.
const RELATIVE_SPECIFIER =
  /(?:from\s*|import\s*\(\s*|vi\.(?:mock|doMock|unmock)\(\s*|new URL\(\s*|import\s*)(['"])(\.\.?\/[^'"]*)\1/g;

/**
 * Source with whole-line comments removed. Prose quoting a specifier — including
 * this file's own explanation of the `?query` case — is documentation, not a
 * module reference. Only full-line comments are dropped, so no code can be.
 */
function code(file) {
  return readFileSync(join(repoRoot, file), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

/** Every relative specifier in `file`, paired with the repo path it resolves to. */
function resolvedSpecifiers(file) {
  return [...code(file).matchAll(RELATIVE_SPECIFIER)]
    .map((match) => match[2])
    .filter((spec) => !FIXTURE_SPECIFIERS.has(spec))
    .map((spec) => ({
      spec,
      // Strip any '?query' — import('./x.mjs?fresh') is a cache-buster, not part
      // of the path.
      target: normalize(join(dirname(file), spec.split('?')[0])),
    }));
}

// Positive control for the extraction itself: the guards below scan whatever
// the tree happens to contain, so a form no tracked file currently uses can
// drop out of RELATIVE_SPECIFIER without a failure — which is exactly how the
// bare side-effect import went unguarded until the issue-1066 kill-check.
describe('RELATIVE_SPECIFIER extracts every specifier-carrying form', () => {
  it.each([
    ['a bare side-effect import', `import './x.mjs';`, './x.mjs'],
    ['a from import', `import { a } from '../lib/y.mjs';`, '../lib/y.mjs'],
    ['a re-export', `export { b } from './z.mjs';`, './z.mjs'],
    ['a dynamic import', `const m = await import('./dyn.mjs');`, './dyn.mjs'],
    ['a vi.mock path', `vi.mock('../mocked.mjs', () => ({}));`, '../mocked.mjs'],
    ['a new URL path', `new URL('./asset.bin', import.meta.url)`, './asset.bin'],
  ])('%s', (_label, source, specifier) => {
    expect([...source.matchAll(RELATIVE_SPECIFIER)].map((match) => match[2])).toEqual([specifier]);
  });

  it('ignores package specifiers, which resolve through node_modules', () => {
    expect([...`import 'vitest';`.matchAll(RELATIVE_SPECIFIER)]).toEqual([]);
  });
});

describe('relative specifiers under tools/', () => {
  it.each(toolFiles)('%s resolves every relative specifier', (file) => {
    const broken = resolvedSpecifiers(file).filter(
      ({ target }) =>
        !existsSync(join(repoRoot, target)) &&
        !existsSync(join(repoRoot, `${target}.mjs`)) &&
        !existsSync(join(repoRoot, `${target}.js`))
    );

    expect(broken.map(({ spec, target }) => `${spec} -> ${target}`)).toEqual([]);
  });
});

describe('tools/lib is the dependency foundation', () => {
  // ADR-0108's owned-vs-shared split rests on this direction: a shared module
  // reaching back into a capability folder makes tools/lib the grab bag the
  // split exists to prevent, and does it one import at a time.
  it.each(toolFiles.filter((file) => /^tools\/lib\/[^/]+\.mjs$/.test(file)))(
    '%s imports no capability module',
    (file) => {
      const reaching = resolvedSpecifiers(file)
        .filter(({ target }) => target !== 'tools/lib' && !target.startsWith('tools/lib/'))
        .map(({ spec }) => spec);

      expect(reaching).toEqual([]);
    }
  );
});

describe('repo-root walks under tools/', () => {
  // `package.json` naming the app is the marker: any wrong number of '..' lands
  // somewhere without it (or outside the repo entirely).
  const isRepoRoot = (path) => {
    const manifest = join(repoRoot, path, 'package.json');
    return existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === 'splotch';
  };

  // Both spellings of "this file's directory". tools/lib/proc.mjs — whose ROOT
  // most of the tooling imports — uses the second, so a guard that knows only
  // the first covers every file except the one that matters.
  const HERE = String.raw`(?:import\.meta\.dirname|dirname\(fileURLToPath\(import\.meta\.url\)\))`;

  // Only a walk the closing paren ends is a root: `join(HERE, '..', 'sheet.html')`
  // is a path *through* a parent, not a claim about where the repo starts.
  const walkers = toolFiles.flatMap((file) => {
    const source = code(file);
    const walks = [
      ...source.matchAll(new RegExp(String.raw`join\(\s*${HERE}((?:,\s*'\.\.')+)\s*\)`, 'g')),
      ...source.matchAll(new RegExp(String.raw`resolve\(\s*${HERE},\s*'((?:\.\.\/?)+)'\s*\)`, 'g')),
    ].map((match) => (match[1].match(/\.\./g) ?? []).length);
    return walks.map((ups) => ({ file, ups }));
  });

  it('finds the walks it is meant to guard, in both spellings', () => {
    expect(walkers.length).toBeGreaterThan(0);
    // Named explicitly: this is the walk whose omission the guard was blind to,
    // and a sentinel counting only totals would not have noticed.
    expect(walkers.map(({ file }) => file)).toContain('tools/lib/proc.mjs');
  });

  it.each(walkers)('$file walks $ups levels to the repo root', ({ file, ups }) => {
    expect(isRepoRoot(join(dirname(file), ...Array(ups).fill('..')))).toBe(true);
  });
});
