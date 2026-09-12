// @vitest-environment node
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Two boundary-string bans live in no-restricted-syntax, and flat config REPLACES that rule's
// entry wherever a later block configures it. This control seeds each ban's evasions into every
// file shape, so a recomposition that silently drops a selector fails here instead of shipping an
// invariant nothing enforces.
//
// It exists because the first version of these guards was a text scan over the repo, and a text
// scan is exactly where this class of rule rots: a seeded localStorage['getItem'] and a seeded
// MISSPELLED media query both left it green. Every case below is one an earlier guard missed.
const repoRoot = join(import.meta.dirname, '..', '..');
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfig: [
    {
      files: ['web/src/**/*.ts'],
      languageOptions: { parserOptions: { projectService: false } },
      rules: { '@typescript-eslint/no-floating-promises': 'off' },
    },
  ],
});

const violations = async (fixture, source, fragment) => {
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, fixture) });
  return result.messages.filter(
    (message) => message.ruleId === 'no-restricted-syntax' && message.message.includes(fragment)
  );
};

const storageViolations = (fixture, source) => violations(fixture, source, 'STORAGE_KEYS');
const queryViolations = (fixture, source) =>
  violations(fixture, source, 'Import the query constant');

describe('the localStorage seam ban covers every spelling', () => {
  it('rejects ordinary dot access', async () => {
    expect(
      await storageViolations('web/src/lib/probe.ts', "localStorage.getItem('k');")
    ).toHaveLength(1);
  });

  // The text scan this replaced matched only dot access, so this spelling was invisible to it.
  it('rejects computed access', async () => {
    expect(
      await storageViolations('web/src/lib/probe.ts', "localStorage['getItem']('k');")
    ).toHaveLength(1);
  });

  it('rejects destructuring the global', async () => {
    expect(
      await storageViolations('web/src/lib/probe.ts', 'const { getItem } = localStorage;')
    ).toHaveLength(1);
  });

  it('rejects reaching it through window', async () => {
    expect(
      await storageViolations('web/src/lib/probe.ts', "window.localStorage.getItem('k');")
    ).toHaveLength(1);
  });

  // One property earlier than computed method access, and it names the global through a Literal
  // rather than an Identifier — the first replacement selector was blind to it.
  it('rejects computed access to the global itself', async () => {
    expect(
      await storageViolations('web/src/lib/probe.ts', "window['localStorage'].getItem('k');")
    ).toHaveLength(1);
  });

  it('rejects computed access through globalThis', async () => {
    expect(
      await storageViolations('web/src/lib/probe.ts', "globalThis['localStorage'].getItem('k');")
    ).toHaveLength(1);
  });

  it('rejects it in a rune module, where the Svelte block replaced the entry', async () => {
    expect(
      await storageViolations('web/src/lib/probe.svelte.ts', "localStorage.getItem('k');")
    ).toHaveLength(1);
  });

  it('allows the seam itself', async () => {
    expect(
      await storageViolations('web/src/lib/storage.ts', "localStorage.getItem('k');")
    ).toHaveLength(0);
  });

  it('allows a unit test, where reaching the real store is the point', async () => {
    expect(
      await storageViolations('web/src/lib/probe.test.ts', "localStorage.getItem('k');")
    ).toHaveLength(0);
  });
});

describe('the media-query literal ban closes the typo class', () => {
  it('rejects the correctly spelled query', async () => {
    expect(
      await queryViolations(
        'web/src/lib/probe.ts',
        "matchMedia('(prefers-reduced-motion: reduce)');"
      )
    ).toHaveLength(1);
  });

  // The point of banning the literal rather than matching the string: a text scan for the correct
  // spelling cannot see a typo, and a typo evaluates false forever.
  it('rejects a misspelled query, which a spelling scan cannot see', async () => {
    expect(
      await queryViolations(
        'web/src/lib/probe.ts',
        "matchMedia('(prefers-reduced-motoin: reduce)');"
      )
    ).toHaveLength(1);
  });

  it('rejects an optional call through window', async () => {
    expect(
      await queryViolations(
        'web/src/lib/probe.ts',
        "window.matchMedia?.('(display-mode: standalone)');"
      )
    ).toHaveLength(1);
  });

  it('rejects a computed matchMedia callee', async () => {
    expect(
      await queryViolations(
        'web/src/lib/probe.ts',
        "window['matchMedia']('(orientation: portrait)');"
      )
    ).toHaveLength(1);
  });

  it('rejects a template literal', async () => {
    expect(
      await queryViolations('web/src/lib/probe.ts', 'matchMedia(`(orientation: portrait)`);')
    ).toHaveLength(1);
  });

  it('rejects it in a rune module, where the Svelte block replaced the entry', async () => {
    expect(
      await queryViolations(
        'web/src/lib/probe.svelte.ts',
        "matchMedia('(prefers-reduced-motion: reduce)');"
      )
    ).toHaveLength(1);
  });

  it('allows a genuinely imported constant', async () => {
    const source = [
      "import { REDUCED_MOTION_QUERY } from '$lib/platform/reducedMotion';",
      'matchMedia(REDUCED_MOTION_QUERY);',
    ].join('\n');

    expect(await queryViolations('web/src/lib/probe.ts', source)).toHaveLength(0);
  });

  // The pre-existing call sites carry per-line disables rather than a whole-file exemption, so a
  // NEW literal in the same file is still rejected. A file-scoped allowlist made the rule's own
  // promise — that a new call site must import a constant — false.
  it.each([
    'web/src/lib/platform/index.ts',
    'web/src/lib/state/appearance.svelte.ts',
    'web/src/lib/state/layout.svelte.ts',
  ])('rejects a new literal in %s, which once held a file-wide exemption', async (fixture) => {
    expect(
      await queryViolations(fixture, "window.matchMedia('(prefers-reduced-motion: reduce)');")
    ).toHaveLength(1);
  });

  // Recorded so the rule's reach is written down rather than assumed. A selector cannot resolve a
  // binding, so a locally declared query still passes; closing that needs scope analysis and is
  // drafted as a follow-up. Stating the limit beats implying coverage the rule does not have.
  it('does not reach a locally declared query, which is a known limit', async () => {
    const source = ["const QUERY = '(prefers-reduced-motoin: reduce)';", 'matchMedia(QUERY);'].join(
      '\n'
    );

    expect(await queryViolations('web/src/lib/probe.ts', source)).toHaveLength(0);
  });
});
