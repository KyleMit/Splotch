import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ASSET_GEN_DIR, REPO_ROOT, toPosix } from '../lib/asset-paths.mjs';

// The shipping pipeline stays extractable (docs/architecture.md): every module it
// loads is its own, an installed package, or a web/src module listed in README.md's
// coupling table. That table is the allowlist this suite enforces in both
// directions, so it cannot drift from the code the way it once did.
//
// The folders CLAUDE.md places outside the shipping pipeline are not bound:
// crayon-reference/ imports the shared tools/ libraries by design, and legacy/ and
// ideas-exploration/ are retired, frozen code.
const EXEMPT_DIRS = ['crayon-reference/', 'legacy/', 'ideas-exploration/'];
const COUPLING_HEADING = '### The one coupling to the app';
const README_PATH = join(ASSET_GEN_DIR, 'README.md');

const PATH_SPECIFIER = /^\.{1,2}\/|^\//;

// Module specifiers from the syntax tree, so strings and comments that merely
// mention a path are ignored and a template-literal import() is not. A dynamic
// import whose specifier is computed yields null: it cannot be checked.
function specifiers(source) {
  const found = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      found.push(argument && ts.isStringLiteralLike(argument) ? argument.text : null);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile('module.ts', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS));
  return found;
}

function documentedCoupling(readme) {
  const lines = readme.split('\n');
  const headingIndex = lines.indexOf(COUPLING_HEADING);
  if (headingIndex === -1) throw new Error(`README.md has no "${COUPLING_HEADING}" section`);
  const rows = [];
  for (const line of lines.slice(headingIndex + 1)) {
    if (line.startsWith('|')) rows.push(line);
    else if (rows.length) break;
  }
  const codeSpans = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  return new Map(
    rows.slice(2).map((row) => {
      const [[module], importers] = row.split('|').slice(1, 3).map(codeSpans);
      return [module, new Set(importers)];
    })
  );
}

/** Each file is `{ path, source }`, with `path` relative to tools/asset-gen. */
function boundaryViolations(files, documented) {
  const violations = [];
  const imported = new Map();
  for (const { path, source } of files) {
    const found = specifiers(source);
    if (found.includes(null)) {
      violations.push(`${path} has an import() with a computed specifier, which cannot be checked`);
    }
    for (const spec of found.filter((s) => s !== null && PATH_SPECIFIER.test(s))) {
      const target = toPosix(relative(REPO_ROOT, join(ASSET_GEN_DIR, dirname(path), spec)));
      if (target.startsWith('tools/asset-gen/')) continue;
      if (target.startsWith('web/src/')) {
        if (!imported.has(target)) imported.set(target, new Set());
        imported.get(target).add(path);
        continue;
      }
      violations.push(`${path} imports ${spec}, which resolves outside tools/asset-gen: ${target}`);
    }
  }
  for (const [module, importers] of imported) {
    for (const importer of importers) {
      if (!documented.get(module)?.has(importer)) {
        violations.push(`${importer} imports ${module}, which README.md's coupling table omits`);
      }
    }
  }
  for (const [module, importers] of documented) {
    for (const importer of importers) {
      if (!imported.get(module)?.has(importer)) {
        violations.push(
          `README.md's coupling table lists ${importer} importing ${module}; it does not`
        );
      }
    }
  }
  return violations.sort();
}

function liveFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: ASSET_GEN_DIR,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((path) => /\.(mjs|js|ts)$/.test(path))
    .filter((path) => !EXEMPT_DIRS.some((dir) => path.startsWith(dir)))
    .map((path) => ({ path, source: readFileSync(join(ASSET_GEN_DIR, path), 'utf8') }));
}

const importing = (spec) => `import { value } from '${spec}';`;

describe('asset-gen import boundary', () => {
  it('imports only its own modules, packages, and the documented web/src modules', () => {
    const documented = documentedCoupling(readFileSync(README_PATH, 'utf8'));

    expect(documented.size).toBeGreaterThan(0);
    expect(boundaryViolations(liveFiles(), documented)).toEqual([]);
  });

  it.each([
    ['a bare side-effect import', (spec) => `import '${spec}';`],
    ['a from import', importing],
    ['a type-only import', (spec) => `import type { Value } from '${spec}';`],
    ['a re-export', (spec) => `export { value } from '${spec}';`],
    ['a dynamic import', (spec) => `const module = await import('${spec}');`],
    ['a template-literal dynamic import', (spec) => `const module = await import(\`${spec}\`);`],
  ])('extracts %s', (_label, write) => {
    expect(specifiers(write('../lib/example.mjs'))).toEqual(['../lib/example.mjs']);
  });

  it('ignores a path that only appears in a string or a comment', () => {
    const source = `const note = "${importing('../../lib/proc.mjs')}";\n// ${importing('../x.mjs')}`;

    expect(specifiers(source)).toEqual([]);
  });

  it('rejects an import() whose specifier is computed', () => {
    const files = [{ path: 'coloring/new-tool.mjs', source: 'await import(`../${name}.mjs`);' }];

    expect(boundaryViolations(files, new Map())).toEqual([
      'coloring/new-tool.mjs has an import() with a computed specifier, which cannot be checked',
    ]);
  });

  it('rejects a reach into repo-root tools/lib', () => {
    const files = [{ path: 'coloring/new-tool.mjs', source: importing('../../lib/proc.mjs') }];

    expect(boundaryViolations(files, new Map())).toEqual([
      'coloring/new-tool.mjs imports ../../lib/proc.mjs, which resolves outside tools/asset-gen: tools/lib/proc.mjs',
    ]);
  });

  it('rejects an undocumented web/src import and a stale table row', () => {
    const module = 'web/src/lib/state/books.ts';
    const files = [{ path: 'coloring/new-tool.mjs', source: importing(`../../../${module}`) }];
    const documented = new Map([[module, new Set(['coloring/old-tool.mjs'])]]);

    expect(boundaryViolations(files, documented)).toEqual([
      `README.md's coupling table lists coloring/old-tool.mjs importing ${module}; it does not`,
      `coloring/new-tool.mjs imports ${module}, which README.md's coupling table omits`,
    ]);
  });
});
