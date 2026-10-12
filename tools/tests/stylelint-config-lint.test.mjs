// @vitest-environment node
import { join } from 'node:path';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

// stylelint.config.js is a lint fence with the failure mode of every lint fence: a rule deleted
// from it, an ignoreFiles entry widened over web/src, or a lost postcss-html override reports
// nothing, and a lint run that reports nothing looks the same as a clean repo. So each case seeds
// one defect and lints it through the config stylelint discovers for the path, the same lookup
// `npm run lint:css` makes, rather than through a config built for the test.
const repoRoot = join(import.meta.dirname, '..', '..');

// Neither path exists on disk. Stylelint reads a path only to find its config, apply ignoreFiles,
// and pick the syntax: a plain stylesheet, and a component whose <style> block postcss-html
// extracts.
const STYLESHEET = 'web/src/lib/seeded-defect.css';
const COMPONENT = 'web/src/lib/components/SeededDefect.svelte';

const rulesReportedFor = async (path, css) => {
  const code = path.endsWith('.svelte') ? `<div></div>\n<style>\n${css}\n</style>\n` : css;
  const { results } = await stylelint.lint({
    code,
    codeFilename: join(repoRoot, path),
    cwd: repoRoot,
  });
  return results[0].warnings.map((warning) => warning.rule);
};

const SHAPED_KEYFRAMES =
  '@keyframes pop { 0% { scale: 0.8; } 60% { scale: 1.05; } 100% { scale: 1; } }';

// The rules the root instructions name: CSS the parser keeps and the browser never applies, the
// modern colour notation, and the repo's own keyframe-curve plugin.
const SEEDED_RULE_DEFECTS = [
  ['media-feature-name-no-unknown', '@media (prefers-reduced-motoin: reduce) { .a { top: 0; } }'],
  ['property-no-unknown', '.a { colr: red; }'],
  ['selector-pseudo-class-no-unknown', '.a:focus-visable { color: red; }'],
  ['color-function-notation', '.a { color: rgb(0, 0, 0); }'],
  ['alpha-value-notation', '.a { color: rgb(0 0 0 / 0.6); }'],
  ['color-function-alias-notation', '.a { color: rgba(0 0 0 / 60%); }'],
  ['splotch/keyframe-curves', `${SHAPED_KEYFRAMES} .a { animation: pop 300ms ease-out; }`],
];

// A bare or needless disable is the cheapest way to defeat any rule above, and no rule id
// reports it: the three report* options at the top of the config do.
const SEEDED_DISABLE_DEFECTS = [
  [
    '--report-descriptionless-disables',
    '/* stylelint-disable-next-line property-no-unknown */\n.a { colr: red; }',
  ],
  [
    '--report-needless-disables',
    '/* stylelint-disable-next-line property-no-unknown -- seeded */\n.a { color: red; }',
  ],
  [
    '--report-invalid-scope-disables',
    '/* stylelint-disable-next-line color-named -- seeded */\n.a { color: red; }',
  ],
];

describe.each([STYLESHEET, COMPONENT])('stylelint.config.js lints %s', (path) => {
  it.each([...SEEDED_RULE_DEFECTS, ...SEEDED_DISABLE_DEFECTS])('reports %s', async (id, css) => {
    expect(await rulesReportedFor(path, css)).toContain(id);
  });
});
