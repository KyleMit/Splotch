import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { themes, scale, brand, isColorToken } from '../../../web/src/lib/design/tokens.ts';
import { TOUCH_TARGET } from '../../../experiments/native-architecture/src/drawing/theme.ts';
import { AI_RESULT_HEIGHT_PX } from '../../../experiments/native-architecture/src/ai/uiState.ts';
import { BLACK_INK } from '../../../web/src/lib/palette.ts';

const APP_CSS_URL = new URL('../../../web/src/app.css', import.meta.url);

// Shipping tokens with no RSD projection, each with the reason. Every other key of
// themes, scale and brand is projected, so a new shipping token lands in the
// generated file (and fails the drift check) until it is regenerated or listed here.
export const RSD_UNPROJECTED_TOKENS = {
  surfaceRgb: 'Bare channels for rgb(var() / alpha); React Native cannot compose a color.',
  glassTintRgb: 'Bare channels for rgb(var() / alpha); React Native cannot compose a color.',
  tapeStrength: 'A color-mix() strength; React Native has no color-mix().',
  squiggleStrength: 'A color-mix() strength; React Native has no color-mix().',
  glassRail: 'A color-mix() strength; React Native has no color-mix().',
  glassStrip: 'A color-mix() strength; React Native has no color-mix().',
  blobShadow: 'A color-mix() over another token; React Native has no color-mix().',
  ruleBlend: 'Paper ruling effect; the native paper is drawn by Skia, not RSD.',
  ruleOpacity: 'Paper ruling effect; the native paper is drawn by Skia, not RSD.',
  ruleSecondaryOpacity: 'Paper ruling effect; the native paper is drawn by Skia, not RSD.',
  lineartFilter: 'Coloring-page line art effect; the native paper is drawn by Skia, not RSD.',
  lineartBlend: 'Coloring-page line art effect; the native paper is drawn by Skia, not RSD.',
  inputFontSize: 'The iOS Safari focus-zoom floor (ADR-0076); native inputs never zoom.',
  fontMono: 'A CSS family list; React Native takes one installed family per platform.',
};

const THEMED_EFFECT_KEYS = new Set(['floatShadow']);
// The Step Number's color-mix() strengths, carried as plain numbers so the native badge can mix
// its wash and digit ink the way the shipping .step-number rule does.
const STEP_NUMBER_MIX_KEYS = { stepWashStrength: 'washPercent', stepInkStrength: 'inkPercent' };
const FIXED_COLOR_KEYS = new Set([
  'clearGradientRest',
  'polaroidPaper',
  'polaroidInk',
  'scrimInk',
  'scrimInkDanger',
  'scrimInkSoft',
  'scrimPill',
]);
const DIMENSION_KEY = /^(?:space\d|radius(?:Sm|Md|Lg|Pill)$|fontSize(?:Xs|Sm|Md|Lg|Xl)$)/;
const DIMENSION_KEYS = new Set([
  'borderWidth',
  'focusRingWidth',
  'focusRingOffset',
  'disabledOpacity',
]);
const BLOB_KEY = /^radiusBlob\d$/;
const SHADOW_KEY = /^shadow[A-Z]/;
const MOTION_KEY = /^(?:duration|ease)[A-Z]/;
const FONT_WEIGHT_KEY = /^fontWeight([A-Z]\w*)$/;
const CORNERS = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'];
const PERCENT_ROUNDING = 100;

// The released React Native color parser rejects percentage alpha, so slash
// notation is rewritten to the comma rgba() form every renderer reads.
function portableColor(value) {
  return value.replace(
    /rgb\((\d+) (\d+) (\d+) \/ (\d+(?:\.\d+)?)%\)/g,
    (_, red, green, blue, alpha) => `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 100})`
  );
}

// CSS border-radius shorthand to its four corners, horizontal and vertical radii apart.
function expandRadii(list) {
  const values = list.trim().split(/\s+/);
  const [a, b = a, c = a, d = b] = values;
  if (values.length > CORNERS.length) throw new Error(`Unexpected radius list: ${list}`);
  return [a, b, c, d].map((value) => {
    const percent = /^(\d+(?:\.\d+)?)%$/.exec(value)?.[1];
    if (percent === undefined) throw new Error(`Blob radius is not a percentage: ${value}`);
    return Number(percent);
  });
}

