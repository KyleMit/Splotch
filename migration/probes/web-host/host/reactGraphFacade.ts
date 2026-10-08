import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import type { ReactFileBinding } from './reactProduction.ts';

type FacadeChunk = {
  fileName: string;
  file: ReactFileBinding;
  facade: string | null;
  modules: { id: string; renderedLength: number; source: { kind: string } }[];
  imports: string[];
  dynamicImports: string[];
  externals: unknown[];
};

function parsed(code: string): ts.SourceFile {
  const source = ts.createSourceFile(
    'facade.mjs',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const diagnostics = ts.transpileModule(code, {
    fileName: 'facade.mjs',
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      allowJs: true,
    },
  }).diagnostics;
  if (diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error))
    throw new Error('Facade bridge cannot be parsed');
  return source;
}

function exportedNames(code: string): Set<string> {
  return new Set(
    parsed(code).statements.flatMap((statement) =>
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements
            .filter((element) => !element.isTypeOnly)
            .map((element) => element.name.text)
        : []
    )
  );
}

function bridgeTargets(copyRoot: string, chunk: FacadeChunk, chunks: FacadeChunk[]): FacadeChunk[] {
  if (
    !chunk.facade ||
    new Set(chunk.imports).size !== chunk.imports.length ||
    chunk.dynamicImports.length ||
    chunk.externals.length ||
    !chunk.imports.length
  )
    throw new Error('Empty contributor chunk is not a closed static facade bridge');
  const imports = new Map<string, { target: FacadeChunk; imported: string }>();
  const targets = new Set<FacadeChunk>();
  const exports = new Set<string>();
  const forwardedLocals = new Set<string>();
  for (const statement of parsed(readFileSync(join(copyRoot, chunk.file.path), 'utf8'))
    .statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !statement.moduleSpecifier.text.startsWith('.') ||
        !clause ||
        clause.isTypeOnly ||
        clause.name ||
        !clause.namedBindings ||
        !ts.isNamedImports(clause.namedBindings) ||
        !clause.namedBindings.elements.length ||
        statement.attributes
      )
        throw new Error('Facade bridge requires real named internal imports');
      const targetPath = resolve(
        dirname(join(copyRoot, chunk.file.path)),
        statement.moduleSpecifier.text
      );
      const target = chunks.find((value) => join(copyRoot, value.file.path) === targetPath);
      if (!target || target === chunk || !chunk.imports.includes(target.fileName))
        throw new Error('Facade bridge omitted its bound direct import target');
      const names = exportedNames(readFileSync(join(copyRoot, target.file.path), 'utf8'));
      for (const element of clause.namedBindings.elements) {
        const imported = (element.propertyName ?? element.name).text;
        if (element.isTypeOnly || imports.has(element.name.text) || !names.has(imported))
          throw new Error('Facade bridge import has no actual target export');
        imports.set(element.name.text, { target, imported });
      }
      targets.add(target);
    } else if (ts.isExportDeclaration(statement)) {
      if (
        statement.isTypeOnly ||
        statement.moduleSpecifier ||
        !statement.exportClause ||
        !ts.isNamedExports(statement.exportClause) ||
        !statement.exportClause.elements.length
      )
        throw new Error('Facade bridge requires named local forwarding exports');
      for (const element of statement.exportClause.elements) {
        const local = (element.propertyName ?? element.name).text;
        if (element.isTypeOnly || !imports.has(local) || exports.has(element.name.text))
          throw new Error('Facade bridge export has no actual imported local');
        exports.add(element.name.text);
        forwardedLocals.add(local);
      }
    } else throw new Error('Facade bridge contains executable or unbound statements');
  }
  if (
    !exports.size ||
    [...imports.keys()].some((local) => !forwardedLocals.has(local)) ||
    targets.size !== new Set(chunk.imports).size ||
    chunk.imports.some((name) => ![...targets].some((target) => target.fileName === name))
  )
    throw new Error('Facade bridge direct edges disagree with its emitted imports');
  return [...targets];
}

export function assertChunkFacades(copyRoot: string, chunks: FacadeChunk[]): void {
  for (const chunk of chunks) {
    if (chunk.modules.length) {
      if (chunk.facade !== null && !chunk.modules.some((module) => module.id === chunk.facade))
        throw new Error('Chunk facade omitted its source contributor');
      continue;
    }
    const targets = bridgeTargets(copyRoot, chunk, chunks);
    const owners = targets
      .flatMap((target) => target.modules)
      .filter((module) => module.id === chunk.facade && module.renderedLength > 0);
    if (
      !owners.length ||
      owners.some((module) => module.source.kind !== 'file' && module.source.kind !== 'kit-env')
    )
      throw new Error('Facade bridge has no qualified positive direct source contributor');
  }
}
