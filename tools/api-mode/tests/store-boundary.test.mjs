import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createSourceFile, isImportDeclaration, ScriptTarget } from 'typescript';
import { expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';

function assertScopedImports(sources) {
  for (const { path, source } of sources) {
    const ast = createSourceFile(path, source, ScriptTarget.Latest);
    for (const statement of ast.statements.filter(isImportDeclaration)) {
      assert.ok(
        statement.moduleSpecifier.text !== '@netlify/blobs' || path === 'netlify/server/blobs.ts',
        `${path} bypasses the scoped Blobs owner`
      );
    }
  }
}

it('routes every live server SDK import through the selected store scope, including purge dependencies', () => {
  const sources = readdirSync(join(ROOT, 'netlify'), { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.includes('.test.') &&
        !entry.name.endsWith('TestHarness.ts')
    )
    .map((entry) => {
      const absolute = join(entry.parentPath, entry.name);
      return { path: relative(ROOT, absolute), source: readFileSync(absolute, 'utf8') };
    });
  expect(() => assertScopedImports(sources)).not.toThrow();
  expect(() =>
    assertScopedImports([
      ...sources,
      {
        path: 'netlify/functions/rogue-purge.ts',
        source: "import { getStore } from '@netlify/blobs';",
      },
    ])
  ).toThrow('bypasses');
});
