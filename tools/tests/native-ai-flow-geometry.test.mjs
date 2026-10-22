import { expect, it, vi } from 'vitest';
import { scale } from '../../src/lib/design/tokens.ts';

import { aiPromptColumns, aiPromptStep } from '../../src/rsdDrawing/aiPromptGeometry.ts';
import { AI_RESULT_METRICS, aiResultFrame } from '../../src/ai/aiResultGeometry.ts';

import * as prompt from '../../src/rsdDrawing/RsdAiStylePrompt.tsx';
import * as stage from '../../src/rsdDrawing/RsdAiResultStage.tsx';
import * as parts from '../../src/rsdDrawing/RsdAiResultParts.tsx';

import * as report from '../../src/rsdDrawing/RsdAiImageReport.tsx';

vi.mock('react-native', () => ({
  AccessibilityInfo: {},
  AppState: { addEventListener: () => ({ remove() {} }) },
  Image: () => null,
  Modal: () => null,
  Platform: { OS: 'web', select: (values) => values.web ?? values.default },
  requireNativeComponent: () => () => null,
  Pressable: () => null,
  ScrollView: () => null,
  StyleSheet: { create: (styles) => styles, absoluteFill: {} },
  Text: () => null,
  TextInput: () => null,
  View: () => null,
  useColorScheme: () => 'light',
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock('../../src/platform/animated.ts', () => ({
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
function px(value) {
  const token = /^var\(--space-(\d)\)$/.exec(value);
  const length = token ? scale[`space${token[1]}`] : value;
  expect(length, value).toMatch(/^-?\d+(?:\.\d+)?px$/);
  return Number.parseFloat(length);
}

it('steps and columns the AI Style Prompt at the shipping breakpoints', () => {
  expect(aiPromptStep({ width: 390, height: 844 })).toBe('base');
  expect(aiPromptStep({ width: 844, height: 390 })).toBe('short');
  expect(aiPromptStep({ width: 834, height: 1194 })).toBe('roomy');
  expect(aiPromptStep({ width: 1366, height: 1024 })).toBe('large');
  expect(aiPromptColumns({ width: 390 })).toBe(2);
  expect(aiPromptColumns({ width: 421 })).toBe(4);
  expect(prompt.AI_STYLE_CUTOUT_SHADOW).toBe('drop-shadow(0 2px 3px rgba(0, 0, 0, 0.28))');
});

it('budgets the AI Result card from the shipping custom properties', () => {
  const m = AI_RESULT_METRICS;
  expect(Math.max(46, px(scale.touchTargetMin ?? '48px'))).toBe(m.loadingCaptionHeight);
  expect(px(scale.space4)).toBe(m.contentPadding);
  expect(px(scale.space3)).toBe(m.contentGap);
  expect(px(scale.space4)).toBe(m.reportStripGap);
});

it('reserves the saved caption footer while auto-save is on, but not over the waiting pill', () => {
  const frame = (mode, autosave) =>
    aiResultFrame({
      window: { width: 600, height: 500 },
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      aspect: 0.75,
      mode,
      autosave,
      naturalWidth: null,
    });
  const plain = frame('picture', false).stage.height;
  const autosaved = frame('picture', true).stage.height;
  const m = AI_RESULT_METRICS;
  const loadingReserve = 2 * m.contentPadding + m.contentGap + m.loadingCaptionHeight + m.sizingAir;
  expect(autosaved - plain).toBe(loadingReserve - m.autosaveFooterReserve);
  expect(frame('waiting', true).stage.height).toBe(frame('waiting', false).stage.height);
});

it('gives the stage up to a caption and Keep drawing button laid out taller than their slots', () => {
  const frame = (measured) =>
    aiResultFrame({
      window: { width: 390, height: 844 },
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      // A waiting card sizes its stage from the window until the picture decodes: height-bound.
      aspect: 390 / 844,
      mode: 'waiting',
      autosave: false,
      naturalWidth: null,
      measured,
    }).stage.height;
  const m = AI_RESULT_METRICS;
  // At Android's 2x font scale the Galaxy wrapped the caption and the button onto two lines each.
  const grown = {
    caption: m.loadingCaptionHeight + 60,
    keepDrawing: m.keepDrawingHeight + 40,
    strip: 0,
  };
  expect(frame(undefined) - frame(grown)).toBeCloseTo(100, 6);
  expect(frame({ caption: 20, keepDrawing: 20, strip: 20 })).toBe(frame(undefined));
});

it('reserves room under the card for a report strip that wrapped past one line', () => {
  const frame = (strip) =>
    aiResultFrame({
      window: { width: 390, height: 844 },
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      aspect: 390 / 844,
      mode: 'picture',
      autosave: false,
      naturalWidth: null,
      measured: { caption: 0, keepDrawing: 0, strip },
    }).maxHeight;
  const m = AI_RESULT_METRICS;
  const oneLine = (m.reportStripHeight + m.reportStripTap) / 2;
  expect(frame(70) - frame(0)).toBe(oneLine - 70);
  expect(frame(m.reportStripHeight)).toBe(frame(0));
});

it('fits the AI Result card the way the shipping calc() chain resolves', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  // A 390px phone: the gutter sits at its 10px floor, the strip reserve (53px) bounds the bottom.
  const phone = aiResultFrame({
    window: { width: 390, height: 844 },
    insets,
    aspect: 0.75,
    mode: 'picture',
    autosave: false,
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
    autosave: false,
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
      autosave: false,
      naturalWidth: null,
    }).width
  ).toBe(400);
});

it('holds the stage, footer, disclosure, error card and report thumbs to shipping', () => {
  expect(stage.STAGE_SHADOW).toBe('0px 4px 16px rgba(0, 0, 0, 0.15)');
  expect(stage.stageBlurPx(0)).toBe(18);
  expect(stage.stageBlurPx(1)).toBe(2);
  expect(stage.stageBlurPx(0.51)).toBe(9.75);
  expect(parts.DOWNLOAD_SHADOW).toBe('0 4px 12px rgba(171, 113, 225, 0.4)');
  expect(report.REPORT_THUMB_SHADOW).toBe('0px 2px 8px rgba(0, 0, 0, 0.14)');
});
