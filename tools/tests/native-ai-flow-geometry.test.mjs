import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { scale } from '../../web/src/lib/design/tokens.ts';
import { TABLET_MIN_SIDE_PX } from '../../web/src/lib/breakpoints.ts';
import {
  AI_PROMPT_COLUMNS,
  AI_PROMPT_LAYOUTS,
  AI_PROMPT_NARROW_MAX_WIDTH_PX,
  AI_PROMPT_SHORT_MAX_HEIGHT_PX,
  aiPromptColumns,
  aiPromptStep,
} from '../../experiments/native-architecture/src/rsdDrawing/aiPromptGeometry.ts';
import {
  AI_RESULT_METRICS,
  aiResultFrame,
} from '../../experiments/native-architecture/src/ai/aiResultGeometry.ts';
import { AI_FAILURE_RETRY_LIMIT } from '../../experiments/native-architecture/src/ai/uiState.ts';
import * as prompt from '../../experiments/native-architecture/src/rsdDrawing/RsdAiStylePrompt.tsx';
import * as stage from '../../experiments/native-architecture/src/rsdDrawing/RsdAiResultStage.tsx';
import * as parts from '../../experiments/native-architecture/src/rsdDrawing/RsdAiResultParts.tsx';
import * as errorCard from '../../experiments/native-architecture/src/rsdDrawing/RsdAiResultError.tsx';
import * as result from '../../experiments/native-architecture/src/rsdDrawing/RsdAiResult.tsx';
import * as report from '../../experiments/native-architecture/src/rsdDrawing/RsdAiImageReport.tsx';
import * as problem from '../../experiments/native-architecture/src/rsdDrawing/RsdAiProblemReport.tsx';
import * as iconButton from '../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import * as polaroid from '../../experiments/native-architecture/src/ai/AiWaitingPolaroid.tsx';

