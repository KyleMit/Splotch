import { describe, expect, it } from 'vitest';
import {
  findFileViolations,
  findViolations,
  registeredSkillNames,
  scannedFiles,
} from '../check-skill-reference-syntax.mjs';

const NAMES = ['build', 'cut-release', 'create-adr'];
const tokensIn = (violations) => violations.map((v) => v.token);

describe('skill reference vocabulary', () => {
  const names = registeredSkillNames();

  it('covers authored skills and the direct provider packages', () => {
    expect(names).toContain('cut-release');
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
    const md = 'Run `/build`, then `$cut-release`.';
    expect(tokensIn(findFileViolations('.ruler/skills/x/SKILL.md', md, NAMES))).toEqual([
      '/build',
      '$cut-release',
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
    const violations = findFileViolations(
      'docs/CONTRIBUTING.md',
      'ok\nrun /cut-release now',
      NAMES
    );
    expect(violations).toMatchObject([
      { file: 'docs/CONTRIBUTING.md', line: 2, token: '/cut-release' },
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

  it.each([
    ['a regex literal argument', 'expect(() => parse()).toThrow(/release\\.mjs <semver>/);'],
    ['a regex literal with a colon', 'expect(source).toMatch(/release:publish/);'],
    ['a bare regex literal', 'const pattern = /release/;'],
    ['a regex whose body holds a quote', "const re = /don't-build/;\nfail('ok');"],
    ['a division', 'const perBuild = total / buildCount;'],
  ])('ignores %s in a script', (_label, source) => {
    expect(findFileViolations('tools/release/example.mjs', source, NAMES)).toEqual([]);
  });
});

// Masking code rather than narrowing what counts as an opener is what keeps
// these in scope: each is a punctuation-delimited string or comment that looks
// exactly like a regex argument until you know the delimiter is inside a
// string. Each mirrors a line shape the guard's own PR removed from the release
// tooling, so re-adding one with a registered skill name turns the suite red.
describe('the user-facing shapes this guard exists to catch', () => {
  it.each([
    [
      'a parenthesized name inside a template literal',
      "`Cut the release first (/cut-release), then build, then publish.\\n${probe.stderr ?? ''}`",
      '/cut-release',
    ],
    [
      'a name before an interpolation',
      "`Run /build (or ${missing.map((a) => a.rebuild).join(' / ')}) first.`",
      '/build',
    ],
    [
      'a name after an interpolation',
      '`Missing ${file}\\nThere is no release notes file for ${v} — run /cut-release first.`',
      '/cut-release',
    ],
    [
      'a name inside a single-quoted string',
      "console.log('  /build                 (or npm run android:bundle / npm run ios:ipa)');",
      '/build',
    ],
    [
      'a name opening a line comment',
      '// /cut-release slash command writes it). This is the deterministic, scriptable half',
      '/cut-release',
    ],
    [
      'a name ending a line comment',
      '// until after this script bumps and commits the version. Building them is /build',
      '/build',
    ],
  ])('flags %s', (_label, source, token) => {
    const violations = findFileViolations('tools/release/publish.mjs', source, NAMES);
    expect(tokensIn(violations)).toEqual([token]);
  });
});

// The guard that keeps the misleading form from coming back: shared sources,
// both generated provider trees, the human docs, and the release tooling's own
// output all have to stay neutral (issue #991).
describe('the repository', () => {
  it('has no runner-specific skill sigils in shared prose', () => {
    expect(findViolations()).toEqual([]);
  });

  // Without this exemption the guard fails on its own fixtures and worked
  // examples, and the tempting fix is to soften the matcher until they stop
  // matching — which is exactly the hole this suite exists to keep shut.
  it.each([
    'tools/check-skill-reference-syntax.mjs',
    'tools/tests/skill-reference-syntax.test.mjs',
  ])('skips %s, which has to spell the form it rejects', (file) => {
    expect(scannedFiles()).not.toContain(file);
  });
});
