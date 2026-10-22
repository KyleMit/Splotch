import { paperProjection, drawingPaper } from '../../src/drawing/paperSpace.ts';
// @vitest-environment happy-dom
import {
  act,
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useSyncExternalStore,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccessibilityInfoFixture } from '../lib/native-accessibility-fixture.mjs';
import { adoptedDrawing, createPaperInputView } from './native-paper-fixtures.mjs';
import { DrawingSurface } from '../../src/drawing/DrawingSurface.tsx';
import { DrawingAppearanceProvider } from '../../src/drawing/DrawingAppearance.tsx';
import { PageArtMotion } from '../../src/drawing/PageArtMotion.tsx';
import { InkAppearanceScope, useInkAppearance } from '../../src/drawing/InkAppearance.tsx';
import { ReduceMotionPreferenceProvider } from '../../src/drawing/useReduceMotion.ts';
import { Animated } from '../../src/platform/animated.ts';
import { PAPER_THEMES } from '../../src/drawing/theme.ts';

// Android draws every layer of the view tree on every frame, occluded or not, so each full-paper
// layer under the strokes costs GPU time for as long as a stroke is drawn.
const views = vi.hoisted(() => ({
  styles: [],
  props: [],
  outlines: [],
  ready: true,
  readyListeners: new Set(),
}));

vi.mock('react-native', () => {
  const View = forwardRef(({ children, onLayout, testID, style, ...props }, ref) => {
    views.props.push({ testID, style, ...props });
    useImperativeHandle(ref, () => ({ measure: (complete) => complete(0, 0, 1024, 768, 0, 0) }));
    useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { width: 1024, height: 768 } } });
    }, [onLayout]);
    views.styles.push(Object.assign({}, ...[style].flat(Infinity).filter(Boolean)));
    return createElement('div', { 'data-testid': testID }, children);
  });
  return {
    PixelRatio: { get: () => 1 },
    AccessibilityInfo: createAccessibilityInfoFixture(),
    useColorScheme: () => 'light',
    Platform: { OS: 'android' },
    findNodeHandle: (owner) => owner,
    StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
    Image: () => null,
    View,
    requireNativeComponent: (name) =>
      name === 'SplotchPaperInput'
        ? createPaperInputView(View, (emit) => {
            views.input = emit;
          })
        : View,
  };
});

vi.mock('../../src/platform/animated.ts', async () => {
  const { animatedPort, easingPort } =
    await import('../migration/tests/rsd-native-animated-host.mjs');
  const { View } = await import('react-native');
  return { Animated: animatedPort(View, View), Easing: easingPort };
});

vi.mock('../../src/drawing/CrayonGlaze.tsx', () => import('../../src/drawing/CrayonGlaze.web.tsx'));

// The outline itself is PageOutline's to draw; this file only asks whether the surface mounts a
// react-native-svg view for it.
vi.mock('../../src/drawing/PageOutline.tsx', async (actual) => ({
  ...(await actual()),
  usePageOutlineReady: () =>
    useSyncExternalStore(
      (listener) => {
        views.readyListeners.add(listener);
        return () => views.readyListeners.delete(listener);
      },
      () => views.ready
    ),
  PageOutline: ({ pageId }) => {
    const { theme } = useInkAppearance();
    views.outlines.push({ pageId, theme });
    return createElement('g', { 'data-outline': pageId, 'data-theme': theme });
  },
}));

vi.mock('react-native-svg', () => {
  const tag = (name) =>
    function Element({ children, ...props }) {
      return createElement(name, props, children);
    };
  return {
    default: forwardRef(({ children }, ref) => {
      useImperativeHandle(ref, () => ({ toDataURL: () => {} }));
      return createElement('svg', { 'data-svg-view': '' }, children);
    }),
    Defs: tag('defs'),
    Mask: tag('mask'),
    G: tag('g'),
    Image: tag('image'),
    Rect: tag('rect'),
    Path: tag('path'),
    Circle: tag('circle'),
    Pattern: tag('pattern'),
    Use: tag('use'),
    LinearGradient: tag('linearGradient'),
    Stop: tag('stop'),
  };
});

let container;
let root;

function mount(pageId, extra = {}) {
  const drawing = adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }, 0, pageId);
  act(() =>
    root.render(
      createElement(
        ReduceMotionPreferenceProvider,
        { preference: 'full' },
        createElement(
          DrawingAppearanceProvider,
          { preference: 'light' },
          createElement(DrawingSurface, {
            drawing,
            projection: paperProjection(drawingPaper(drawing)),
            currentDrawing: () => drawing,
            onPreparingChange: vi.fn(),
            onRendererFault: vi.fn(),
            color: 'Green',
            brush: 'pen',
            strokeWidth: 'medium',
            eraserWidth: 'medium',
            disabled: false,
            onCohort: vi.fn(),
            onDrawingChange: vi.fn(),
            onError: vi.fn(),
            ...extra,
          })
        )
      )
    )
  );
}

// The paper sheet is the one clipping view that fills the surface.
function sheet() {
  return views.styles.findLast(
    (style) => style.overflow === 'hidden' && style.width === '100%' && style.height === '100%'
  );
}

