// @vitest-environment node
import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import svelteParser from 'svelte-eslint-parser';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import lintConfig from '../../eslint.config.js';
import {
  DISABLE_DIRECTIVES_PLUGIN_NAME,
  REQUIRE_DISABLE_REASON_RULE_ID,
  disableDirectivesPlugin,
} from '../eslint-disable-directives.mjs';

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
        message.ruleId === REQUIRE_DISABLE_REASON_RULE_ID ||
        message.ruleId === 'svelte/comment-directive' ||
        message.message.startsWith('Unused eslint-disable')
    )
    .map((message) => message.message);
};

const CONTROL_REGEX = 'export const escape = /\\x1b/;\n';
const LINTED_SOURCE = ['*.js', '*.mjs', '*.cjs', '*.ts', '*.mts', '*.svelte'];
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

// A directive that names no rule, or names the enforcing rule, suppresses the report that would
// flag it. So the tracked source is also linted with inline config off — where no directive
// suppresses anything — and only the enforcing rule enabled. Parsing, rather than matching raw
// text, keeps a directive quoted inside a string literal from counting.
const scanner = new ESLint({
  cwd: repoRoot,
  overrideConfigFile: true,
  overrideConfig: [
    lintConfig.find((block) => Object.keys(block).length === 1 && block.ignores),
    { files: ['**/*.{js,mjs,cjs,ts,mts}'], languageOptions: { parser: tseslint.parser } },
    {
      files: ['**/*.svelte'],
      languageOptions: { parser: svelteParser, parserOptions: { parser: tseslint.parser } },
    },
    {
      files: ['**/*.{js,mjs,cjs,ts,mts,svelte}'],
      linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
      plugins: { [DISABLE_DIRECTIVES_PLUGIN_NAME]: disableDirectivesPlugin },
      rules: { [REQUIRE_DISABLE_REASON_RULE_ID]: 'error' },
    },
  ],
});

const unsuppressibleProblems = async (fixture, source) => {
  const [result] = await scanner.lintText(source, { filePath: join(repoRoot, fixture) });
  return result.messages.filter((message) => message.ruleId === REQUIRE_DISABLE_REASON_RULE_ID);
};

describe('directives that would suppress their own report', () => {
  it('appear nowhere in the tracked source', async () => {
    // git grep is only the candidate filter — every directive contains the text, but so does a
    // string that quotes one, which the parse below then rules out.
    const files = execFileSync(
      'git',
      ['grep', '-l', '-z', '--fixed-strings', 'eslint-disable', '--', ...LINTED_SOURCE],
      { cwd: repoRoot, encoding: 'utf8' }
    )
      .split('\0')
      .filter(Boolean);
    const results = await scanner.lintFiles(files);
    const offenders = results.flatMap((result) =>
      result.messages
        .filter((message) => message.ruleId === REQUIRE_DISABLE_REASON_RULE_ID)
        .map((message) => `${result.filePath}:${message.line} ${message.message}`)
    );
    expect(offenders).toEqual([]);
  });

  it('flags a blanket disable', async () => {
    expect(
      await unsuppressibleProblems(
        'tools/probe.mjs',
        `/* eslint-disable -- a reason */\n${CONTROL_REGEX}`
      )
    ).toHaveLength(1);
  });

  it('flags a disable of the enforcing rule', async () => {
    expect(
      await unsuppressibleProblems(
        'tools/probe.mjs',
        `/* eslint-disable ${REQUIRE_DISABLE_REASON_RULE_ID} -- a reason */\n${CONTROL_REGEX}`
      )
    ).toHaveLength(1);
  });

  it('flags a blanket disable in a Svelte template', async () => {
    expect(
      await unsuppressibleProblems(
        'web/src/lib/Probe.svelte',
        `${HTML_TAG}<!-- eslint-disable -- a reason -->\n{@html markup}\n`
      )
    ).toHaveLength(1);
  });

  it('ignores a directive quoted in a string', async () => {
    expect(
      await unsuppressibleProblems(
        'tools/probe.mjs',
        'export const fixture = "/* eslint-disable */";\n'
      )
    ).toEqual([]);
  });
});
