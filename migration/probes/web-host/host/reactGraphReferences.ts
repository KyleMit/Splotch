import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ReactFileBinding } from './reactProduction.ts';
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

export function assertGraphChunkEdges(
  copyRoot: string,
  chunks: {
    fileName: string;
    file: ReactFileBinding;
    imports: string[];
    dynamicImports: string[];
    externals: { specifier: string }[];
  }[]
): void {
  const outputNames = new Set(chunks.map((chunk) => chunk.fileName));
  for (const chunk of chunks) {
    const codeReferences = emittedModuleReferences(
      readFileSync(join(copyRoot, chunk.file.path), 'utf8')
    );
    for (const specifier of codeReferences) {
      const internal = specifier.startsWith('.')
        ? chunks.find(
            (target) =>
              join(copyRoot, target.file.path) ===
              resolve(dirname(join(copyRoot, chunk.file.path)), specifier)
          )
        : undefined;
      if (
        internal
          ? ![...chunk.imports, ...chunk.dynamicImports].includes(internal.fileName)
          : !chunk.externals.some((edge) => edge.specifier === specifier)
      )
        throw new Error('Emitted literal import omitted its source-bound graph edge');
    }
    const references = [...chunk.imports, ...chunk.dynamicImports];
    const externalNames = chunk.externals.map((edge) => edge.specifier);
    if (
      new Set(externalNames).size !== externalNames.length ||
      references.some(
        (specifier) => !outputNames.has(specifier) && !externalNames.includes(specifier)
      )
    )
      throw new Error('Chunk graph omitted a surviving external edge');
  }
}
