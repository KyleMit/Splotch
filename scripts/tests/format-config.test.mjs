import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Drift guard for the indent width and line width restated across the
// formatter configs. The files cannot share code (three tools, three
// vocabularies), so .editorconfig is the canonical statement and every
// formatter config must agree with it.

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const editorconfig = read('.editorconfig');
const editorconfigNumber = (key) => {
  const match = editorconfig.match(new RegExp(`^${key} = (\\d+)$`, 'm'));
  expect(match, `${key} missing from .editorconfig`).not.toBeNull();
  return Number(match[1]);
};

const INDENT_SIZE = editorconfigNumber('indent_size');
const MAX_LINE_LENGTH = editorconfigNumber('max_line_length');

const stripLineComments = (jsonc) => jsonc.replace(/^\s*\/\/.*$/gm, '');

describe('formatter configs agree with .editorconfig', () => {
  it('.prettierrc.json matches', () => {
    const prettier = JSON.parse(read('.prettierrc.json'));
    expect(prettier.tabWidth).toBe(INDENT_SIZE);
    expect(prettier.printWidth).toBe(MAX_LINE_LENGTH);
  });

  it('dprint.json matches', () => {
    const dprint = JSON.parse(stripLineComments(read('dprint.json')));
    expect(dprint.indentWidth).toBe(INDENT_SIZE);
    expect(dprint.lineWidth).toBe(MAX_LINE_LENGTH);
  });

  it('.vscode/settings.json matches', () => {
    const settings = JSON.parse(read('.vscode/settings.json'));
    expect(settings['[markdown]']['editor.tabSize']).toBe(INDENT_SIZE);
  });
});