// React Native takes one radius per corner, so each elliptical blob corner keeps
// the mean of its horizontal and vertical radii.
function blobRadii(shorthand) {
  const [horizontal, vertical = horizontal] = shorthand.split('/');
  return { horizontal: expandRadii(horizontal), vertical: expandRadii(vertical) };
}

function blobCorners(shorthand) {
  const { horizontal: across, vertical: down } = blobRadii(shorthand);
  return Object.fromEntries(
    CORNERS.map((corner, index) => [
      corner,
      `${Math.round(((across[index] + down[index]) / 2) * PERCENT_ROUNDING) / PERCENT_ROUNDING}%`,
    ])
  );
}

// React Native has no calc() or clamp(), so the fluid display size is carried as
// its bounds plus the viewport-relative term a caller evaluates against the window.
function displayFontSize(value) {
  const match =
    /^clamp\((\d+)px, (\d+(?:\.\d+)?)vw \+ (\d+)px, (\d+)px\)$/.exec(value) ??
    raise(`Unexpected display font size: ${value}`);
  const [, min, viewportWidthPercent, offset, max] = match;
  return {
    bounds: { fontSizeDisplayMin: `${min}px`, fontSizeDisplayMax: `${max}px` },
    fluid: { viewportWidthPercent: Number(viewportWidthPercent), offsetPx: Number(offset) },
  };
}

function raise(message) {
  throw new Error(message);
}

function appCssPixels(css, name) {
  const value = new RegExp(`^\\s*--${name}: (\\d+)px;$`, 'm').exec(css)?.[1];
  if (value === undefined) throw new Error(`app.css declares no --${name} in px`);
  return Number(value);
}

function expectAppCss(css, declaration) {
  if (!css.includes(declaration)) throw new Error(`app.css no longer declares ${declaration}`);
}

// Layout tokens app.css owns. The settings indent is derived the way app.css derives
// it, and the modal gutter's safe-area term is the caller's: native insets come from
// react-native-safe-area-context, not from a token.
function appCssDimensions(css = readFileSync(APP_CSS_URL, 'utf8')) {
  expectAppCss(css, '--setting-indent: calc(var(--setting-icon-size) + var(--setting-icon-gap));');
  expectAppCss(
    css,
    '--modal-gutter: max(var(--modal-gutter-min), var(--safe-area-left), var(--safe-area-right));'
  );
  const iconSize = appCssPixels(css, 'setting-icon-size');
  const iconGap = appCssPixels(css, 'setting-icon-gap');
  return {
    touchTargetMin: `${appCssPixels(css, 'touch-target-min')}px`,
    modalGutterMin: `${appCssPixels(css, 'modal-gutter-min')}px`,
    settingIconSize: `${iconSize}px`,
    settingIconGap: `${iconGap}px`,
    settingIndent: `${iconSize + iconGap}px`,
  };
}

function themedTokens(theme) {
  return Object.fromEntries(
    Object.entries(theme)
      .filter(([key]) => isColorToken[key] || THEMED_EFFECT_KEYS.has(key))
      .map(([key, value]) => [key, portableColor(value)])
  );
}

function scaleGroups() {
  const groups = {
    dimensions: {},
    blobs: {},
    blobShapes: {},
    fixedColors: {},
    shadows: {},
    motion: {},
    weights: {},
    display: null,
  };
  for (const [key, value] of Object.entries(scale)) {
    if (Object.hasOwn(RSD_UNPROJECTED_TOKENS, key) || key === 'fontFamily') continue;
    if (DIMENSION_KEY.test(key) || DIMENSION_KEYS.has(key)) groups.dimensions[key] = value;
    else if (BLOB_KEY.test(key)) {
      for (const [corner, radius] of Object.entries(blobCorners(value)))
        groups.blobs[`${key}${corner}`] = radius;
      groups.blobShapes[key] = blobRadii(value);
    } else if (key === 'fontSizeDisplay') groups.display = displayFontSize(value);
    else if (FIXED_COLOR_KEYS.has(key)) groups.fixedColors[key] = portableColor(value);
    else if (SHADOW_KEY.test(key)) groups.shadows[key] = portableColor(value);
    else if (MOTION_KEY.test(key)) groups.motion[key] = value;
    else if (FONT_WEIGHT_KEY.test(key)) groups.weights[key] = value;
    else throw new Error(`Shipping token ${key} has no RSD projection; classify it`);
  }
  return groups;
}

