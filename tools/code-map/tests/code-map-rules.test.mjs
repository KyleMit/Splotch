import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROOT } from '../../lib/proc.mjs';
import {
  areasFor,
  classifyPath,
  CODE_MAP_PATH,
  subdomainOf,
  subjectOf,
  UnmappedPathError,
  webSrcDomainRuleOf,
} from '../lib/code-map-rules.mjs';

const trackedPaths = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);

describe('code map coverage', () => {
  // classifyPath throws unless a measured path matches exactly one area, so an
  // unplaced or doubly placed file surfaces here by name. A new top-level
  // directory lands here: add an area or exclusion for it in
  // tools/code-map/lib/code-map-rules.mjs, then run `npm run gen:code-map`.
  it('places every tracked file in exactly one exclusion class or measured area', () => {
    const unplaced = [];
    for (const path of trackedPaths()) {
      try {
        classifyPath(path);
      } catch (error) {
        if (!(error instanceof UnmappedPathError)) throw error;
        unplaced.push(error.message);
      }
    }
    expect(unplaced).toEqual([]);
  });

  it('refuses a path no area claims instead of guessing', () => {
    expect(() => classifyPath('brand-new-root/tool.ts')).toThrow(UnmappedPathError);
    expect(areasFor('brand-new-root/tool.ts')).toEqual([]);
  });
});

describe('exclusion classes', () => {
  it.each([
    ['web/src/CLAUDE.md', 'Generated / provider agent delivery trees'],
    ['.claude/skills/build/SKILL.md', 'Generated / provider agent delivery trees'],
    ['.agents/skills/build/SKILL.md', 'Generated / provider agent delivery trees'],
    ['web/static/favicon.ico', 'Binary media / archives'],
    ['docs/scratchpad/perf/run/trace.json.gz', 'Binary media / archives'],
    ['web/static/coloring/farm/cow.svg', 'Vector art assets / traced samples'],
    ['tools/model-eval/samples/gen__pizza__square.svg', 'Vector art assets / traced samples'],
    ['docs/scratchpad/perf/run/summary.json', 'Generated measurement data'],
    ['perf-profiles/evidence/run/capture.json', 'Generated measurement data'],
    ['tools/perf/tests/fixtures/frame-stamp-matrix/ipad.json', 'Generated measurement data'],
    ['docs/scratchpad/perf/run/memory.txt', 'Generated audit / ranking text and captured logs'],
    ['scrapbook/icons/index.html', 'Generated report / proof-sheet HTML'],
    ['tools/redteam/encrypted/case.enc', 'Archived payloads / hashes'],
    ['docs/scratchpad/perf/run/SHA256SUMS', 'Archived payloads / hashes'],
    [CODE_MAP_PATH, 'Code map output'],
  ])('excludes %s as %s', (path, exclusion) => {
    expect(classifyPath(path)).toEqual({ kind: 'excluded', exclusion });
  });

  it.each([
    ['.ruler/AGENTS.md', '.ruler', 'root instruction / config'],
    ['tools/.ruler/AGENTS.md', 'tools excluding asset-gen', 'instruction source'],
    ['web/src/lib/icons/brush.svg', 'web/src', 'Design system, styleguide + icons'],
    ['tools/asset-gen/package.json', 'tools/asset-gen', '(root)'],
    ['tools/store-drawings/samples/sun.svg', 'tools excluding asset-gen', 'store-drawings'],
    ['docs/scratchpad/perf/run/check.mjs', 'docs', 'scratchpad'],
    ['package.json', 'root', '(root)'],
  ])('measures %s in %s / %s', (path, area, bucket) => {
    expect(classifyPath(path)).toEqual({ kind: 'measured', area, bucket });
  });
});

describe('web/src domains', () => {
  it('files a co-located test and a test harness with the module they exercise', () => {
    expect(subjectOf('lib/storage.restore.integration.test.ts')).toBe('lib/storage');
    expect(subjectOf('lib/pwa/updatesTestHarness.ts')).toBe('lib/pwa/updates');
    expect(subjectOf('routes/api/report/+server.ts')).toBe('routes/api/report/+server.ts');
    expect(subjectOf('app.css')).toBe('app.css');
  });

  it.each([
    ['lib/drawing/crayonBrush.ts', 'Drawing / canvas engine', 'Stroke model & brush rendering'],
    [
      'lib/state/canvas.svelte.ts',
      'Drawing / canvas engine',
      'Engine orchestration & canvas integration',
    ],
    [
      'lib/drawing/aiImage.test.ts',
      'AI image generation',
      'Client pipeline, state & shared contracts',
    ],
    [
      'routes/api/generate-image/+server.ts',
      'AI image generation',
      'Server authorization, jobs, storage & endpoints',
    ],
    ['lib/components/AiDial.svelte', 'AI image generation', 'Generation, result & reporting UI'],
    ['lib/state/tool.svelte.ts', 'App state (runes)', null],
    ['lib/components/NewWidget.svelte', 'Core UI controls', null],
    ['lib/brandNewHelper.ts', 'Focused utilities / generated app data', null],
    ['tokens.css', 'Design system, styleguide + icons', null],
    ['app.css', 'Routes / app shell / dev surfaces', null],
    ['params/slug.ts', 'Routes / app shell / dev surfaces', null],
  ])('places %s in %s', (path, domain, subdomain) => {
    expect(webSrcDomainRuleOf(path).domain).toBe(domain);
    expect(subdomainOf(domain, path)).toBe(subdomain);
  });
});

describe('docs/CODE-MAP.md', () => {
  it('carries every generated block marker the generator splices into', () => {
    const document = readFileSync(join(ROOT, CODE_MAP_PATH), 'utf8');
    for (const block of ['snapshot', 'coverage', 'totals', 'splits']) {
      expect(document).toContain(`<!-- code-map:generated:start ${block} -->`);
      expect(document).toContain(`<!-- code-map:generated:end ${block} -->`);
    }
  });
});
