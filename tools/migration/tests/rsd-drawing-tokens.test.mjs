import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { brand, scale, themes } from '../../../web/src/lib/design/tokens.ts';
import * as rsdTokens from '../../../experiments/native-architecture/src/rsdDrawing/tokens.css.ts';
import {
  assertRsdTokenProjection,
  RSD_DRAWING_TOKENS_URL,
  RSD_UNPROJECTED_TOKENS,
  rsdTokenSource,
} from '../lib/rsd-fixture-tokens.mjs';

vi.mock('react-strict-dom', () => ({
  css: { defineVars: (vars) => vars, createTheme: (_vars, overrides) => overrides },
}));

const actual = () => readFileSync(RSD_DRAWING_TOKENS_URL, 'utf8');
const appCss = readFileSync(new URL('../../../web/src/app.css', import.meta.url), 'utf8');
// The color parser the installed React Native resolves, which Android and iOS styles pass through.
const normalizeColor = createRequire(
  createRequire(import.meta.url).resolve('react-native/package.json')
)('@react-native/normalize-colors');

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

const SHIPPING = { themes, scale, brand, appCss };
const APP_CSS_DIMENSIONS = [
  ['touch-target-min', 'touchTargetMin'],
  ['modal-gutter-min', 'modalGutterMin'],
  ['setting-icon-size', 'settingIconSize'],
  ['setting-icon-gap', 'settingIconGap'],
];
const SCALE_GROUPS = ['dimensions', 'fixedColors', 'shadows', 'motion'];
const CORNERS = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'];
const LENGTH = /^-?\d*\.?\d+(?:px)?$/;

const canonical = (value) =>
  value === undefined
    ? undefined
    : String(value).replace(
        /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)(?:\s*[,/]\s*([\d.]+)(%?))?\)/g,
        (_, red, green, blue, alpha = '1', percent) =>
          `rgba(${red},${green},${blue},${percent ? Number(alpha) / 100 : Number(alpha)})`
      );

function radii(list) {
  const [a, b = a, c = a, d = b] = list.trim().split(/\s+/).map(Number.parseFloat);
  return [a, b, c, d];
}

function blobMeans(shorthand) {
  const [across, down = across] = shorthand.split('/').map(radii);
  return across.map((value, index) => `${(value + down[index]) / 2}%`).join(' ');
}

function appCssPx(css, name) {
  return new RegExp(`--${name}: (\\d+)px;`).exec(css)?.[1];
}

function scaleProjection(rsd, key, value) {
  const weight = /^fontWeight(\w)(\w*)$/.exec(key);
  if (key === 'fontFamily') return [rsd.fonts.family, value];
  if (weight) return [rsd.fonts[`${weight[1].toLowerCase()}${weight[2]}Weight`], value];
  if (key === 'fontSizeDisplay') {
    const { fontSizeDisplayMin: min, fontSizeDisplayMax: max } = rsd.dimensions;
    const { viewportWidthPercent, offsetPx } = rsd.fontSizeDisplayFluid;
    return [`clamp(${min}, ${viewportWidthPercent}vw + ${offsetPx}px, ${max})`, value];
  }
  if (/^radiusBlob\d$/.test(key))
    return [
      `${CORNERS.map((corner) => rsd.dimensions[`${key}${corner}`]).join(' ')} | ${rsd.blobShapes[key]}`,
      `${blobMeans(value)} | ${value}`,
    ];
  const owners = SCALE_GROUPS.filter((group) => Object.hasOwn(rsd[group], key));
  if (owners.length !== 1) return [`${key} in ${owners.length} groups`, value];
  return [canonical(rsd[owners[0]][key]), canonical(value)];
}

// Every shipping token, light and dark, is projected at its shipping value or listed
// as unprojected; a token added or changed upstream fails until the file is regenerated.
function assertShippingParity(rsd, shipping) {
  const problems = [];
  const check = (label, [projected, expected]) => {
    if (projected !== expected) problems.push(`${label}: ${projected} !== ${expected}`);
  };
  for (const [mode, group] of [
    ['light', rsd.colors],
    ['dark', rsd.darkTheme],
  ])
    for (const [key, value] of Object.entries(shipping.themes[mode])) {
      if (!Object.hasOwn(RSD_UNPROJECTED_TOKENS, key))
        check(`${mode} ${key}`, [canonical(group[key]), canonical(value)]);
      else if (Object.hasOwn(group, key)) problems.push(`${mode} ${key} is listed and projected`);
    }
  for (const [key, value] of Object.entries(shipping.brand))
    check(`brand ${key}`, [rsd.brandColors[key], value]);
  for (const [key, value] of Object.entries(shipping.scale))
    if (!Object.hasOwn(RSD_UNPROJECTED_TOKENS, key))
      check(`scale ${key}`, scaleProjection(rsd, key, value));
  for (const [name, key] of APP_CSS_DIMENSIONS)
    check(`app.css --${name}`, [rsd.dimensions[key], `${appCssPx(shipping.appCss, name)}px`]);
  check('app.css --setting-indent', [
    rsd.dimensions.settingIndent,
    `${Number(appCssPx(shipping.appCss, 'setting-icon-size')) + Number(appCssPx(shipping.appCss, 'setting-icon-gap'))}px`,
  ]);
  assert.deepEqual(problems, []);
}

function shadowParts(shadow) {
  return shadow.split(/,(?![^(]*\))/).map((layer) => layer.trim().split(/\s+(?![^(]*\))/));
}