function unprojectedThemeKeys() {
  return Object.keys(themes.light).filter(
    (key) =>
      !isColorToken[key] &&
      !THEMED_EFFECT_KEYS.has(key) &&
      !Object.hasOwn(STEP_NUMBER_MIX_KEYS, key)
  );
}

function percent(value) {
  const match = /^(\d+(?:\.\d+)?)%$/.exec(value) ?? raise(`Not a percentage: ${value}`);
  return Number(match[1]);
}

function stepNumberMix(theme) {
  return Object.fromEntries(
    Object.entries(STEP_NUMBER_MIX_KEYS).map(([key, name]) => [name, percent(theme[key])])
  );
}

function assertThemeClassification() {
  const unlisted = unprojectedThemeKeys().filter(
    (key) => !Object.hasOwn(RSD_UNPROJECTED_TOKENS, key)
  );
  if (unlisted.length) throw new Error(`Themed tokens with no RSD projection: ${unlisted}`);
}

function fontTokens(weights) {
  // The web stack's variable face carries every weight; the native app's fontTheme
  // overrides these with one static face per weight.
  return {
    family: scale.fontFamily,
    boldFamily: scale.fontFamily,
    boldWeight: weights.fontWeightBold,
    semiboldFamily: scale.fontFamily,
    semiboldWeight: weights.fontWeightSemibold,
    mediumFamily: scale.fontFamily,
    mediumWeight: weights.fontWeightMedium,
  };
}

function tokenSource() {
  assertThemeClassification();
  const groups = scaleGroups();
  const dimensions = {
    ...groups.dimensions,
    ...groups.blobs,
    ...groups.display.bounds,
    ...appCssDimensions(),
    touchTarget: `${TOUCH_TARGET}px`,
    aiResultHeight: `${AI_RESULT_HEIGHT_PX}px`,
  };
  const vars = (name, value) =>
    `export const ${name} = css.defineVars(${JSON.stringify(value, null, 2)});`;
  return [
    '// Generated by rsdTokenSource; fixture build and readback reject input drift.',
    "import { css } from 'react-strict-dom';",
    '',
    vars('colors', themedTokens(themes.light)),
    '',
    `export const darkTheme = css.createTheme(colors, ${JSON.stringify(themedTokens(themes.dark), null, 2)});`,
    '',
    vars('dimensions', dimensions),
    '',
    `export const fontSizeDisplayFluid = ${JSON.stringify(groups.display.fluid, null, 2)} as const;`,
    '',
    '// The full elliptical shipping blobs, as percentages of the box, for shapes drawn as paths.',
    `export const blobShapes = ${JSON.stringify(groups.blobShapes, null, 2)} as const;`,
    '',
    `export const stepNumberMix = ${JSON.stringify({ light: stepNumberMix(themes.light), dark: stepNumberMix(themes.dark) }, null, 2)} as const;`,
    '',
    vars('brandColors', brand),
    '',
    vars('fixedColors', groups.fixedColors),
    '',
    vars('shadows', groups.shadows),
    '',
    vars('motion', groups.motion),
    '',
    vars('fonts', fontTokens(groups.weights)),
    '',
    `export const fixtureInk = ${JSON.stringify(BLACK_INK)};`,
    '',
  ].join('\n');
}

export const RSD_DRAWING_TOKENS_URL = new URL(
  '../../../experiments/native-architecture/src/rsdDrawing/tokens.css.ts',
  import.meta.url
);

export async function rsdTokenSource() {
  const options = JSON.parse(
    readFileSync(new URL('../../../.prettierrc.json', import.meta.url), 'utf8')
  );
  return format(tokenSource(), { ...options, filepath: fileURLToPath(RSD_DRAWING_TOKENS_URL) });
}

export async function assertRsdTokenProjection(actual) {
  if (actual !== (await rsdTokenSource())) throw new Error('RSD drawing token projection drift');
}