vi.mock('react-native', () => ({
  AccessibilityInfo: {},
  AppState: { addEventListener: () => ({ remove() {} }) },
  Image: () => null,
  Modal: () => null,
  Platform: { OS: 'web', select: (values) => values.web ?? values.default },
  Pressable: () => null,
  ScrollView: () => null,
  StyleSheet: { create: (styles) => styles, absoluteFill: {} },
  Text: () => null,
  TextInput: () => null,
  View: () => null,
  useColorScheme: () => 'light',
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock('../../experiments/native-architecture/src/platform/animated.ts', () => ({
  Animated: { createAnimatedComponent: (component) => component, View: () => null },
  Easing: new Proxy({}, { get: () => () => () => 0 }),
}));
vi.mock('react-native-svg', () => ({ default: () => null, SvgXml: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  initialWindowMetrics: null,
  SafeAreaProvider: () => null,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('react-strict-dom', () => ({
  css: { create: (styles) => styles, defineVars: (vars) => vars, createTheme: () => ({}) },
  html: {},
  compat: {},
}));

const web = (path) => readFileSync(new URL(`../../web/src/${path}`, import.meta.url), 'utf8');
const SHIPPING = {
  appCss: web('app.css'),
  prompt: web('lib/components/AiImagePrompt.svelte'),
  result: web('lib/components/AiImageResult.svelte'),
  stage: web('lib/components/AiResultStage.svelte'),
  footer: web('lib/components/AiResultFooter.svelte'),
  disclosure: web('lib/components/AiResultDisclosure.svelte'),
  errorCard: web('lib/components/AiErrorCard.svelte'),
  error: web('lib/components/AiResultError.svelte'),
  report: web('lib/components/AiImageReport.svelte'),
  button: web('lib/components/AiImageButton.svelte'),
  polaroid: web('lib/components/AiWaitingPolaroid.svelte'),
  generation: web('lib/state/aiGeneration.svelte.ts'),
};

// The declarations of the first `selector {` rule after `from` (a media query, say).
function rule(source, selector, from = '<style>') {
  const start = source.indexOf(from);
  expect(start, from).toBeGreaterThanOrEqual(0);
  const open = source.indexOf(`${selector} {`, start);
  expect(open, `${from} ${selector}`).toBeGreaterThanOrEqual(0);
  return source.slice(open, source.indexOf('}', open));
}
// The first `selector {` rule that declares `property`, for a selector several rules share.
function ruleWith(source, selector, property) {
  let open = source.indexOf(`${selector} {`);
  while (open >= 0) {
    const body = source.slice(open, source.indexOf('}', open));
    if (new RegExp(`\\s${property}:`).test(body)) return body;
    open = source.indexOf(`${selector} {`, open + 1);
  }
  throw new Error(`No ${selector} rule declares ${property}`);
}
function declaration(block, property) {
  const value = new RegExp(`(?:^|\\n|\\{)\\s*${property}: ([^;]+);`).exec(block)?.[1];
  expect(value, property).toBeDefined();
  return value.trim();
}
function px(value) {
  const token = /^var\(--space-(\d)\)$/.exec(value);
  const length = token ? scale[`space${token[1]}`] : value;
  expect(length, value).toMatch(/^-?\d+(?:\.\d+)?px$/);
  return Number.parseFloat(length);
}
function box(shorthand) {
  const [top, inline = top, bottom = top] = shorthand.split(/\s+(?![^(]*\))/).map(px);
  return { top, inline, bottom };
}
const percentOfViewport = (value) => Number.parseFloat(value) / 100;
const fontStep = (value) => ({ 'var(--font-size-sm)': 'sm', 'var(--font-size-md)': 'md' })[value];

// A stylesheet's top level and each @media block, by brace matching, so a step reads only the
// rules that apply to it.
function cascade(source) {
  const style = source.slice(source.indexOf('<style>'));
  const blocks = { top: '' };
  let index = 0;
  while (index < style.length) {
    const media = style.indexOf('@media', index);
    if (media < 0) {
      blocks.top += style.slice(index);
      break;
    }
    blocks.top += style.slice(index, media);
    const open = style.indexOf('{', media);
    let depth = 1;
    let close = open + 1;
    for (; depth > 0; close++) depth += style[close] === '{' ? 1 : style[close] === '}' ? -1 : 0;
    blocks[style.slice(media, open).trim()] = style.slice(open + 1, close - 1);
    index = close;
  }
  return blocks;
}

const PROMPT_BLOCKS = cascade(SHIPPING.prompt);
const ROOMY = '@media (min-width: 600px) and (min-height: 600px)';
const LARGE = '@media (min-width: 1000px) and (min-height: 1000px)';
const PROMPT_STEPS = {
  base: ['top'],
  short: ['top', '@media (max-height: 560px)'],
  roomy: ['top', ROOMY],
  large: ['top', ROOMY, LARGE],
};

// The value the last applying block declares for a selector's property.
function cascaded(step, selector, property) {
  let value;
  for (const name of PROMPT_STEPS[step]) {
    const block = PROMPT_BLOCKS[name];
    const open = block.indexOf(`${selector} {`);
    if (open < 0) continue;
    const body = block.slice(open, block.indexOf('}', open));
    const match = new RegExp(`\\s${property}: ([^;]+);`).exec(body);
    if (match) value = match[1].trim();
  }
  expect(value, `${step} ${selector} ${property}`).toBeDefined();
  return value;
}

it.each(Object.keys(PROMPT_STEPS))(
  'holds the AI Style Prompt card to shipping at its %s step',
  (step) => {
    const layout = AI_PROMPT_LAYOUTS[step];
    const value = (selector, property) => cascaded(step, selector, property);
    expect(layout.maxWidth).toBe(px(value('.ai-prompt-modal', 'max-width')));
    expect(layout.maxHeightFraction).toBe(
      percentOfViewport(value('.ai-prompt-modal', 'max-height'))
    );
    expect(layout.padding).toEqual(box(value('.ai-prompt-content', 'padding')));
    expect(layout.gap).toBe(px(value('.ai-prompt-content', 'gap')));
    expect(layout.gridGap).toBe(px(value('.ai-style-options', 'gap')));
    expect(layout.legendGap).toBe(px(value('.ai-prompt-styles legend', 'margin-bottom')));
    expect(layout.legendSize).toBe(fontStep(value('.ai-prompt-styles legend', 'font-size')));
    expect(layout.labelSize).toBe(fontStep(value('.ai-style-label', 'font-size')));
    expect(layout.closeInset).toBe(px(value(':global(.ai-prompt-close)', 'top')));
  }
);

it('steps and columns the AI Style Prompt at the shipping breakpoints', () => {
  expect(SHIPPING.prompt).toContain(`@media (max-height: ${AI_PROMPT_SHORT_MAX_HEIGHT_PX}px)`);
  expect(SHIPPING.prompt).toContain(`@media (max-width: ${AI_PROMPT_NARROW_MAX_WIDTH_PX}px)`);
  expect(SHIPPING.prompt).toContain(
    `@media (min-width: ${TABLET_MIN_SIDE_PX}px) and (min-height: ${TABLET_MIN_SIDE_PX}px)`
  );
  expect(declaration(rule(SHIPPING.prompt, '.ai-style-options'), 'grid-template-columns')).toBe(
    `repeat(${AI_PROMPT_COLUMNS.wide}, 1fr)`
  );
  expect(
    declaration(
      rule(SHIPPING.prompt, '.ai-style-options', '@media (max-width: 420px)'),
      'grid-template-columns'
    )
  ).toBe(`repeat(${AI_PROMPT_COLUMNS.narrow}, 1fr)`);
  expect(aiPromptStep({ width: 390, height: 844 })).toBe('base');
  expect(aiPromptStep({ width: 844, height: 390 })).toBe('short');
  expect(aiPromptStep({ width: 834, height: 1194 })).toBe('roomy');
  expect(aiPromptStep({ width: 1366, height: 1024 })).toBe('large');
  expect(aiPromptColumns({ width: 390 })).toBe(2);
  expect(aiPromptColumns({ width: 421 })).toBe(4);
  const thumb = rule(SHIPPING.prompt, '.ai-style-thumb');
  expect(declaration(thumb, 'border')).toBe(
    `${prompt.AI_STYLE_THUMB_BORDER_PX}px solid transparent`
  );
  expect(declaration(rule(SHIPPING.prompt, '.ai-style-option'), 'gap')).toBe(
    `${prompt.AI_STYLE_THUMB_GAP_PX}px`
  );
  expect(SHIPPING.prompt).toContain(`transform: translateY(-${prompt.AI_STYLE_HOVER_LIFT_PX}px);`);
  expect(SHIPPING.prompt).toContain(`transform: scale(${prompt.AI_STYLE_PRESSED_SCALE});`);
  expect(SHIPPING.prompt).toContain('filter: drop-shadow(0 2px 3px rgb(0 0 0 / 28%));');
  expect(prompt.AI_STYLE_CUTOUT_SHADOW).toBe('drop-shadow(0 2px 3px rgba(0, 0, 0, 0.28))');
});

it('budgets the AI Result card from the shipping custom properties', () => {
  const m = AI_RESULT_METRICS;
  const card = rule(SHIPPING.result, '.ai-result-modal');
  expect(declaration(card, '--result-gutter-min')).toBe(`${m.gutterMin}px`);
  expect(declaration(card, '--result-gutter-max')).toBe(`${m.gutterMax}px`);
  expect(declaration(card, '--result-gutter-ramp-from')).toBe(`${m.gutterRampFrom}px`);
  expect(declaration(card, '--result-gutter-ramp')).toBe(`${m.gutterRamp}`);
  expect(declaration(card, '--result-min-w')).toBe(`min(var(--result-max-w), ${m.minWidth}px)`);
  expect(declaration(card, '--loading-caption-height')).toBe('max(46px, var(--touch-target-min))');
  expect(Math.max(46, px(scale.touchTargetMin ?? '48px'))).toBe(m.loadingCaptionHeight);
  expect(declaration(card, '--keep-drawing-height')).toBe('var(--touch-target-min)');
  expect(declaration(card, '--result-sizing-air')).toBe(`${m.sizingAir}px`);
  expect(declaration(card, '--result-inline-padding')).toBe('calc(2 * var(--space-4))');
  expect(px(scale.space4)).toBe(m.contentPadding);
  expect(px(scale.space3)).toBe(m.contentGap);
  expect(declaration(ruleWith(SHIPPING.result, '.ai-result-modal.errored', 'width'), 'width')).toBe(
    `min(var(--result-max-w), ${m.safetyWidth}px)`
  );
  expect(
    declaration(ruleWith(SHIPPING.result, '.ai-result-modal.serverError', 'width'), 'width')
  ).toBe(`min(var(--result-max-w), ${m.serverErrorWidth}px)`);
  expect(SHIPPING.appCss).toContain(`--report-strip-height: ${m.reportStripHeight}px;`);
  expect(SHIPPING.appCss).toContain('--report-strip-gap: var(--space-4);');
  expect(px(scale.space4)).toBe(m.reportStripGap);
  expect(SHIPPING.appCss).toContain('--report-strip-tap: var(--touch-target-min);');
});

it('fits the AI Result card the way the shipping calc() chain resolves', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  // A 390px phone: the gutter sits at its 10px floor, the strip reserve (53px) bounds the bottom.
  const phone = aiResultFrame({
    window: { width: 390, height: 844 },
    insets,
    aspect: 0.75,
    mode: 'picture',
    naturalWidth: null,
  });
  expect(phone.width).toBe(370);
  expect(phone.maxHeight).toBe(844 - 10 - 53);
  expect(phone.shiftY).toBe((10 - 53) / 2);
  expect(phone.stage.width).toBe(338);
  // A large tablet: an 80px gutter and a picture capped at its own decoded width.
  const tablet = aiResultFrame({
    window: { width: 1366, height: 1024 },
    insets,
    aspect: 4 / 3,
    mode: 'waiting',
    naturalWidth: 512,
  });
  expect(tablet.stage.width).toBe(512);
  expect(tablet.dialSize).toBe(512 * 0.52);
  expect(
    aiResultFrame({
      window: { width: 1366, height: 1024 },
      insets,
      aspect: 1,
      mode: 'serverError',
      naturalWidth: null,
    }).width
  ).toBe(400);
});

it('holds the stage, footer, disclosure, error card and report thumbs to shipping', () => {
  expect(SHIPPING.stage).toContain(`const MIN_BLUR_PX = ${stage.STAGE_MIN_BLUR_PX};`);
  expect(SHIPPING.stage).toContain(`const MAX_EXTRA_BLUR_PX = ${stage.STAGE_MAX_EXTRA_BLUR_PX};`);
  expect(SHIPPING.stage).toContain(`const BLUR_STEP_PX = ${stage.STAGE_BLUR_STEP_PX};`);
  expect(SHIPPING.stage).toContain(`transform: scale(${stage.STAGE_BLUR_BLEED_SCALE});`);
  expect(SHIPPING.stage).toContain(`transform: scale(${stage.STAGE_RESULT_ENTRY_SCALE});`);
  expect(SHIPPING.stage).toContain(`opacity ${stage.STAGE_RESULT_FADE_MS / 1000}s ease`);
  expect(SHIPPING.stage).toContain(
    `transform ${stage.STAGE_RESULT_SETTLE_MS / 1000}s var(--ease-glide)`
  );
  expect(SHIPPING.stage).toContain(`opacity ${stage.STAGE_PREVIEW_EXIT_MS / 1000}s ease`);
  expect(SHIPPING.stage).toContain('box-shadow: 0 4px 16px rgb(0 0 0 / 15%);');
  expect(stage.STAGE_SHADOW).toBe('0px 4px 16px rgba(0, 0, 0, 0.15)');
  expect(stage.stageBlurPx(0)).toBe(18);
  expect(stage.stageBlurPx(1)).toBe(2);
  expect(stage.stageBlurPx(0.51)).toBe(9.75);

  const download = rule(SHIPPING.footer, '.ai-result-download');
  expect(declaration(download, 'padding')).toBe(`0 ${parts.RESULT_PILL_PADDING_PX}px`);
  expect(declaration(download, 'gap')).toBe(`${parts.DOWNLOAD_GAP_PX}px`);
  expect(declaration(download, 'box-shadow')).toBe(
    '0 4px 12px color-mix(in srgb, var(--brand) 40%, transparent)'
  );
  expect(parts.DOWNLOAD_SHADOW).toBe('0 4px 12px rgba(171, 113, 225, 0.4)');
  expect(declaration(rule(SHIPPING.footer, '.ai-result-download:active'), 'transform')).toBe(
    `scale(${parts.DOWNLOAD_PRESSED_SCALE})`
  );
  expect(
    declaration(
      rule(SHIPPING.footer, '.ai-result-download :global(.ai-result-download-icon)'),
      'width'
    )
  ).toBe(`${parts.DOWNLOAD_ICON_PX}px`);
  expect(declaration(rule(SHIPPING.result, '.ai-keep-drawing :global(.btn)'), 'padding')).toBe(
    `0 ${parts.RESULT_PILL_PADDING_PX}px`
  );

  const strip = rule(SHIPPING.disclosure, '.ai-result-disclosure');
  expect(declaration(strip, 'padding')).toBe(`0 ${parts.DISCLOSURE_PADDING_PX}px`);
  expect(declaration(rule(SHIPPING.disclosure, '.ai-report-flag'), '--report-icon-size')).toBe(
    `${parts.REPORT_FLAG_ICON_PX}px`
  );
  expect(declaration(rule(SHIPPING.disclosure, '.ai-report-flag:active'), 'transform')).toBe(
    `scale(${parts.REPORT_FLAG_PRESSED_SCALE})`
  );

  const glyph = rule(SHIPPING.errorCard, '.ai-error-glyph');
  expect(declaration(glyph, 'width')).toBe(`${errorCard.ERROR_GLYPH_PX}px`);
  expect(
    declaration(rule(SHIPPING.errorCard, '.ai-error-card :global(.ai-error-refresh)'), 'width')
  ).toBe(`${errorCard.ERROR_REFRESH_ICON_PX}px`);
  expect(
    declaration(rule(SHIPPING.errorCard, '.ai-error-card :global(.ai-error-pen)'), 'width')
  ).toBe(`${errorCard.ERROR_PEN_ICON_PX}px`);
  expect(declaration(rule(SHIPPING.errorCard, '.ai-error-card h2'), 'line-height')).toBe(
    `${errorCard.ERROR_TITLE_LINE_HEIGHT}`
  );
  expect(
    declaration(rule(SHIPPING.errorCard, '.ai-error-card p.ai-error-body'), 'line-height')
  ).toBe(`${errorCard.ERROR_BODY_LINE_HEIGHT}`);
  const section = rule(SHIPPING.error, '.ai-result-error');
  expect(declaration(section, 'width')).toBe(
    `min(86vw, ${errorCard.SAFETY_SECTION_MAX_WIDTH_PX}px)`
  );
  expect(declaration(section, 'min-height')).toBe(`${errorCard.SAFETY_SECTION_MIN_HEIGHT_PX}px`);
  expect(
    declaration(rule(SHIPPING.error, '.ai-result-error p.ai-result-error-sub'), 'max-width')
  ).toBe(`${errorCard.SAFETY_SUB_MAX_WIDTH_PX}px`);

  expect(declaration(rule(SHIPPING.report, '.ai-report-thumbs.single figure'), 'max-width')).toBe(
    `${report.REPORT_THUMB_SINGLE_MAX_PX}px`
  );
  expect(declaration(rule(SHIPPING.report, '.ai-report-thumbs img'), 'box-shadow')).toBe(
    '0 2px 8px rgb(0 0 0 / 14%)'
  );
  expect(report.REPORT_THUMB_SHADOW).toBe('0px 2px 8px rgba(0, 0, 0, 0.14)');
});

it('sends the result off as the shipping polaroid flies', () => {
  const polaroidMode = rule(SHIPPING.result, '.ai-result-modal.polaroid-mode');
  expect(polaroidMode).toContain(`rotate(${result.SEND_OFF_TILT_DEG}deg)`);
  expect(polaroidMode).toContain(`transform ${result.SEND_OFF_TILT_MS / 1000}s var(--ease-pop)`);
  expect(polaroidMode).toContain(
    `animation: ai-polaroid-fly ${result.SEND_OFF_FLY_MS / 1000}s ${result.SEND_OFF_FLY_DELAY_MS / 1000}s cubic-bezier(0.55, 0, 0.85, 0.2) forwards;`
  );
  const { x, y, scale: end, rotateDeg } = result.SEND_OFF_END;
  expect(SHIPPING.result).toContain(
    `transform: translate(calc(-50% - ${-x * 100}vw), calc(-50% + ${y * 100}vh)) scale(${end}) rotate(${rotateDeg}deg);`
  );
  expect(SHIPPING.result).toContain(
    `animation: ai-polaroid-fly ${result.SEND_OFF_CALM_FLY_MS / 1000}s ${result.SEND_OFF_CALM_FLY_DELAY_MS / 1000}s ease forwards;`
  );
});

it('badges and spins the AI Image Button and pins the waiting print where shipping does', () => {
  const badge = rule(SHIPPING.button, '.free-count');
  expect(declaration(badge, 'top')).toBe(`${iconButton.BADGE_OFFSET_PX}px`);
  expect(declaration(badge, 'right')).toBe(`${iconButton.BADGE_OFFSET_PX}px`);
  expect(declaration(badge, 'min-width')).toBe(`${iconButton.BADGE_SIZE_PX}px`);
  expect(declaration(badge, 'height')).toBe(`${iconButton.BADGE_SIZE_PX}px`);
  expect(declaration(badge, 'padding')).toBe(`0 ${iconButton.BADGE_PADDING_PX}px`);
  expect(SHIPPING.appCss).toContain(
    `animation: aiSpin ${iconButton.BUSY_TURN_MS / 1000}s linear infinite;`
  );
  expect(SHIPPING.appCss).toContain(`animation-duration: ${iconButton.CALM_BUSY_TURN_MS / 1000}s;`);

  const print = rule(SHIPPING.polaroid, '.ai-waiting-polaroid');
  expect(declaration(print, '--polaroid-width')).toBe(`${polaroid.PRINT_WIDTH_PX}px`);
  expect(declaration(print, '--polaroid-photo-height')).toBe(`${polaroid.PHOTO_HEIGHT_PX}px`);
  expect(declaration(print, '--polaroid-tilt')).toBe(`${polaroid.TILT_DEG}deg`);
  expect(declaration(print, '--polaroid-clearance')).toBe(`${polaroid.POLAROID_CLEARANCE_PX}px`);
  expect(declaration(print, '--polaroid-headroom')).toBe(`${polaroid.POLAROID_HEADROOM_PX}px`);
  const portrait = rule(
    SHIPPING.polaroid,
    '.ai-waiting-polaroid',
    '@media (orientation: portrait)'
  );
  expect(declaration(portrait, 'left')).toBe(
    `calc(${polaroid.POLAROID_PORTRAIT_INSET_PX}px + var(--safe-area-left))`
  );
  const sticker = rule(SHIPPING.polaroid, ':global(.polaroid-badge)');
  expect(declaration(sticker, 'width')).toBe(`${polaroid.BADGE_ICON_PX}px`);
  expect(declaration(sticker, 'top')).toBe(`${polaroid.BADGE_OFFSET.top}px`);
  expect(declaration(sticker, 'right')).toBe(`${polaroid.BADGE_OFFSET.right}px`);

  expect(SHIPPING.generation).toContain(
    `export const AI_FAILURE_RETRY_LIMIT = ${AI_FAILURE_RETRY_LIMIT};`
  );
});

it('lays out the problem report diagnostics as shipping does', () => {
  expect(declaration(rule(SHIPPING.report, '.ai-report-diagnostics dl'), 'line-height')).toBe(
    `${problem.DIAGNOSTICS_LINE_HEIGHT}`
  );
  const note = rule(SHIPPING.report, '.ai-report-diagnostics p');
  expect(declaration(note, 'line-height')).toBe(`${problem.DIAGNOSTICS_NOTE_LINE_HEIGHT}`);
  expect(declaration(note, 'padding')).toBe(
    `var(--space-1) var(--space-3) ${problem.DIAGNOSTICS_NOTE_BOTTOM_PX}px`
  );
});
