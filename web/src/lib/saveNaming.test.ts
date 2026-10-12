// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// saveNaming.ts's header says why: startup modules import it at runtime, so a
// runtime import from a lazily loaded module splits it into a startup chunk of
// its own. These are the lazy importers that header names.
const LAZY_IMPORTERS = ['./drawing/imageSave.ts'];

const LIB = new URL('./', import.meta.url);
const SAVE_NAMING = new URL('./saveNaming', LIB).href;

function resolveSpecifier(specifier: string, importer: URL): string | null {
  if (specifier.startsWith('$lib/')) return new URL(specifier.slice('$lib/'.length), LIB).href;
  if (specifier.startsWith('.')) return new URL(specifier, importer).href;
  return null;
}

function runtimeSpecifierOf(node: ts.Node): ts.Expression | undefined {
  if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) return node.moduleSpecifier;
  if (ts.isExportDeclaration(node) && !node.isTypeOnly) return node.moduleSpecifier;
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return node.arguments[0];
  }
  return undefined;
}

/**
 * The saveNaming imports, re-exports, and dynamic `import()` calls that survive
 * compilation. Only the statement-level `import type` / `export type` and the
 * `import('…').X` type position are erased: under SvelteKit's
 * verbatimModuleSyntax, `import { type X }` still emits `import {} from '…'`,
 * which is a runtime edge.
 */
function runtimeSaveNamingImports(source: string, importer: URL): string[] {
  const file = ts.createSourceFile('importer.ts', source, ts.ScriptTarget.Latest);
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    const specifier = runtimeSpecifierOf(node);
    if (
      specifier &&
      ts.isStringLiteralLike(specifier) &&
      resolveSpecifier(specifier.text, importer)?.replace(/\.[jt]s$/, '') === SAVE_NAMING
    ) {
      hits.push(node.getText(file));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return hits;
}

describe('saveNaming lazy importers', () => {
  it.each(LAZY_IMPORTERS)('%s takes only types from saveNaming', (path) => {
    const importer = new URL(path, LIB);

    expect(runtimeSaveNamingImports(readFileSync(importer, 'utf8'), importer)).toEqual([]);
  });

  // Positive controls: the guard above is only as good as this parse, so the
  // shapes it must flag and must let through are pinned here.
  const importer = new URL(LAZY_IMPORTERS[0], LIB);

  it.each([
    "import { isUnsaved } from '$lib/saveNaming';",
    "import { type SaveResult } from '$lib/saveNaming';",
    "import { DRAWING_BASENAME, type SaveResult } from '$lib/saveNaming.ts';",
    "import * as naming from '../saveNaming';",
    "import '$lib/saveNaming';",
    "export { DRAWING_BASENAME } from '$lib/saveNaming';",
    "async function name() { return (await import('$lib/saveNaming')).DRAWING_BASENAME; }",
  ])('flags %s', (statement) => {
    expect(runtimeSaveNamingImports(statement, importer)).toHaveLength(1);
  });

  it.each([
    "import type { SaveResult } from '$lib/saveNaming';",
    "import type { UnsavedStatus } from '../saveNaming';",
    "export type { SaveResult } from '$lib/saveNaming';",
    "let saved: import('$lib/saveNaming').SaveResult | undefined;",
    "const gallery = await import('./androidGallery');",
    "import { triggerDownload } from '$lib/savedFile';",
    "import { isNative } from '$lib/platform';",
  ])('lets through %s', (statement) => {
    expect(runtimeSaveNamingImports(statement, importer)).toEqual([]);
  });
});
