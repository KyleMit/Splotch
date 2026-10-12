import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { ROOT } from '../lib/proc.mjs';

const OWNER_FILES = ['magicBrush.ts', 'magicSheetRasterClient.ts', 'magicWorkWitness.ts'];
const drawingSource = (file) => readFileSync(join(ROOT, 'web/src/lib/drawing', file), 'utf8');

function unguardedRecordCalls(source) {
  const parsed = ts.createSourceFile('owner.ts', source, ts.ScriptTarget.Latest, true);
  const violations = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(parsed) === 'magicWorkCounters' &&
      node.expression.name.text.startsWith('record')
    ) {
      let current = node.parent;
      let guarded = false;
      while (current) {
        if (
          ts.isIfStatement(current) &&
          current.expression.getText(parsed) === 'PERF_MARKS' &&
          node.pos >= current.thenStatement.pos &&
          node.end <= current.thenStatement.end
        )
          guarded = true;
        current = current.parent;
      }
      if (!guarded) violations.push(node.expression.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return violations;
}

it.each(OWNER_FILES)(
  'keeps every %s recording call behind an explicit PERF_MARKS branch',
  (file) => {
    const source = drawingSource(file);
    expect(unguardedRecordCalls(source)).toEqual([]);
    const control = source.replace('if (PERF_MARKS)', 'if (true)');
    expect(control).not.toBe(source);
    expect(unguardedRecordCalls(control).length).toBeGreaterThan(0);
  }
);

it('allocates the counter owner only behind the safe flag and never adds a reset export', () => {
  const source = drawingSource('magicWorkDebug.ts');
  const parsed = ts.createSourceFile('counters.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((candidate) => candidate.name.getText(parsed) === 'magicWorkCounters');
  expect(declaration.initializer.getText(parsed)).toBe(
    'PERF_MARKS ? createMagicWorkCounters() : null'
  );
  expect(
    parsed.statements
      .filter(ts.isImportDeclaration)
      .map((statement) => statement.moduleSpecifier.text)
  ).toEqual(['./perf']);
  expect(source).not.toMatch(/resetForTests|performance\.|Math\.random|new Worker|document\./);
  expect(drawingSource('perf.ts')).toContain(
    "typeof __PERF_MARKS__ !== 'undefined' && __PERF_MARKS__"
  );
});

it('keeps the four witness owners in their acyclic reviewed runtime graph', () => {
  const files = [...OWNER_FILES, 'magicWorkDebug.ts'];
  const owners = new Set(files.map((file) => `./${file.replace(/\.ts$/, '')}`));
  const graph = Object.fromEntries(
    files.map((file) => {
      const parsed = ts.createSourceFile(file, drawingSource(file), ts.ScriptTarget.Latest, true);
      const imports = parsed.statements
        .filter(ts.isImportDeclaration)
        .filter((statement) => !statement.importClause?.isTypeOnly)
        .map((statement) => statement.moduleSpecifier.text);
      expect(imports).not.toContain('./engine');
      return [file, imports.filter((owner) => owners.has(owner)).sort()];
    })
  );
  expect(graph).toEqual({
    'magicBrush.ts': ['./magicSheetRasterClient', './magicWorkDebug'],
    'magicSheetRasterClient.ts': ['./magicWorkDebug'],
    'magicWorkWitness.ts': ['./magicBrush', './magicSheetRasterClient', './magicWorkDebug'],
    'magicWorkDebug.ts': [],
  });
});
