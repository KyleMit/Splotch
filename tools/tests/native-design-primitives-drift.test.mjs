import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { scale } from '../../web/src/lib/design/tokens.ts';
import { DRAWING_SCALE } from '../../experiments/native-architecture/src/drawing/theme.ts';
import { blobPath } from '../../experiments/native-architecture/src/rsdDrawing/blob.ts';
import { mixSrgb, rgba } from '../../experiments/native-architecture/src/rsdDrawing/colorMix.ts';
import * as confirmCard from '../../experiments/native-architecture/src/rsdDrawing/RsdConfirmCard.tsx';
import * as disclosure from '../../experiments/native-architecture/src/rsdDrawing/RsdDisclosure.tsx';
import * as externalMark from '../../experiments/native-architecture/src/rsdDrawing/RsdExternalMark.tsx';
import * as scrollCue from '../../experiments/native-architecture/src/rsdDrawing/RsdScrollCue.tsx';
import * as statusMessage from '../../experiments/native-architecture/src/rsdDrawing/RsdStatusMessage.tsx';
import * as stepNumber from '../../experiments/native-architecture/src/rsdDrawing/RsdStepNumber.tsx';
import * as textField from '../../experiments/native-architecture/src/rsdDrawing/RsdTextField.tsx';

vi.mock('react-native', () => ({
  AccessibilityInfo: {},
  Platform: { OS: 'web' },
  ScrollView: () => null,
  StyleSheet: { create: (styles) => styles },
  Text: () => null,
  TextInput: () => null,
  useColorScheme: () => 'light',
}));
vi.mock('react-native-svg', () => ({ SvgXml: () => null }));
vi.mock('react-strict-dom', () => ({
  css: { create: (styles) => styles, defineVars: (vars) => vars, createTheme: () => ({}) },
  html: {},
}));

const web = (path) => readFileSync(new URL(`../../web/src/${path}`, import.meta.url), 'utf8');
const SHIPPING = {
  appCss: web('app.css'),
  leaveConfirm: web('lib/components/LeaveConfirm.svelte'),
  installBanner: web('lib/components/InstallBanner.svelte'),
  disclosure: web('lib/components/design/Disclosure.svelte'),
  statusMessage: web('lib/components/design/StatusMessage.svelte'),
  scrollCue: web('lib/components/design/ScrollCue.svelte'),
  externalMark: web('lib/components/design/ExternalMark.svelte'),
  aiKeyManager: web('lib/components/settings/AiKeyManager.svelte'),
  reportFields: web('lib/components/report/ReportFields.svelte'),
  setupInstructions: web('lib/components/settings/SetupInstructions.svelte'),
};

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The value of one declaration inside the first rule whose selector is exactly `selector`.
function declaration(source, selector, property) {
  const block = new RegExp(`(?:^|\\n)\\s*${escape(selector)} \\{([^}]*)\\}`).exec(source)?.[1];
  if (block === undefined) return `no ${selector} rule`;
  return new RegExp(`(?:^|[;\\s])${escape(property)}: ([^;]+);`).exec(block)?.[1].trim();
}

const px = (value) => `${value}px`;

function primitiveParity(shipping) {
  const pairs = [
    [
      declaration(shipping.appCss, '.confirm-card', 'max-width'),
      px(confirmCard.CONFIRM_CARD_MAX_WIDTH_PX),
    ],
    [
      declaration(shipping.appCss, '.confirm-card-content', 'padding'),
      'var(--space-6) var(--space-6) var(--space-5)',
    ],
    [
      declaration(shipping.appCss, '.confirm-card-heading', 'gap'),
      px(confirmCard.CONFIRM_HEADING_GAP_PX),
    ],
    [
      declaration(shipping.appCss, '.confirm-card-heading :is(h2, h3)', 'line-height'),
      String(confirmCard.CONFIRM_TITLE_LINE_HEIGHT),
    ],
    [
      declaration(shipping.appCss, '.confirm-card-heading p', 'line-height'),
      String(confirmCard.CONFIRM_COPY_LINE_HEIGHT),
    ],
    [
      declaration(shipping.leaveConfirm, '.leave-confirm-actions :global(.btn)', 'flex'),
      `1 1 ${px(confirmCard.CONFIRM_ACTION_BASIS_PX)}`,
    ],
    [
      declaration(shipping.appCss, '.step-number', '--number-size'),
      `var(--step-number-size, ${px(stepNumber.STEP_NUMBER_SIZE_PX.regular)})`,
    ],
    [
      declaration(shipping.installBanner, '.step-number', '--step-number-size'),
      px(stepNumber.STEP_NUMBER_SIZE_PX.compact),
    ],
    [
      declaration(shipping.setupInstructions, '.section-number', '--step-number-size'),
      px(stepNumber.STEP_NUMBER_SIZE_PX.summary),
    ],
    [
      declaration(shipping.appCss, ':nth-child(3n + 2) > .step-number--blob', 'border-radius'),
      'var(--radius-blob-2)',
    ],
    [
      declaration(shipping.disclosure, '.disclosure[open] summary::after', 'transform'),
      disclosure.DISCLOSURE_OPEN_TURN,
    ],
    [
      declaration(shipping.statusMessage, '.status-message', 'line-height'),
      String(statusMessage.STATUS_LINE_HEIGHT),
    ],
    [
      declaration(shipping.statusMessage, '.warning', 'line-height'),
      String(statusMessage.STATUS_WARNING_LINE_HEIGHT),
    ],
    [
      declaration(shipping.scrollCue, '.scroll-cue', '--cue-height'),
      `var(--scroll-cue-height, ${px(scrollCue.SCROLL_CUE_HEIGHT_PX)})`,
    ],
    [
      declaration(shipping.scrollCue, '.scroll-cue', '--cue-opaque-from'),
      `${scrollCue.SCROLL_CUE_OPAQUE_FROM_PERCENT}%`,
    ],
    [
      declaration(shipping.scrollCue, '.scroll-cue-sentinel', '--sentinel-overlap'),
      px(scrollCue.SCROLL_CUE_END_SLACK_PX),
    ],
    ...['inline', 'standalone'].flatMap((variant) => [
      [
        declaration(shipping.externalMark, `.${variant}`, 'width'),
        px(externalMark.EXTERNAL_MARK_PX[variant].blob),
      ],
      [
        declaration(shipping.externalMark, `.${variant} :global(.external-mark-icon)`, 'width'),
        px(externalMark.EXTERNAL_MARK_PX[variant].icon),
      ],
    ]),
    [
      declaration(shipping.externalMark, '.standalone', 'margin-left'),
      px(externalMark.EXTERNAL_MARK_STANDALONE_GAP_PX),
    ],
    [
      /<VisuallyHidden>([^<]+)<\/VisuallyHidden>/.exec(shipping.externalMark)?.[1],
      externalMark.EXTERNAL_MARK_LABEL,
    ],
    [
      declaration(shipping.aiKeyManager, '.access-code-input', 'padding'),
      `${px(DRAWING_SCALE.space2)} ${px(DRAWING_SCALE.space3)}`,
    ],
    [
      declaration(shipping.aiKeyManager, '.access-code-input', 'border'),
      'var(--border-width) solid var(--border-warm-strong)',
    ],
    [
      declaration(shipping.reportFields, '.report-textarea', 'min-height'),
      px(textField.TEXT_AREA_MIN_HEIGHT_PX),
    ],
    [
      declaration(shipping.reportFields, '.report-textarea', 'padding'),
      `${px(textField.TEXT_AREA_PADDING_BLOCK_PX)} ${px(DRAWING_SCALE.space3)}`,
    ],
    [
      declaration(shipping.reportFields, '.report-textarea', 'line-height'),
      String(textField.TEXT_AREA_LINE_HEIGHT),
    ],
  ];
  assert.deepEqual(
    pairs.filter(([actual, expected]) => actual !== expected),
    []
  );
}

