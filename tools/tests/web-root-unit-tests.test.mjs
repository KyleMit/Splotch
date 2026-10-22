import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Build-time and hosting tests live beside their owners outside src/lib. A collection
// or type-check glob that misses either silently drops coverage, so this guard lives
// in the independent tools tier and reads the configuration syntax itself.
const repoRoot = join(import.meta.dirname, '..', '..');

const BUILD_MODULE_TESTS = [
  ['netlify/securityPolicy.test.ts', 'netlify/**/*.ts'],
  ['tools/release/lib/buildVersion.test.ts', 'tools/release/lib/buildVersion*.ts'],
];

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
  const source = readFileSync(join(repoRoot, 'vitest.config.ts'), 'utf8');
  return testIncludeGlobs(source);
};

const tsconfigIncludeGlobs = () => {
  const source = readFileSync(join(repoRoot, 'tsconfig.shared.json'), 'utf8');
  return JSON.parse(source.replace(/^\s*\/\/.*$/gm, '')).include;
};

describe('build-module unit tests', () => {
  it('type-checks the shared Vitest configuration', () => {
    expect(tsconfigIncludeGlobs()).toContain('vitest.config.ts');
  });
  it.each(BUILD_MODULE_TESTS)('collects %s with Vitest', (testFile) => {
    expect(vitestIncludeGlobs()).toContain(testFile);
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

  it.each(BUILD_MODULE_TESTS)('type-checks %s with TypeScript', (_testFile, sourceGlob) => {
    expect(tsconfigIncludeGlobs()).toContain(sourceGlob);
  });
});
