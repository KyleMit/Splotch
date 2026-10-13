import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  assertRsdTokenProjection,
  RSD_DRAWING_TOKENS_URL,
  rsdTokenSource,
} from '../lib/rsd-fixture-tokens.mjs';

const actual = () => readFileSync(RSD_DRAWING_TOKENS_URL, 'utf8');

it('renders the maintained token values in canonical project formatting', async () => {
  expect(await rsdTokenSource()).toBe(actual());
  await expect(assertRsdTokenProjection(actual())).resolves.toBeUndefined();
});

for (const [name, from, to] of [
  ['mapping', 'brandSolid:', 'unownedBrand:'],
  ['value', '#ffffff', '#010203'],
  ['registration', 'export const colors', 'export const unrelated'],
  ['format', 'export const colors', 'export   const colors'],
  ['touch target', "touchTarget: '52px'", "touchTarget: '51px'"],
  ['AI height', "aiResultHeight: '256px'", "aiResultHeight: '255px'"],
  ['brand group', 'export const brandColors', 'export const foreignBrand'],
]) {
  it(`rejects ${name} drift through the actual projection consumer`, async () => {
    const changed = actual().replace(from, to);
    expect(changed).not.toBe(actual());
    await expect(assertRsdTokenProjection(changed)).rejects.toThrow(
      'RSD drawing token projection drift'
    );
  });
}

const root = resolve(import.meta.dirname, '../../..');
const candidate = join(root, 'experiments/native-architecture');
const WEB_COMPILE_TIMEOUT_MS = 20_000;
const WEB_TEST_TIMEOUT_MS = 30_000;
const WEB_MAX_BUFFER_BYTES = 1024 * 1024;
const SELECTED_FOREGROUND_TOKEN_SPECIFIER = './tokens.css';
const WEB_STYLE_FILES = [
  'src/rsdDrawing/tokens.css.ts',
  'src/rsdDrawing/controls.tsx',
  'src/rsdDrawing/RsdAiSheet.tsx',
  'src/rsdDrawing/RsdFeedbackSheet.tsx',
];
const WEB_COMPILE_SOURCE = `
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const babel = require('@babel/core');
const result = babel.transformSync(readFileSync(0, 'utf8'), {
  filename: process.argv[1],
  cwd: process.cwd(),
  babelrc: false,
  configFile: join(process.cwd(), 'babel.config.cjs'),
  caller: { name: 'splotch-rsd-web-token-test', platform: 'web', supportsStaticESM: true },
});
assert.ok(result && typeof result.code === 'string');
assert.ok(Array.isArray(result.metadata.stylex));
assert.ok(result.metadata.stylex.length > 0);
assert.ok(!/\\bcss\\.create\\s*\\(/.test(result.code));
process.stdout.write(JSON.stringify({ stylex: result.metadata.stylex }));
`;

function compileWeb(file, source = readFileSync(join(candidate, file), 'utf8')) {
  return spawnSync(process.execPath, ['-e', WEB_COMPILE_SOURCE, join(candidate, file)], {
    cwd: candidate,
    input: source,
    encoding: 'utf8',
    timeout: WEB_COMPILE_TIMEOUT_MS,
    maxBuffer: WEB_MAX_BUFFER_BYTES,
  });
}

function compiledRules(result) {
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout).stylex;
}

function selectedForegroundRule() {
  const rules = compiledRules(
    compileWeb(
      'src/rsdDrawing/controls.tsx',
      `import { css } from 'react-strict-dom';
import { brandColors } from ${JSON.stringify(SELECTED_FOREGROUND_TOKEN_SPECIFIER)};
export const styles = css.create({ selected: { color: brandColors.onBrand } });`
    )
  );
  expect(rules).toHaveLength(1);
  return JSON.stringify(rules[0]);
}

function assertSelectedForeground(result, expected) {
  if (
    result.status !== 0 ||
    !JSON.parse(result.stdout).stylex.some((rule) => JSON.stringify(rule) === expected)
  )
    throw new Error('RSD selected foreground token');
}

it.each(WEB_STYLE_FILES)(
  'compiles actual web StyleX declarations in %s with the installed RSD preset',
  (file) => {
    expect(compiledRules(compileWeb(file)).length).toBeGreaterThan(0);
  },
  WEB_TEST_TIMEOUT_MS
);

it(
  'compiles the actual selected foreground from its defined token group',
  () => {
    expect(() =>
      assertSelectedForeground(compileWeb('src/rsdDrawing/controls.tsx'), selectedForegroundRule())
    ).not.toThrow();
  },
  WEB_TEST_TIMEOUT_MS
);

it.each([
  [
    'src/rsdDrawing/RsdAiSheet.tsx',
    'TOUCH_TARGET',
    '../drawing/theme',
    'minHeight: dimensions.touchTarget',
    'minHeight: TOUCH_TARGET',
  ],
  [
    'src/rsdDrawing/RsdFeedbackSheet.tsx',
    'TOUCH_TARGET',
    '../drawing/theme',
    'minHeight: dimensions.touchTarget',
    'minHeight: TOUCH_TARGET',
  ],
  [
    'src/rsdDrawing/RsdAiSheet.tsx',
    'AI_RESULT_HEIGHT_PX',
    '../ai/uiState',
    'height: dimensions.aiResultHeight',
    'height: AI_RESULT_HEIGHT_PX',
  ],
])(
  'rejects non-theme imported %s / %s in actual web StyleX',
  (file, name, owner, before, after) => {
    const original = readFileSync(join(candidate, file), 'utf8');
    expect(original.split(before)).toHaveLength(2);
    const changed = `import { ${name} } from '${owner}';\n` + original.replace(before, after);
    const result = compileWeb(file, changed);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Could not resolve the path to the imported file');
  },
  WEB_TEST_TIMEOUT_MS
);

it(
  'rejects a bare theme group that drops or invalidates the selected foreground',
  () => {
    const file = 'src/rsdDrawing/controls.tsx';
    const original = readFileSync(join(candidate, file), 'utf8');
    expect(original.split('color: brandColors.onBrand')).toHaveLength(2);
    const changed = original.replace('color: brandColors.onBrand', 'color: brandColors');
    const expected = selectedForegroundRule();
    expect(() => assertSelectedForeground(compileWeb(file, changed), expected)).toThrow(
      'RSD selected foreground token'
    );
  },
  WEB_TEST_TIMEOUT_MS
);