const outlineViews = () =>
  [...container.querySelectorAll('[data-svg-view]')].filter((svg) =>
    svg.querySelector('[data-outline]')
  );

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('requestAnimationFrame', (callback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  views.styles.length = 0;
  views.props.length = 0;
  views.outlines.length = 0;
  views.ready = true;
  views.readyListeners.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('native paper layers', () => {
  // react-native-svg paints its whole view into a bitmap on Android, empty or not.
  // Negative control: mounting the outline view for every page fails the blank case.
  it('mounts an outline view only for a page that has an outline', () => {
    mount('blank');
    expect(outlineViews()).toEqual([]);
    mount('sunshine');
    expect(
      outlineViews().map((svg) => svg.querySelector('[data-outline]').dataset.outline)
    ).toEqual(['sunshine']);
  });

  // Negative control: painting the sheet's own color under an underlay, or under a slot that
  // already wears the grain (null), fails here.
  it('paints a plain sheet only when nothing else paints the paper', () => {
    mount('blank');
    expect(sheet().backgroundColor).toBe(PAPER_THEMES.light.paper);
    mount('blank', { underlay: null });
    expect(sheet().backgroundColor).toBeUndefined();
    mount('blank', { underlay: createElement('i', { 'data-testid': 'grain' }) });
    expect(sheet().backgroundColor).toBeUndefined();
    expect(container.querySelector('[data-testid="grain"]')).not.toBeNull();
  });
});

const WIDE_ART = { width: 1024, height: 768 };
const TALL_ART = { width: 768, height: 1024 };
function setReady(ready) {
  act(() => {
    views.ready = ready;
    for (const listener of views.readyListeners) listener();
  });
}
function art(pageId, { size = WIDE_ART, theme = 'light', motion = 'full' } = {}) {
  act(() =>
    root.render(
      createElement(
        ReduceMotionPreferenceProvider,
        { preference: motion },
        createElement(
          InkAppearanceScope.Provider,
          { value: { pageId, theme } },
          createElement(PageArtMotion, { pageId, size })
        )
      )
    )
  );
}

it('lands only ready page art and replays only when the composition changes', () => {
  const timing = vi.spyOn(Animated, 'timing');
  setReady(false);
  art('farm/cat');
  expect(outlineViews()).toEqual([]);
  expect(timing).not.toHaveBeenCalled();
  setReady(true);
  art('farm/cat');
  expect(outlineViews()).toHaveLength(1);
  const arrivals = () =>
    timing.mock.calls.map(([, config]) => config).filter((config) => config.duration === 350);
  expect(arrivals()).toHaveLength(2);
  art('farm/cat', { theme: 'dark' });
  expect(container.querySelector('[data-outline]').dataset.theme).toBe('dark');
  expect(arrivals()).toHaveLength(2);
  art('farm/cat', { size: TALL_ART, theme: 'dark' });
  expect(arrivals()).toHaveLength(4);
});

it.each(['full', 'reduce'])(
  'removes cleared page art without retaining an outline under %s motion',
  (motion) => {
    art('sunshine', { motion });
    const wrapper = views.props.findLast((props) => props.testID === 'page-art-motion');
    expect(wrapper.pointerEvents).toBe('none');
    expect(wrapper.accessibilityElementsHidden).toBe(true);
    const timing = vi.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
    }));
    art('blank', { theme: 'dark', motion });
    expect(outlineViews()).toEqual([]);
    expect(container.querySelector('[data-testid="page-art-motion"]')).toBeNull();
    expect(timing).not.toHaveBeenCalled();
  }
);

it('does not resurrect old art when a pending replacement is cleared', () => {
  art('sunshine');
  setReady(false);
  art('farm/dog');
  expect(outlineViews()).toEqual([]);
  const timing = vi.spyOn(Animated, 'timing');
  art('blank');
  expect(outlineViews()).toEqual([]);
  expect(timing).not.toHaveBeenCalled();
});

it('stamps the motion preference at each arrival without replaying it or adding an exit', () => {
  const timing = vi.spyOn(Animated, 'timing');
  art('sunshine', { motion: 'reduce' });
  expect(timing.mock.calls.map(([, config]) => [config.toValue, config.duration])).toEqual([
    [1, 200],
  ]);
  art('sunshine', { motion: 'full' });
  expect(timing).toHaveBeenCalledTimes(1);
  art('blank', { motion: 'full' });
  expect(timing).toHaveBeenCalledTimes(1);
  art('farm/cat', { motion: 'full' });
  expect(timing.mock.calls.slice(1).map(([, config]) => config.duration)).toEqual([350, 350]);
  art('farm/cat', { motion: 'reduce' });
  expect(timing).toHaveBeenCalledTimes(3);
  art('blank', { motion: 'reduce' });
  expect(timing).toHaveBeenCalledTimes(3);
  art('sunshine', { motion: 'reduce' });
  expect(timing.mock.calls.at(-1)[1]).toMatchObject({ toValue: 1, duration: 200 });
  expect(timing).toHaveBeenCalledTimes(4);
});

it('keeps settled page art static through same-size paper renders', async () => {
  mount('sunshine');
  await act(async () => {});
  const rendered = views.outlines.length;
  const timing = vi.spyOn(Animated, 'timing');
  mount('sunshine');
  expect(views.outlines).toHaveLength(rendered);
  expect(timing).not.toHaveBeenCalled();
});

it('lands and removes art through the production DrawingSurface boundary', () => {
  const timing = vi.spyOn(Animated, 'timing');
  mount('blank');
  mount('sunshine');
  expect(
    timing.mock.calls.map(([, config]) => config).filter((config) => config.duration === 350)
  ).toHaveLength(2);
  timing.mockClear();
  mount('blank');
  expect(outlineViews()).toEqual([]);
  expect(timing).not.toHaveBeenCalled();
});
