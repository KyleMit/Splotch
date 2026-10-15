// @vitest-environment happy-dom
import { act, createElement, forwardRef, useEffect, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccessibilityInfoFixture } from '../lib/native-accessibility-fixture.mjs';
import { adoptedDrawing, createPaperInputView } from './native-paper-fixtures.mjs';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import { DrawingAppearanceProvider } from '../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { PAPER_THEMES } from '../../experiments/native-architecture/src/drawing/theme.ts';

// Android draws every layer of the view tree on every frame, occluded or not, so each full-paper
// layer under the strokes costs GPU time for as long as a stroke is drawn.
const views = vi.hoisted(() => ({ styles: [] }));

vi.mock('react-native', () => {
  const View = forwardRef(({ children, onLayout, testID, style }, ref) => {
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

vi.mock(
  '../../experiments/native-architecture/src/drawing/CrayonGlaze.tsx',
  () => import('../../experiments/native-architecture/src/drawing/CrayonGlaze.web.tsx')
);

// The outline itself is PageOutline's to draw; this file only asks whether the surface mounts a
// react-native-svg view for it.
vi.mock('../../experiments/native-architecture/src/drawing/PageOutline.tsx', async (actual) => ({
  ...(await actual()),
  PageOutline: ({ pageId }) => createElement('g', { 'data-outline': pageId }),
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
        DrawingAppearanceProvider,
        { preference: 'light' },
        createElement(DrawingSurface, {
          drawing,
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
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
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