it('ports every shipping primitive literal the native primitives draw with', () => {
  expect(() => primitiveParity(SHIPPING)).not.toThrow();
});

it.each([
  ['the confirm card width', 'appCss', 'max-width: 336px', 'max-width: 360px'],
  ['the confirm action basis', 'leaveConfirm', 'flex: 1 1 140px', 'flex: 1 1 120px'],
  [
    'the compact step size',
    'installBanner',
    '--step-number-size: 20px',
    '--step-number-size: 24px',
  ],
  ['the disclosure turn', 'disclosure', 'transform: rotate(90deg)', 'transform: rotate(180deg)'],
  ['the warning line height', 'statusMessage', 'line-height: 1.45', 'line-height: 1.4'],
  ['the scroll fade depth', 'scrollCue', '--scroll-cue-height, 72px', '--scroll-cue-height, 64px'],
  ['the external mark label', 'externalMark', '(opens outside Splotch)', '(leaves Splotch)'],
  ['the textarea height', 'reportFields', 'min-height: 88px', 'min-height: 96px'],
  ['the input border token', 'aiKeyManager', 'var(--border-warm-strong)', 'var(--border-warm)'],
])('rejects a changed shipping %s', (_, key, from, to) => {
  expect(SHIPPING[key]).toContain(from);
  const changed = { ...SHIPPING, [key]: SHIPPING[key].replace(from, to) };
  expect(() => primitiveParity(changed)).toThrow();
});

// The corner radii of a blob path's four arcs, clockwise from the top right.
function arcRadii(path) {
  return [...path.matchAll(/A([\d.]+) ([\d.]+)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ]);
}

it.each(['radiusBlob1', 'radiusBlob2', 'radiusBlob3'])(
  'draws %s with the shipping elliptical corners',
  (shape) => {
    const size = 32;
    const [horizontal, vertical = horizontal] = scale[shape]
      .split('/')
      .map((list) => list.trim().split(/\s+/).map(Number.parseFloat));
    const full = (list) => [
      list[0],
      list[1] ?? list[0],
      list[2] ?? list[0],
      list[3] ?? list[1] ?? list[0],
    ];
    const [h, v] = [full(horizontal), full(vertical)];
    // CSS Backgrounds 3 §5.5: when two radii along one side overlap it, all shrink by one factor.
    const factor = Math.min(
      1,
      100 / (h[0] + h[1]),
      100 / (h[2] + h[3]),
      100 / (v[0] + v[3]),
      100 / (v[1] + v[2])
    );
    const radius = (percent) => Math.round((percent / 100) * size * factor * 1000) / 1000;
    const clockwiseFromTopRight = [1, 2, 3, 0];
    expect(arcRadii(blobPath(shape, size, size))).toEqual(
      clockwiseFromTopRight.map((corner) => [radius(h[corner]), radius(v[corner])])
    );
  }
);

it('mixes and spells colors the way React Native reads them', () => {
  expect(mixSrgb('#ab71e1', 0, '#333')).toBe('#333333');
  expect(mixSrgb('#ab71e1', 100, '#ffffff')).toBe('#ab71e1');
  expect(mixSrgb('#000000', 50, '#ffffff')).toBe('#808080');
  expect(rgba('#23232b', 0)).toBe('rgba(35, 35, 43, 0)');
  expect(() => mixSrgb('rgb(0 0 0)', 50, '#fff')).toThrow('Not a hex color');
});
