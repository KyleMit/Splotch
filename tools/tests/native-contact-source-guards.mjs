import ts from 'typescript';

export function assertPlainTextTopology(program, sourcePath) {
  const source = program.getSourceFile(sourcePath);
  if (!source) throw new Error('Missing candidate source');
  const checker = program.getTypeChecker();
  const textNames = new Set(['Text']);
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'react-native'
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings))
      for (const binding of bindings.elements) {
        if ((binding.propertyName ?? binding.name).text === 'Text')
          textNames.add(binding.name.text);
      }
  }
  function raw(type) {
    return type.isUnion()
      ? type.types.every(raw)
      : Boolean(type.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike));
  }
  function visit(node) {
    const opening = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : null;
    if (opening && textNames.has(opening.tagName.getText(source))) {
      for (const attribute of opening.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute))
          throw new Error('Emitter partition requires raw Text children');
        if (
          attribute.name.getText(source) === 'children' &&
          attribute.initializer &&
          !(
            ts.isStringLiteral(attribute.initializer) ||
            (ts.isJsxExpression(attribute.initializer) &&
              attribute.initializer.expression &&
              raw(checker.getTypeAtLocation(attribute.initializer.expression)))
          )
        )
          throw new Error('Emitter partition requires raw Text children');
      }
      for (const child of ts.isJsxElement(node) ? node.children : []) {
        if (ts.isJsxText(child)) continue;
        if (
          ts.isJsxExpression(child) &&
          (!child.expression || raw(checker.getTypeAtLocation(child.expression)))
        )
          continue;
        throw new Error('Emitter partition requires raw Text children');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

export function topologyFixture(text) {
  const sourcePath = '/splotch-emitter-topology-fixture.tsx';
  const options = { noLib: true, noResolve: true, jsx: ts.JsxEmit.Preserve };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (path) =>
    path === sourcePath
      ? ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      : undefined;
  return () => assertPlainTextTopology(ts.createProgram([sourcePath], options, host), sourcePath);
}

export function assertPaperHitTesting(text) {
  const source = ts.createSourceFile(
    'DrawingSurface.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const papers = [];
  function visit(node) {
    const opening = ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening) {
      const attributes = opening.attributes.properties.filter(ts.isJsxAttribute);
      const literal = (name) =>
        attributes.find((attribute) => attribute.name.getText(source) === name)?.initializer;
      const identity = literal('testID');
      if (identity && ts.isStringLiteral(identity) && identity.text === 'drawing-paper')
        papers.push(literal('pointerEvents'));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (
    papers.length !== 1 ||
    !papers[0] ||
    !ts.isStringLiteral(papers[0]) ||
    papers[0].text !== 'box-only'
  )
    throw new Error('Drawing paper requires box-only hit testing on the same element');
}
