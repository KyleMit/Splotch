import ts from 'typescript';

export function emittedModuleReferences(code: string): string[] {
  const source = ts.createSourceFile(
    'emitted.mjs',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const diagnostics = ts.transpileModule(code, {
    fileName: 'emitted.mjs',
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      allowJs: true,
    },
  }).diagnostics;
  if (diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error))
    throw new Error('Emitted JS could not be parsed for literal import evidence');
  const references = new Set<string>();
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      references.add(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      ts.isStringLiteralLike(node.arguments[0])
    )
      references.add(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...references].sort();
}
