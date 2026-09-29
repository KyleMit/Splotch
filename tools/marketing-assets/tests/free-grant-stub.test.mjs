import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { FRESH_FREE_GRANT } from '../gen-store-assets.mjs';

// Drift guard for the store-asset generator's /api/free-generation-grant stub.
// The generator is an untyped script, so the route's response type can only
// reach it through this test: an interface is erased at runtime, so its field
// names are read from the source.

const FREE_GENERATIONS_PATH = fileURLToPath(
  new URL('../../../web/src/lib/freeGenerations.ts', import.meta.url)
);

function interfaceFieldNames(path, interfaceName) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest);
  const declaration = source.statements.find(
    (statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === interfaceName
  );
  if (!declaration) throw new Error(`${path} declares no interface ${interfaceName}`);
  return declaration.members.map((member) => member.name.getText(source));
}

describe('store-asset free-grant stub', () => {
  it('sends exactly the fields FreeGenerationGrantStatus declares', () => {
    const declared = interfaceFieldNames(FREE_GENERATIONS_PATH, 'FreeGenerationGrantStatus');
    expect(Object.keys(FRESH_FREE_GRANT).sort()).toEqual(declared.sort());
  });
});
