import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Playwright tags decide which engine a spec runs on: Firefox and WebKit grep
// for ENGINE_SMOKE_TAG while Chromium greps it out. Nothing validates a tag, so
// a typo can route one spec to Chromium alone while both smoke jobs stay green.
//
// Hence: tags come from tags.ts by import, never as a string literal, which
// makes a typo a module-resolution error instead of a routing one.
//
// Regex-level on purpose: no TypeScript parser runs in this Node-only suite,
// and these specs are dprint-formatted.
const repoRoot = join(import.meta.dirname, '..', '..');
const testsDir = join(repoRoot, 'web', 'tests');
const TAGS_MODULE = './tags';
const playwrightConfig = readFileSync(join(repoRoot, 'web', 'playwright.config.ts'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const testWorkflow = readFileSync(join(repoRoot, '.github', 'workflows', 'test.yml'), 'utf8');
const warmWorkflow = readFileSync(
  join(repoRoot, '.github', 'workflows', 'warm-playwright-cache.yml'),
  'utf8'
);
const ENGINE_SMOKE_PROJECTS = [
  { label: 'Firefox', name: 'firefox', requirement: 'REQUIRE_FIREFOX' },
  { label: 'WebKit', name: 'webkit', requirement: 'REQUIRE_WEBKIT' },
];

const tagsSource = readFileSync(join(testsDir, 'tags.ts'), 'utf8');
const exportedTags = [...tagsSource.matchAll(/export const ([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]);

const specs = readdirSync(testsDir)
  .filter((name) => name.endsWith('.spec.ts'))
  .map((name) => ({ name, source: readFileSync(join(testsDir, name), 'utf8') }));

// The `tag:` value in a test()/test.describe() options object — a bare
// identifier, a quoted literal, or an array of either.
const TAG_VALUE = /\btag:\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|[A-Za-z_$][\w$]*)/g;

function taggedEntries({ source }) {
  return [...source.matchAll(TAG_VALUE)].flatMap(([, value]) =>
    (value.startsWith('[') ? value.slice(1, -1).split(',') : [value])
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

const isLiteral = (entry) => entry.startsWith("'") || entry.startsWith('"');

function workflowJob(source, jobId) {
  const start = source.indexOf(`\n  ${jobId}:\n`);
  if (start === -1) return '';
  const rest = source.slice(start + 1);
  const nextJob = rest.slice(1).search(/\n {2}[\w-]+:\n/);
  return nextJob === -1 ? rest : rest.slice(0, nextJob + 1);
}

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
      `[\\s\\S]*?name: '${name}',\\s*grep: ENGINE_SMOKE,`
  );
}

describe('E2E engine tags', () => {
  it('tags.ts exports the tag constants', () => {
    expect(exportedTags).toEqual(expect.arrayContaining(['ENGINE_SMOKE_TAG', 'ENGINE_SMOKE']));
  });

  // Guards the partition against the opposite failure: every spec dropping its
  // tag would leave both smoke projects with nothing to run.
  it('at least one spec carries ENGINE_SMOKE_TAG', () => {
    const tagged = specs.filter((spec) => taggedEntries(spec).includes('ENGINE_SMOKE_TAG'));
    expect(tagged.map(({ name }) => name)).not.toHaveLength(0);
  });

  it('Chromium excludes the engine-smoke tag', () => {
    expect(playwrightConfig).toMatch(/name: 'chromium',[\s\S]*?grepInvert: ENGINE_SMOKE,/);
  });

  it.each(ENGINE_SMOKE_PROJECTS)(
    '$name agrees across Playwright, its npm command, and its CI job',
    ({ label, name, requirement }) => {
      expect(playwrightConfig).toMatch(engineProjectContract({ label, name, requirement }));
      expect(packageJson.scripts[`test:${name}:smoke`]).toBe(
        `node tools/run-web-tool.mjs playwright test --project ${name}`
      );

      const job = workflowJob(testWorkflow, `${name}-smoke`);
      expect(job).toContain(`browsers: ${name}`);
      expect(job).toContain(`run: npm run test:${name}:smoke`);
      expect(job).toContain(`${requirement}: 1`);
    }
  );

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

  it.each(ENGINE_SMOKE_PROJECTS)('$name requires its own engine-smoke filter', (project) => {
    const withoutOwnFilter = playwrightConfig.replace(
      new RegExp(`(name: '${project.name}',\\s*)grep: ENGINE_SMOKE,`),
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

    it(`${spec.name} takes its tags from ${TAGS_MODULE}, not string literals`, () => {
      expect(entries.filter(isLiteral)).toEqual([]);
      for (const entry of entries) expect(exportedTags).toContain(entry);
      expect(spec.source).toContain(`from '${TAGS_MODULE}'`);
    });
  }
});
