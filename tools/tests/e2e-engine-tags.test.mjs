import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { jobBlock, testWorkflow } from '../ci-mirror/tests/workflow-job-steps.mjs';

// Playwright tags decide which engine a spec runs on. In the RN web suite
// (e2e/) Chromium runs every spec and Firefox and WebKit grep for SMOKE_TAG; the
// CI smoke jobs run those two projects. Nothing validates a tag, so a typo can
// quietly drop a spec from both smoke jobs.
//
// Hence: tags come from e2e/tags.ts by import, never as a string literal, which
// makes a typo a module-resolution error instead of a routing one.
//
// Syntax-only on purpose: the extractor below parses each spec but resolves no
// types and loads no program, so this stays a Node-only suite.
const repoRoot = join(import.meta.dirname, '..', '..');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const warmWorkflow = readFileSync(
  join(repoRoot, '.github', 'workflows', 'warm-playwright-cache.yml'),
  'utf8'
);
const specsDir = join(repoRoot, 'e2e', 'specs');
const playwrightConfig = readFileSync(join(repoRoot, 'e2e', 'playwright.config.ts'), 'utf8');
const CONFIG_FLAG = '--config e2e/playwright.config.ts';
const TAGS_MODULE = '../tags.ts';
const ENGINE_SMOKE_PROJECTS = [
  { label: 'Firefox', name: 'firefox', requirement: 'REQUIRE_FIREFOX' },
  { label: 'WebKit', name: 'webkit', requirement: 'REQUIRE_WEBKIT' },
];

