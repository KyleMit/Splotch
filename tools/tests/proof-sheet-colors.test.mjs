import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { themes } from '../../web/src/lib/design/tokens.ts';

// The coloring-book proof sheets restate colours from two owners they cannot
// import, so this guard reads each copy and its owner as source text. It reads
// JavaScript declarations through the TypeScript parser and CSS with its comments
// stripped, so a comment or string that merely mentions the right values cannot
// satisfy it.
//
// The proof sheets exist so a reviewer can judge a fill against the paper it
// ships on, so both browser runtimes restate the app's per-theme paper colour and
// line-art blend. They load as plain <script> assets, so each runtime's top-level
// `PAPER` and `BLEND` declarations are held to `themes` in
// web/src/lib/design/tokens.ts.
//
// The category sheet's page CSS restates the scrapbook chrome's light palette and
// crayon hues, because tools/asset-gen may not import the chrome. The chrome keeps
// them in module-private constants, so every `:root` token of the CSS is held to
// the chrome's `LIGHT_TOKENS` map and the first `:root` block of its `CHROME_CSS`
// template.
const repoRoot = join(import.meta.dirname, '..', '..');
const RUNTIMES = [
  'tools/scrapbook/proof-sheet-hub-assets/proof-sheet-hub.client.js',
  'tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.client.js',
];
const APP_COMPOSITING = {
  PAPER: { light: themes.light.paper, dark: themes.dark.paper },
  BLEND: { light: themes.light.lineartBlend, dark: themes.dark.lineartBlend },
};
const CHROME = 'tools/scrapbook/lib/scrapbook-chrome.mjs';
const SHEET_CSS = 'tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.css';
// Sheet tokens with no chrome counterpart: the chrome's shadows are a
// shadow-sm/md/lg ramp, and the sheet's single tile shadow is its own.
const SHEET_ONLY_TOKENS = ['shadow'];

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  throw new Error(`unsupported property name kind ${ts.SyntaxKind[name.kind]}`);
}

function stringLiteralMap(object, label) {
  return Object.fromEntries(
    object.properties.map((property) => {
      if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
        throw new Error(`${label} must map each key to a string literal`);
      }
      return [propertyName(property.name), property.initializer.text];
    })
  );
}

function topLevelInitializer(source, fileName, constName) {
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
      return declaration.initializer;
    }
  }
  throw new Error(`${fileName}: no top-level ${constName} declaration`);
}

function topLevelStringMap(source, fileName, constName) {
  const initializer = topLevelInitializer(source, fileName, constName);
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    throw new Error(`${fileName}: ${constName} must be an object literal`);
  }
  return stringLiteralMap(initializer, `${fileName}: ${constName}`);
}

// Each substitution becomes a line break, so the declarations a template spells
// out stay readable and the interpolated ones drop out.
function topLevelTemplateText(source, fileName, constName) {
  const initializer = topLevelInitializer(source, fileName, constName);
  if (!initializer || !ts.isTemplateExpression(initializer)) {
    throw new Error(`${fileName}: ${constName} must be a template with substitutions`);
  }
  return [
    initializer.head.text,
    ...initializer.templateSpans.map(({ literal }) => literal.text),
  ].join('\n');
}

// Splits a stylesheet, comments stripped, into its top-level rules. An at-rule
// keeps its nested rules inside its body, so `@media (…) { :root {…} }` is one
// rule whose prelude is the query.
function topLevelRules(css, label) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) bodyStart = i + 1;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth < 0) throw new Error(`${label}: unbalanced braces`);
      if (depth > 0) continue;
      rules.push({
        prelude: text.slice(preludeStart, bodyStart - 1).trim(),
        body: text.slice(bodyStart, i),
      });
      preludeStart = i + 1;
    }
  }
  if (depth !== 0) throw new Error(`${label}: unbalanced braces`);
  return rules;
}

// Every segment must read as `name: value`, so a declaration the guard cannot
// parse fails it rather than dropping out of the comparison.
function declarations(body, label) {
  return body
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const declaration = /^([\w-]+)\s*:\s*(\S[\s\S]*)$/.exec(segment);
      if (!declaration) throw new Error(`${label}: unreadable :root declaration "${segment}"`);
      return [declaration[1], declaration[2]];
    });
}

function rootCustomProperties(css, label) {
  const roots = topLevelRules(css, label).filter(({ prelude }) => prelude === ':root');
  if (roots.length !== 1) {
    throw new Error(`${label}: expected one plain :root rule, found ${roots.length}`);
  }
  return Object.fromEntries(
    declarations(roots[0].body, label)
      .filter(([name]) => name.startsWith('--'))
      .map(([name, value]) => [name.slice(2), value])
  );
}

