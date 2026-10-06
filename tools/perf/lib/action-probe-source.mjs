import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { ROOT } from '../../lib/proc.mjs';

// Exported for malformed-source fixtures without rewriting the injected production files.
export function actionProbeFunctionSource(source, name, functionName) {
  const file = join(ROOT, 'tools/perf/probes', name);
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const [declaration] = parsed.statements;
  if (
    parsed.parseDiagnostics.length ||
    parsed.statements.length !== 1 ||
    !ts.isFunctionDeclaration(declaration) ||
    declaration.name?.text !== functionName ||
    declaration.modifiers?.length !== 1 ||
    declaration.modifiers[0].kind !== ts.SyntaxKind.ExportKeyword ||
    !source.startsWith(`export function ${functionName}(`)
  ) {
    throw new Error(`Invalid injected action function: ${name}`);
  }
  let hasImport = false;
  function visit(node) {
    if (node.kind === ts.SyntaxKind.ImportKeyword) hasImport = true;
    ts.forEachChild(node, visit);
  }
  visit(declaration);
  if (hasImport) throw new Error(`Imports are forbidden in injected action function: ${name}`);
  return source.replace(/^export /, '');
}

function ownedFunctionSource(name, functionName) {
  return actionProbeFunctionSource(
    readFileSync(join(ROOT, 'tools/perf/probes', name), 'utf8'),
    name,
    functionName
  );
}

export function actionProbeSource() {
  const probe = ownedFunctionSource('action-probe.js', 'installActionProbe');
  const witness = ownedFunctionSource('magic-action-witness.js', 'createMagicActionWitness');
  return `(() => {
${witness}
${probe}
installActionProbe(createMagicActionWitness());
})();`;
}
