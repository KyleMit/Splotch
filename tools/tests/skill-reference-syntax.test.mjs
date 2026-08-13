import { describe, expect, it } from 'vitest';
import {
  findFileViolations,
  findViolations,
  registeredSkillNames,
  scannedFiles,
} from '../check-skill-reference-syntax.mjs';

const NAMES = ['build', 'release', 'create-adr'];
const tokensIn = (violations) => violations.map((v) => v.token);

describe('skill reference vocabulary', () => {
  const names = registeredSkillNames();

  it('covers authored skills and the direct provider packages', () => {
    expect(names).toContain('release');
    expect(names).toContain('run-claude');
    expect(names).toContain('burn-down-audits');
  });

  it('drops the names that are also live app routes', () => {
    expect(names).not.toContain('api');
    expect(names).not.toContain('design');
  });
});

describe('shared surfaces', () => {
  it('flags either runner sigil', () => {
    const md = 'Run `/build`, then `$release`.';
    expect(tokensIn(findFileViolations('.ruler/skills/x/SKILL.md', md, NAMES))).toEqual([
      '/build',
      '$release',
    ]);
  });

  it('flags a slash name in generated Codex-facing output', () => {
    const violations = findFileViolations('AGENTS.md', 'use `/create-adr` to record it', NAMES);
    expect(tokensIn(violations)).toEqual(['/create-adr']);
  });

  it('accepts the bare name', () => {
    expect(findFileViolations('.ruler/knowledge-map.md', 'the `build` skill', NAMES)).toEqual([]);
  });

  it('reports the file and line of each hit', () => {
    const violations = findFileViolations('docs/CONTRIBUTING.md', 'ok\nrun /release now', NAMES);
    expect(violations).toMatchObject([
      { file: 'docs/CONTRIBUTING.md', line: 2, token: '/release' },
    ]);
  });
});

describe('runner-specific trees', () => {
  it('lets a Claude package keep slash syntax', () => {
    expect(findFileViolations('.claude/skills/x/SKILL.md', 'run `/build`', NAMES)).toEqual([]);
  });

  it('lets a Codex package keep dollar syntax', () => {
    expect(findFileViolations('.agents/skills/x/SKILL.md', 'run `$build`', NAMES)).toEqual([]);
  });

  it('still flags the other runner sigil inside each tree', () => {
    expect(tokensIn(findFileViolations('.agents/skills/x/SKILL.md', '`/build`', NAMES))).toEqual([
      '/build',
    ]);
    expect(tokensIn(findFileViolations('.claude/skills/x/SKILL.md', '`$build`', NAMES))).toEqual([
      '$build',
    ]);
  });

  it('exempts the historical Claude-only ADR', () => {
    const path = 'docs/adrs/0018-claude-native-knowledge-tiers.md';
    expect(findFileViolations(path, '`/testing` are also directly invocable', NAMES)).toEqual([]);
  });
});

describe('things that are not skill references', () => {
  it.each([
    ['a repo path', 'docs/README.md', 'see tools/release/cut-release.mjs'],
    ['a glob', 'dprint.json', '"android/**/build",'],
    ['a longer route', 'docs/README.md', 'the `/releases` page'],
    ['a hyphenated path', 'docs/README.md', '`/build-outputs/app.aab`'],
    ['a shell variable', 'docs/README.md', 'echo "${build}" and $buildDir'],
  ])('ignores %s', (_label, file, line) => {
    expect(findFileViolations(file, line, NAMES)).toEqual([]);
  });

  it('ignores a regex literal in a script', () => {
    const source = 'expect(() => parse()).toThrow(/release\\.mjs <semver>/);';
    expect(findFileViolations('tools/release/tests/a.test.mjs', source, NAMES)).toEqual([]);
  });

  it('still flags user-facing prose in a script', () => {
    const source = '  fail(`Run /build (or npm run android:bundle) first.`);';
    expect(tokensIn(findFileViolations('tools/release/publish.mjs', source, NAMES))).toEqual([
      '/build',
    ]);
  });
});

// The guard that keeps the misleading form from coming back: shared sources,
// both generated provider trees, the human docs, and the release tooling's own
// output all have to stay neutral (issue #991).
describe('the repository', () => {
  it('has no runner-specific skill sigils in shared prose', () => {
    expect(findViolations()).toEqual([]);
  });

  // Without this exemption the suite fails on its own fixtures, and the
  // tempting fix is to soften the matcher until they stop matching.
  it('skips this suite, which has to spell the form it rejects', () => {
    expect(scannedFiles()).not.toContain('tools/tests/skill-reference-syntax.test.mjs');
  });
});
