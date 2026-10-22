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
    ['src/CLAUDE.md', 'Generated / provider agent delivery trees'],
    ['.claude/skills/build/SKILL.md', 'Generated / provider agent delivery trees'],
    ['.agents/skills/build/SKILL.md', 'Generated / provider agent delivery trees'],
    ['assets/static/favicon.ico', 'Binary media / archives'],
    ['docs/scratchpad/perf/run/trace.json.gz', 'Binary media / archives'],
    ['assets/static/coloring/farm/cow.svg', 'Vector art assets / traced samples'],
    ['tools/model-eval/samples/gen__pizza__square.svg', 'Vector art assets / traced samples'],
    ['docs/scratchpad/perf/run/summary.json', 'Generated measurement data'],
    [
      'docs/migration/evidence/native-topology-05/script-inventory.json',
      'Generated measurement data',
    ],
    [
      'docs/migration/evidence/native-topology-05/controls/install.log.txt',
      'Generated audit / ranking text and captured logs',
    ],
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
    ['assets/icons/brush.svg', 'root', 'assets'],
    ['tools/asset-gen/package.json', 'tools/asset-gen', '(root)'],
    ['tools/store-drawings/samples/sun.svg', 'tools excluding asset-gen', 'store-drawings'],
    ['docs/scratchpad/perf/run/check.mjs', 'docs', 'scratchpad'],
    ['package.json', 'root', '(root)'],
    ['src/ProbeApp.tsx', 'src', 'App shell / information pages'],
    ['docs/migration/evidence/native-topology-05/README.md', 'docs', 'migration'],
  ])('measures %s in %s / %s', (path, area, bucket) => {
    expect(classifyPath(path)).toEqual({ kind: 'measured', area, bucket });
  });
});

describe('src domains', () => {
  it('files a co-located test and a test harness with the module they exercise', () => {
    expect(subjectOf('lib/storage.restore.integration.test.ts')).toBe('lib/storage');
    expect(subjectOf('lib/pwa/updatesTestHarness.ts')).toBe('lib/pwa/updates');
    expect(subjectOf('pageDocument/admin/adminContract.ts')).toBe(
      'pageDocument/admin/adminContract'
    );
    expect(subjectOf('app.css')).toBe('app.css');
  });

  it.each([
    ['drawing/renderer.ts', 'Drawing / canvas engine', 'Native / web rendering, input & history'],
    ['clear/dragToClear.ts', 'Drawing / canvas engine', 'Clear gesture & animation'],
    [
      'lib/drawing/paperLayout.test.ts',
      'Drawing / canvas engine',
      'Bundled coloring assets & paper layout',
    ],
    ['ai/generation.ts', 'AI image generation', 'Client transport, recovery & generation state'],
    ['lib/ai/generationResult.ts', 'AI image generation', 'Shared contracts & progress geometry'],
    ['rsdDrawing/RsdAiResult.tsx', 'AI image generation', 'Generation, result & reporting UI'],
    ['pageDocument/admin/adminContract.ts', 'Web admin console', null],
    ['settings/orientation.ts', 'Settings / parent center', null],
    ['useSavePicture.ts', 'Storage / picture export', null],
    ['useDrawingSound.ts', 'Audio', null],
    ['drawingMessages.ts', 'Drawing / canvas engine', 'Native / web rendering, input & history'],
    ['offlineLibrary/controller.ts', 'Coloring books + offline library', null],
    ['rsdDrawing/RsdButton.tsx', 'Core UI controls', null],
    ['lib/brandNewHelper.ts', 'Focused utilities / generated app data', null],
    ['strict.css', 'Design system, styleguide + icons', null],
    ['information/privacy.ts', 'App shell / information pages', null],
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
