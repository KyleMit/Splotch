import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// An in-app report files a GitHub issue with the labels web/src/lib/server/report.ts
// writes, and GitHub silently auto-creates any label the repo lacks. A label
// renamed in .github/labels.yml would leave reports under a stray label nobody
// triages, so this reads both sides as written and fails on a mismatch. The
// source side is read through the TypeScript AST, which carries no comments, so
// a commented-out declaration can neither satisfy nor shadow the live one.
const repoRoot = join(import.meta.dirname, '..', '..');
const reportPath = join(repoRoot, 'web', 'src', 'lib', 'server', 'report.ts');
const report = ts.createSourceFile(
  reportPath,
  readFileSync(reportPath, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS
);
const labelsYaml = readFileSync(join(repoRoot, '.github', 'labels.yml'), 'utf8');

const LABEL_WRITE_ELEMENTS = ['REPORT_LABEL', 'ISSUE_BY_KIND[reportKind].label'];

function parseTaxonomyNames(yamlText) {
  const entryCount = yamlText.match(/^- /gm)?.length ?? 0;
  const names = [...yamlText.matchAll(/^- name: '([^'\n]+)'$/gm)].map((match) => match[1]);
  if (names.length !== entryCount) {
    throw new Error(`labels.yml has ${entryCount} entries but ${names.length} single-quoted names`);
  }
  return new Set(names);
}

function collectNodes(source, predicate) {
  const found = [];
  const visit = (node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const propertyName = (node) =>
  ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name) ? node.name.text : undefined;

function soleInitializer(source, name) {
  const declarations = collectNodes(
    source,
    (node) =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name
  );
  if (declarations.length !== 1 || !declarations[0].initializer) {
    throw new Error(`report.ts must declare ${name} exactly once, with an initializer`);
  }
  return declarations[0].initializer;
}

function stringValue(node, what) {
  if (!ts.isStringLiteralLike(node))
    throw new Error(`${what} is not a string literal: ${node.getText()}`);
  return node.text;
}

function parseKindLabels(source) {
  const byKind = soleInitializer(source, 'ISSUE_BY_KIND');
  if (!ts.isObjectLiteralExpression(byKind))
    throw new Error('ISSUE_BY_KIND is not an object literal');
  return byKind.properties.map((kind) => {
    if (!ts.isPropertyAssignment(kind) || !ts.isObjectLiteralExpression(kind.initializer)) {
      throw new Error(`ISSUE_BY_KIND entry is not an object literal: ${kind.getText()}`);
    }
    const label = kind.initializer.properties.find(
      (field) => ts.isPropertyAssignment(field) && propertyName(field) === 'label'
    );
    if (!label) throw new Error(`ISSUE_BY_KIND.${propertyName(kind)} has no label`);
    return stringValue(label.initializer, `ISSUE_BY_KIND.${propertyName(kind)}.label`);
  });
}

function labelWrites(source) {
  return collectNodes(
    source,
    (node) =>
      (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
      propertyName(node) === 'labels'
  ).map((node) =>
    ts.isPropertyAssignment(node) && ts.isArrayLiteralExpression(node.initializer)
      ? node.initializer.elements.map((element) => element.getText())
      : node.getText()
  );
}

const taxonomy = parseTaxonomyNames(labelsYaml);

describe('in-app report labels', () => {
  it('writes only REPORT_LABEL and the kind label, so the parsed labels are every label written', () => {
    expect(labelWrites(report)).toEqual([LABEL_WRITE_ELEMENTS]);
  });

  it('files every report under labels .github/labels.yml defines', () => {
    const kindLabels = parseKindLabels(report);
    expect(kindLabels.length).toBeGreaterThan(0);
    const written = [
      stringValue(soleInitializer(report, 'REPORT_LABEL'), 'REPORT_LABEL'),
      ...kindLabels,
    ];
    expect(written.filter((label) => !taxonomy.has(label))).toEqual([]);
  });
});