function customPropertiesOutsideRoot(css, label) {
  return topLevelRules(css, label)
    .filter(({ prelude }) => prelude !== ':root')
    .flatMap(({ body }) =>
      [...body.matchAll(/(?:^|[{;])\s*--([\w-]+)\s*:/g)].map(([, name]) => name)
    );
}

function pageTokens() {
  const chromeSource = readFileSync(join(repoRoot, CHROME), 'utf8');
  const chromeCss = topLevelTemplateText(chromeSource, CHROME, 'CHROME_CSS');
  const sheetCss = readFileSync(join(repoRoot, SHEET_CSS), 'utf8');
  return {
    chrome: {
      ...topLevelStringMap(chromeSource, CHROME, 'LIGHT_TOKENS'),
      ...rootCustomProperties(chromeCss, CHROME),
    },
    sheet: rootCustomProperties(sheetCss, SHEET_CSS),
    sheetOverrides: customPropertiesOutsideRoot(sheetCss, SHEET_CSS),
  };
}

const pick = (tokens, names) => Object.fromEntries(names.map((name) => [name, tokens[name]]));

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
    ).toThrow('must map each key to a string literal');
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

describe('proof-sheet page CSS restates the scrapbook chrome palette', () => {
  it('reads the plain :root rule, not a comment, a themed variant, or an at-rule', () => {
    const css = [
      '/* :root { --ink: #000000; } */',
      ':root[data-theme=dark] { --ink: #111111; }',
      ':root {',
      '  /* --ink: #222222; */',
      '  color-scheme: light;',
      '  --ink: #23212a',
      '}',
      '@media (prefers-color-scheme: dark) { :root { --ink: #333333; } }',
    ].join('\n');
    expect(rootCustomProperties(css, 'fixture.css')).toEqual({ ink: '#23212a' });
  });

  it('fails closed on a stylesheet it cannot read whole', () => {
    const cases = [
      ['/* :root { --ink: #000000; } */', 'expected one plain :root rule, found 0'],
      [':root { --ink: #23212a; }\n:root { --ink: #000000; }', 'found 2'],
      [':root { --ink #23212a; }', 'unreadable :root declaration "--ink #23212a"'],
      [':root { --ink: #23212a;', 'unbalanced braces'],
    ];
    for (const [css, error] of cases) {
      expect(() => rootCustomProperties(css, 'fixture.css')).toThrow(error);
    }
  });

  it('finds custom properties declared outside the plain :root rule', () => {
    const css = [
      ':root { --ink: #23212a; }',
      '.wrap { color: var(--ink); --paper: #000000; }',
      '@media (min-width: 1px) { :root { --muted: #000000; } }',
    ].join('\n');
    expect(customPropertiesOutsideRoot(css, 'fixture.css')).toEqual(['paper', 'muted']);
  });

  it('reads the tokens a template spells out, skipping its substitutions', () => {
    const source = [
      '// const CSS = `:root{--c-red:#000000;}`;',
      'const CSS = `:root{${vars(LIGHT)} --c-red:#ec534e;}`;',
    ].join('\n');
    expect(rootCustomProperties(topLevelTemplateText(source, 'fixture.js', 'CSS'), 'x')).toEqual({
      'c-red': '#ec534e',
    });
    expect(() => topLevelTemplateText("const CSS = ':root{}';", 'fixture.js', 'CSS')).toThrow(
      'CSS must be a template with substitutions'
    );
  });

  it(`${SHEET_CSS} declares each shared :root token as the chrome does`, () => {
    const { chrome, sheet } = pageTokens();
    const shared = Object.keys(sheet).filter((name) => !SHEET_ONLY_TOKENS.includes(name));
    expect(shared).not.toEqual([]);
    expect(pick(sheet, shared)).toEqual(pick(chrome, shared));
  });

  it(`${SHEET_CSS} declares the chrome's tokens only in its :root rule`, () => {
    const { chrome, sheetOverrides } = pageTokens();
    expect(sheetOverrides.filter((name) => Object.hasOwn(chrome, name))).toEqual([]);
  });

  it('lists as sheet-only only tokens the sheet declares and the chrome lacks', () => {
    const { chrome, sheet } = pageTokens();
    expect(
      SHEET_ONLY_TOKENS.filter((name) => !Object.hasOwn(sheet, name) || Object.hasOwn(chrome, name))
    ).toEqual([]);
  });
});
