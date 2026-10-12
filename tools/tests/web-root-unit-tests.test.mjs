import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// web/buildVersion.test.ts sits at the web root, beside the build-time module it
// tests, which puts it outside two globs that only cover src/: Vitest's collection
// include (web/vitest.config.ts) and the type-check include SvelteKit generates
// into .svelte-kit/tsconfig.json, restated in web/tsconfig.json.
//
// Dropping either glob is silent. Without the Vitest entry the root tests stop
// being collected and the suite still reports green; without the tsconfig entry
// svelte-check skips the files and still reports zero errors. So the guard cannot
// live in a web-root test — that file is itself collected by the glob it would be
// guarding. It runs here, in the tools suite, which reaches both configs as
// plain files.
//
// Parse vitest.config.ts without importing it: evaluation would pull in the
// SvelteKit plugin, while a text search cannot distinguish test.include from
// nested settings such as test.coverage.include.
const repoRoot = join(import.meta.dirname, '..', '..');

const VITEST_ROOT_TEST_GLOB = '*.test.ts';
const TSCONFIG_ROOT_TEST_GLOB = `./${VITEST_ROOT_TEST_GLOB}`;

const propertyInitializer = (object, name) => {
  const property = object.properties.find(
    (candidate) =>
      ts.isPropertyAssignment(candidate) &&
      (ts.isIdentifier(candidate.name) || ts.isStringLiteral(candidate.name)) &&
      candidate.name.text === name
  );
  if (!property) throw new Error(`Expected object property ${name}`);
  return property.initializer;
};

const testIncludeGlobs = (source) => {
  const sourceFile = ts.createSourceFile(
    'vitest.config.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const exportAssignment = sourceFile.statements.find(ts.isExportAssignment);
  if (!exportAssignment || !ts.isCallExpression(exportAssignment.expression)) {
    throw new Error('Expected export default defineConfig(...)');
  }

  const config = exportAssignment.expression.arguments[0];
  if (!config || !ts.isObjectLiteralExpression(config)) {
    throw new Error('Expected defineConfig(...) object');
  }

  const test = propertyInitializer(config, 'test');
  if (!ts.isObjectLiteralExpression(test)) throw new Error('Expected test object');

  const include = propertyInitializer(test, 'include');
  if (!ts.isArrayLiteralExpression(include)) throw new Error('Expected test.include array');

  return include.elements.map((element) => {
    if (!ts.isStringLiteral(element)) throw new Error('Expected string test.include glob');
    return element.text;
  });
};

const vitestIncludeGlobs = () => {
  const source = readFileSync(join(repoRoot, 'web', 'vitest.config.ts'), 'utf8');
  return testIncludeGlobs(source);
};

const tsconfigIncludeGlobs = () => {
  const source = readFileSync(join(repoRoot, 'web', 'tsconfig.json'), 'utf8');
  return JSON.parse(source.replace(/^\s*\/\/.*$/gm, '')).include;
};

describe('web-root unit tests', () => {
  it('are collected by Vitest', () => {
    expect(vitestIncludeGlobs()).toContain(VITEST_ROOT_TEST_GLOB);
  });

  it('selects test.include instead of nested include settings', () => {
    const source = `export default defineConfig({
      test: {
        coverage: { include: ['src/**/*.ts'] },
        include: ['*.test.ts'],
      },
    });`;
    expect(testIncludeGlobs(source)).toEqual(['*.test.ts']);
  });

  it('are type-checked by svelte-check', () => {
    expect(tsconfigIncludeGlobs()).toContain(TSCONFIG_ROOT_TEST_GLOB);
  });
});