// Android and iOS read these through React Native's own parsers: no slash alpha,
// calc(), clamp(), var() or two-value radius survives that trip.
function assertNativeReadable(rsd) {
  const problems = [];
  const expectColor = (label, value) => {
    if (normalizeColor(value) === null) problems.push(`${label}: ${value}`);
  };
  const expectShadow = (label, value) => {
    for (const parts of shadowParts(value)) {
      const lengths = parts.filter((part) => LENGTH.test(part));
      const colors = parts.filter((part) => !LENGTH.test(part));
      if (lengths.length < 2 || lengths.length > 4 || colors.length !== 1)
        problems.push(`${label}: ${value}`);
      for (const color of colors) expectColor(label, color);
    }
  };
  for (const group of [rsd.colors, rsd.darkTheme, rsd.brandColors, rsd.fixedColors])
    for (const [key, value] of Object.entries(group)) {
      if (key === 'floatShadow') expectShadow(key, value);
      else if (key === 'clearGradientRest') {
        const stops = /^linear-gradient\(\d+deg, (.+)\)$/.exec(value)?.[1].split(', ') ?? [];
        if (stops.length < 2) problems.push(`${key}: ${value}`);
        for (const stop of stops) expectColor(key, stop);
      } else expectColor(key, value);
    }
  for (const [key, value] of Object.entries(rsd.shadows)) expectShadow(key, value);
  for (const [key, value] of Object.entries(rsd.dimensions))
    if (!/^\d*\.?\d+(?:px|%)?$/.test(value)) problems.push(`${key}: ${value}`);
  for (const [key, value] of Object.entries(rsd.motion)) {
    const curve = /^cubic-bezier\(([^)]+)\)$/.exec(value)?.[1].split(',').map(Number);
    const readable = key.startsWith('duration')
      ? /^\d*\.?\d+m?s$/.test(value)
      : curve?.length === 4 &&
        curve.every(Number.isFinite) &&
        [curve[0], curve[2]].every((x) => x >= 0 && x <= 1);
    if (!readable) problems.push(`${key}: ${value}`);
  }
  assert.deepEqual(problems, []);
}

it('projects every shipping token, light and dark, at its shipping value', () => {
  expect(() => assertShippingParity(rsdTokens, SHIPPING)).not.toThrow();
});

const shippingWith = (edit) => {
  const copy = structuredClone(SHIPPING);
  edit(copy);
  return copy;
};

it.each([
  ['a changed light color', (s) => (s.themes.light.surface = '#fefefe')],
  ['a changed dark color', (s) => (s.themes.dark.textSoft = '#bdbbc9')],
  ['an added themed color', (s) => (s.themes.dark.newInk = '#123456')],
  ['an added scale token', (s) => (s.scale.space9 = '48px')],
  ['an added brand token', (s) => (s.brand.brandDeep = '#5a2d91')],
  ['a changed shadow alpha', (s) => (s.scale.shadowPop = '0 8px 32px rgb(0 0 0 / 31%)')],
  ['a changed easing', (s) => (s.scale.easeGlide = 'cubic-bezier(0.22, 1, 0.36, 0.9)')],
  ['a changed blob radius', (s) => (s.scale.radiusBlob2 = '45% 55% 48% 52% / 55% 45% 58% 40%')],
  [
    'a changed fluid display term',
    (s) => (s.scale.fontSizeDisplay = 'clamp(34px, 3vw + 17px, 46px)'),
  ],
  ['a changed weight', (s) => (s.scale.fontWeightSemibold = '650')],
  [
    'a changed app.css touch target',
    (s) => (s.appCss = s.appCss.replace('--touch-target-min: 48px', '--touch-target-min: 44px')),
  ],
  [
    'a changed app.css settings icon',
    (s) => (s.appCss = s.appCss.replace('--setting-icon-gap: 10px', '--setting-icon-gap: 12px')),
  ],
])('rejects %s that was not regenerated', (_, edit) => {
  expect(() => assertShippingParity(rsdTokens, shippingWith(edit))).toThrow();
});

it('rejects a projected token that is also listed as unprojected', () => {
  const colors = { ...rsdTokens.colors, surfaceRgb: themes.light.surfaceRgb };
  expect(() => assertShippingParity({ ...rsdTokens, colors }, SHIPPING)).toThrow();
});

it('keeps every projected value readable by the React Native style parsers', () => {
  expect(() => assertNativeReadable(rsdTokens)).not.toThrow();
});

it.each([
  ['slash alpha', 'colors', 'sliderNotch', 'rgb(0 0 0 / 22%)'],
  ['a slash-alpha shadow', 'shadows', 'shadowControl', '0 1px 4px rgb(0 0 0 / 18%)'],
  ['an elliptical radius', 'dimensions', 'radiusBlob1TopLeft', '58% 45%'],
  ['a clamp()', 'dimensions', 'fontSizeDisplayMin', 'clamp(34px, 3.2vw + 17px, 46px)'],
  [
    'an out-of-range easing control point',
    'motion',
    'easePop',
    'cubic-bezier(1.34, 1.56, 0.64, 1)',
  ],
])('rejects %s that React Native cannot read', (_, group, key, value) => {
  const changed = { ...rsdTokens, [group]: { ...rsdTokens[group], [key]: value } };
  expect(() => assertNativeReadable(changed)).toThrow();
});

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
  'src/rsdDrawing/RsdParentGateKeypad.tsx',
  'src/rsdDrawing/RsdParentGateSheet.tsx',
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
