import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { themes } from '../../web/src/lib/design/tokens.ts';

// The coloring-book proof sheets exist so a reviewer can judge a fill against the
// paper it ships on, so both browser runtimes restate the app's per-theme paper
// colour and line-art blend. They load as plain <script> assets and cannot import
// the token source, so this guard holds each runtime's top-level `PAPER` and
// `BLEND` declarations to `themes` in web/src/lib/design/tokens.ts. It reads the
// declarations through the TypeScript parser, so a comment or string that merely
// mentions the right values cannot satisfy it.
const repoRoot = join(import.meta.dirname, '..', '..');
const RUNTIMES = [
  'tools/scrapbook/proof-sheet-hub-assets/proof-sheet-hub.client.js',
  'tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.client.js',
];
const APP_COMPOSITING = {
  PAPER: { light: themes.light.paper, dark: themes.dark.paper },
  BLEND: { light: themes.light.lineartBlend, dark: themes.dark.lineartBlend },
};

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  throw new Error(`unsupported property name kind ${ts.SyntaxKind[name.kind]}`);
}

function stringLiteralMap(object, label) {
  return Object.fromEntries(
    object.properties.map((property) => {
      if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
        throw new Error(`${label} must map each theme to a string literal`);
      }
      return [propertyName(property.name), property.initializer.text];
    })
  );
}

function topLevelStringMap(source, fileName, constName) {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS
  );
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== constName) continue;
      const { initializer } = declaration;
      if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
        throw new Error(`${fileName}: ${constName} must be an object literal`);
      }
      return stringLiteralMap(initializer, `${fileName}: ${constName}`);
    }
  }
  throw new Error(`${fileName}: no top-level ${constName} declaration`);
}

describe('proof-sheet runtimes composite on the app paper', () => {
  it('reads the declaration rather than a comment or string naming it', () => {
    const source = [
      "// const PAPER = { light: '#fcfbf8', dark: '#211f29' };",
      'const note = "const PAPER = { light: \'#fcfbf8\' }";',
      "const PAPER = { dark: '#000000', 'light': '#ffffff' };",
    ].join('\n');
    expect(topLevelStringMap(source, 'fixture.js', 'PAPER')).toEqual({
      light: '#ffffff',
      dark: '#000000',
    });
  });

  it('fails loudly when the declaration is missing or not a string map', () => {
    expect(() => topLevelStringMap('// const PAPER = {};', 'fixture.js', 'PAPER')).toThrow(
      'no top-level PAPER declaration'
    );
    expect(() =>
      topLevelStringMap('const PAPER = { light: LIGHT };', 'fixture.js', 'PAPER')
    ).toThrow('must map each theme to a string literal');
  });

  for (const rel of RUNTIMES) {
    const source = readFileSync(join(repoRoot, rel), 'utf8');
    for (const [constName, expected] of Object.entries(APP_COMPOSITING)) {
      it(`${rel} declares ${constName} as the app tokens`, () => {
        expect(topLevelStringMap(source, rel, constName)).toEqual(expected);
      });
    }
  }
});