const exportedTagsOf = (source) =>
  [...source.matchAll(/export const ([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]);
const exportedTags = exportedTagsOf(readFileSync(join(repoRoot, 'e2e', 'tags.ts'), 'utf8'));

const specsIn = (dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.spec.ts'))
    .map((name) => ({ name, source: readFileSync(join(dir, name), 'utf8') }));
const specs = specsIn(specsDir);

// The `tag:` value in a test()/test.describe() options object — a bare
// identifier, a quoted literal, or an array of either. Literals keep their
// quotes so isLiteral below can reject them.
//
// Parsed rather than pattern-matched: a TypeScript labelled tuple element —
// `[tag: string, parts: string]` — is textually identical to this property, and
// excluding the type names it can carry would blind the guard to a value bound
// to one of those same names. The syntax tree separates a NamedTupleMember from
// a PropertyAssignment outright, so neither reading has to be guessed.
const propertyName = (name) =>
  ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;

function taggedEntries({ name = 'spec.ts', source }) {
  const parsed = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const entries = [];

  const collect = (value) => {
    if (ts.isArrayLiteralExpression(value)) value.elements.forEach(collect);
    else entries.push(value.getText(parsed));
  };

  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'tag') {
      collect(node.initializer);
    } else if (ts.isShorthandPropertyAssignment(node) && propertyName(node.name) === 'tag') {
      entries.push(node.name.text);
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(parsed, visit);
  return entries;
}

const isLiteral = (entry) => entry.startsWith("'") || entry.startsWith('"');

function standardWorkflowBrowsers(source) {
  return [...new Set([...source.matchAll(/^ +browsers: (\S+)$/gm)].map((match) => match[1]))];
}

function unwarmedStandardBrowsers(standardWorkflow, cacheWorkflow) {
  const used = standardWorkflowBrowsers(standardWorkflow);
  const matrix = cacheWorkflow.slice(cacheWorkflow.indexOf('matrix:'));
  return used.filter((browser) => !matrix.includes(browser));
}

function engineProjectContract({ label, name, requirement }) {
  return new RegExp(
    `engineAvailable\\('${label}', \\(\\) => ${name}\\.executablePath\\(\\), '${requirement}'\\)` +
      `[\\s\\S]*?name: '${name}',\\s*grep: SMOKE,`
  );
}

describe('E2E engine tags', () => {
  it('e2e/tags.ts exports the smoke tag', () => {
    expect(exportedTags).toEqual(expect.arrayContaining(['SMOKE_TAG', 'SMOKE']));
  });

  // Guards the partition against the opposite failure: every spec dropping its
  // tag would leave both smoke projects with nothing to run.
  it('at least one spec carries SMOKE_TAG', () => {
    const tagged = specs.filter((spec) => taggedEntries(spec).includes('SMOKE_TAG'));
    expect(tagged.map(({ name }) => name)).not.toHaveLength(0);
  });

  it('reads a bare identifier tag', () => {
    const source = "test.describe('x', { tag: SMOKE_TAG }, () => {});";
    expect(taggedEntries({ source })).toEqual(['SMOKE_TAG']);
  });

  it('reads every identifier in an array tag', () => {
    const source = "test.describe('x', { tag: [SMOKE_TAG] }, () => {});";
    expect(taggedEntries({ source })).toEqual(['SMOKE_TAG']);
  });

  it('ignores a labelled tuple element typed as a primitive', () => {
    const source = 'const probe = (...layers: [tag: string, parts: string][]) => {};';
    expect(taggedEntries({ source })).toEqual([]);
  });

  it('keeps rejecting a quoted tag spelling a primitive type name', () => {
    const source = "test('x', { tag: 'string' }, () => {});";
    const entries = taggedEntries({ source });
    expect(entries.filter(isLiteral)).toEqual(["'string'"]);
  });

  it('ignores a labelled tuple element typed as a named type', () => {
    const source = 'const probe = (...layers: [tag: IconName, parts: string][]) => {};';
    expect(taggedEntries({ source })).toEqual([]);
  });

  // The reason the tuple labels are read as syntax rather than excluded by
  // name: a value may carry a type's name, and that value is a real tag the
  // cross-file assertion below has to see.
  it('reads a tag bound to an identifier that spells a type name', () => {
    const source = "const string = '@smoke-typo';\ntest('x', { tag: [string] }, () => {});";
    expect(taggedEntries({ source })).toEqual(['string']);
  });

  it.each(ENGINE_SMOKE_PROJECTS)(
    'the $name smoke agrees across Playwright, its npm command, and its CI job',
    (project) => {
      const { name, requirement } = project;
      expect(playwrightConfig).toMatch(engineProjectContract(project));
      expect(packageJson.scripts[`test:${name}:smoke`]).toBe(
        `playwright test ${CONFIG_FLAG} --project ${name}`
      );

      const job = jobBlock(testWorkflow, `${name}-smoke`);
      expect(job).toContain(`browsers: ${name}`);
      expect(job).toContain(`run: npm run test:${name}:smoke`);
      expect(job).toContain(`${requirement}: 1`);
    }
  );

  // Chromium is where the smoke specs prove the app in Blink too, so it must not grep them out.
  it('the Chromium project runs every spec, the smoke ones included', () => {
    const chromiumProject = playwrightConfig.match(/name: 'chromium',[\s\S]*?\n {4}\},/)?.[0];
    expect(chromiumProject).toBeDefined();
    expect(chromiumProject).not.toMatch(/grep/);
  });

  it.each(ENGINE_SMOKE_PROJECTS)(
    '$name rejects another engine binary at its availability seam',
    (project) => {
      const otherEngine = project.name === 'firefox' ? 'webkit' : 'firefox';
      const swapped = playwrightConfig.replace(
        `${project.name}.executablePath()`,
        `${otherEngine}.executablePath()`
      );
      expect(swapped).not.toBe(playwrightConfig);
      expect(swapped).not.toMatch(engineProjectContract(project));
    }
  );

  it.each(ENGINE_SMOKE_PROJECTS)('$name requires its own smoke filter', (project) => {
    const withoutOwnFilter = playwrightConfig.replace(
      new RegExp(`(name: '${project.name}',\\s*)grep: SMOKE,`),
      '$1'
    );
    expect(withoutOwnFilter).not.toBe(playwrightConfig);
    expect(withoutOwnFilter).not.toMatch(engineProjectContract(project));
  });

  it('warms every browser cache used by the standard test workflow', () => {
    expect(unwarmedStandardBrowsers(testWorkflow, warmWorkflow)).toEqual([]);
  });

  it('detects a standard-workflow browser missing from the warm matrix', () => {
    const withEdgeSmoke = `${testWorkflow}\n  edge-smoke:\n    steps:\n      - with:\n          browsers: msedge\n`;
    expect(unwarmedStandardBrowsers(withEdgeSmoke, warmWorkflow)).toEqual(['msedge']);
  });

  it('accepts an equivalent block-style warm matrix', () => {
    const blockStyle = [
      'matrix:',
      '  browsers:',
      ...standardWorkflowBrowsers(testWorkflow).map((browser) => `    - ${browser}`),
    ].join('\n');
    expect(unwarmedStandardBrowsers(testWorkflow, blockStyle)).toEqual([]);
  });

  for (const spec of specs) {
    const entries = taggedEntries(spec);
    if (entries.length === 0) continue;

    it(`e2e/specs/${spec.name} takes its tags from ${TAGS_MODULE}, not string literals`, () => {
      expect(entries.filter(isLiteral)).toEqual([]);
      for (const entry of entries) expect(exportedTags).toContain(entry);
      expect(spec.source).toContain(`from '${TAGS_MODULE}'`);
    });
  }
});
