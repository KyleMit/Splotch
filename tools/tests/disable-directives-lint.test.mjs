// @vitest-environment node
import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Positive control for the suppression discipline in eslint.config.js: each shape below is linted
// through the real config, so a block that drops the plugin, or a parser change that stops
// surfacing Svelte template comments, fails here instead of letting bare disables back in.
const repoRoot = join(import.meta.dirname, '..', '..');
const eslint = new ESLint({ cwd: repoRoot });

// The paths do not exist on disk — ESLint reads a file path only to pick the config blocks.
const directiveProblems = async (fixture, source) => {
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, fixture) });
  return result.messages
    .filter(
      (message) =>
        message.ruleId === 'disable-directives/require-disable-reason' ||
        message.ruleId === 'svelte/comment-directive' ||
        message.message.startsWith('Unused eslint-disable')
    )
    .map((message) => message.message);
};

const CONTROL_REGEX = 'export const escape = /\\x1b/;\n';
const HTML_TAG = '<script>\n  const markup = "<b>hi</b>";\n</script>\n\n';

describe('eslint-disable directives in scripts', () => {
  it('accepts a disable that names its rule and gives a reason', async () => {
    expect(
      await directiveProblems(
        'tools/probe.mjs',
        `// eslint-disable-next-line no-control-regex -- matching the escape byte\n${CONTROL_REGEX}`
      )
    ).toEqual([]);
  });

  it('rejects a disable with no reason', async () => {
    expect(
      await directiveProblems(
        'tools/probe.mjs',
        `// eslint-disable-next-line no-control-regex\n${CONTROL_REGEX}`
      )
    ).toEqual(["eslint-disable-next-line must say why after ' -- '."]);
  });

  it('rejects a disable that suppresses nothing', async () => {
    expect(
      await directiveProblems(
        'tools/probe.mjs',
        '// eslint-disable-next-line no-control-regex -- stale\nexport const one = 1;\n'
      )
    ).toHaveLength(1);
  });
});

describe('eslint-disable directives in Svelte templates', () => {
  it('accepts a disable that names its rule and gives a reason', async () => {
    expect(
      await directiveProblems(
        'web/src/lib/Probe.svelte',
        `${HTML_TAG}<!-- eslint-disable-next-line svelte/no-at-html-tags -- first-party markup -->\n{@html markup}\n`
      )
    ).toEqual([]);
  });

  it('rejects prose written without the separator', async () => {
    expect(
      await directiveProblems(
        'web/src/lib/Probe.svelte',
        `${HTML_TAG}<!-- eslint-disable-next-line svelte/no-at-html-tags first-party markup -->\n{@html markup}\n`
      )
    ).toContain("eslint-disable-next-line must say why after ' -- '.");
  });

  it('rejects a disable that suppresses nothing', async () => {
    expect(
      await directiveProblems(
        'web/src/lib/Probe.svelte',
        `${HTML_TAG}<!-- eslint-disable-next-line svelte/no-at-html-tags -- stale -->\n<p>{markup}</p>\n`
      )
    ).toHaveLength(1);
  });
});

// A disable that names no rule suppresses every rule from that point on — including the one
// that would report it — so that shape is caught by scanning the tracked source instead.
const BLANKET_DISABLE =
  /(?:\/\*|\/\/|<!--)\s*eslint-disable(?:-next-line|-line)?\s*(?:--[^\n]*?)?(?:\*\/|-->|$)/mu;
const LINTED_SOURCE = ['*.js', '*.mjs', '*.cjs', '*.ts', '*.mts', '*.svelte'];

describe('blanket eslint-disable directives', () => {
  it('appear nowhere in the tracked source', () => {
    const files = execFileSync('git', ['ls-files', '-z', '--', ...LINTED_SOURCE], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split('\0')
      .filter((file) => file && join(repoRoot, file) !== import.meta.filename);
    const offenders = files.filter((file) =>
      BLANKET_DISABLE.test(readFileSync(join(repoRoot, file), 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  it('matches a bare block disable', () => {
    expect(BLANKET_DISABLE.test('/* eslint-disable */')).toBe(true);
  });

  it('matches a described disable that names no rule', () => {
    expect(BLANKET_DISABLE.test('<!-- eslint-disable-next-line -- because -->')).toBe(true);
  });

  it('ignores a disable that names its rule', () => {
    expect(
      BLANKET_DISABLE.test('// eslint-disable-next-line no-control-regex -- escape byte')
    ).toBe(false);
  });
});
