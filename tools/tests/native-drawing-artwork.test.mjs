// @vitest-environment happy-dom
import {
  act,
  createElement,
  createRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { createRoot } from 'react-dom/client';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import {
  PAPER_HEIGHT,
  PAPER_WIDTH,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { COLORING_PAGES } from '../../experiments/native-architecture/src/drawing/pages.ts';
import { paletteHex } from '../../experiments/native-architecture/src/drawing/palette.ts';
import { DRAWING_THEME } from '../../experiments/native-architecture/src/drawing/theme.ts';

const responder = vi.hoisted(() => ({ current: null }));

vi.mock('react-native', () => ({
  PanResponder: {
    create: (handlers) => {
      responder.current = handlers;
      return { panHandlers: {} };
    },
  },
  StyleSheet: { create: (styles) => styles },
  View: ({ children, onLayout, testID }) => {
    useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { width: 1024, height: 768 } } });
    }, [onLayout]);
    return createElement('div', { 'data-testid': testID }, children);
  },
}));

vi.mock('react-native-svg', () => ({
  default: forwardRef(({ children, viewBox }, ref) => {
    const svg = useRef(null);
    useImperativeHandle(ref, () => ({
      toDataURL(callback) {
        void sharp(Buffer.from(svg.current.outerHTML))
          .png()
          .toBuffer()
          .then((png) => callback(png.toString('base64')));
      },
    }));
    return createElement(
      'svg',
      { ref: svg, viewBox, width: 1024, height: 768, xmlns: 'http://www.w3.org/2000/svg' },
      children
    );
  }),
  Rect: (props) => createElement('rect', props),
  Path: (props) => createElement('path', props),
  Circle: (props) => createElement('circle', props),
}));

const drawing = {
  version: 2,
  pageId: 'sunshine',
  strokes: [
    {
      color: 'Green',
      brush: 'marker',
      points: [
        { x: 100, y: 384 },
        { x: 900, y: 384 },
      ],
    },
  ],
};
const CROSSINGS = [
  { x: 342, y: 384 },
  { x: 682, y: 384 },
];
let container;
let root;
let frame;

function colorChannels(color) {
  const expanded =
    color.length === 4
      ? color
          .slice(1)
          .split('')
          .map((channel) => channel.repeat(2))
          .join('')
      : color.slice(1);
  return expanded.match(/../g).map((channel) => parseInt(channel, 16));
}

function expectPixel(image, point, color) {
  const offset = (point.y * image.info.width + point.x) * image.info.channels;
  expect([...image.data.subarray(offset, offset + 3)]).toEqual(colorChannels(color));
}

function expectOutlineLast(svg, inkCount, pageId = 'sunshine') {
  const paths = [...svg.querySelectorAll('path')];
  expect(paths.slice(0, inkCount).map((path) => path.getAttribute('stroke'))).toEqual(
    Array(inkCount).fill(paletteHex('Green'))
  );
  expect(paths.slice(inkCount).map((path) => path.getAttribute('d'))).toEqual(
    COLORING_PAGES[pageId].paths
  );
  expect(paths.slice(inkCount).map((path) => path.getAttribute('stroke'))).toEqual(
    Array(COLORING_PAGES[pageId].paths.length).fill(DRAWING_THEME.textStrong)
  );
}

function mount() {
  const ref = createRef();
  act(() =>
    root.render(
      createElement(DrawingSurface, {
        drawing,
        color: 'Green',
        brush: 'marker',
        disabled: false,
        onStroke: vi.fn(),
        onDrawingChange: vi.fn(),
        onError: vi.fn(),
        ref,
      })
    )
  );
  return ref;
}

function touch(x, y) {
  const item = { identifier: 'finger', locationX: x, locationY: y };
  return { nativeEvent: { touches: [item], changedTouches: [item] } };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('coloring outlines over live and exported paint', () => {
  it('keeps committed and draft crossings visible on the live paper', async () => {
    mount();
    act(() => responder.current.onPanResponderGrant(touch(512, 100)));
    act(() => responder.current.onPanResponderMove(touch(512, 650)));
    const svg = container.querySelector('[data-testid="drawing-paper"] svg');
    const image = await sharp(Buffer.from(svg.outerHTML))
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(image.info.width).toBe(PAPER_WIDTH);
    expect(image.info.height).toBe(PAPER_HEIGHT);
    CROSSINGS.forEach((point) => expectPixel(image, point, DRAWING_THEME.textStrong));
    expectPixel(image, { x: 512, y: 214 }, DRAWING_THEME.textStrong);
    expectPixel(image, { x: 200, y: 384 }, paletteHex('Green'));
    expectPixel(image, { x: 512, y: 200 }, paletteHex('Green'));
    expectOutlineLast(svg, 2);
  });

  it.each([
    {
      pageId: 'sunshine',
      points: [
        { x: 100, y: 384 },
        { x: 900, y: 384 },
      ],
      crossings: CROSSINGS,
      inkPoint: { x: 200, y: 384 },
    },
    {
      pageId: 'flower',
      points: [
        { x: 410, y: 384 },
        { x: 614, y: 384 },
      ],
      crossings: [
        { x: 426, y: 384 },
        { x: 598, y: 384 },
      ],
      inkPoint: { x: 512, y: 384 },
    },
  ])(
    'captures the $pageId snapshot with outline pixels above crossing paint',
    async ({ pageId, points, crossings, inkPoint }) => {
      const ref = mount();
      const snapshot = { ...drawing, pageId, strokes: [{ ...drawing.strokes[0], points }] };
      let exported;
      act(() => {
        exported = ref.current.capturePng(snapshot);
      });
      const exportSvg = [...container.querySelectorAll('svg')].at(-1);
      expectOutlineLast(exportSvg, 1, pageId);
      let base64;
      await act(async () => {
        frame();
        base64 = await exported;
      });
      const image = await sharp(Buffer.from(base64, 'base64'))
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(image.info.width).toBe(PAPER_WIDTH);
      expect(image.info.height).toBe(PAPER_HEIGHT);
      crossings.forEach((point) => expectPixel(image, point, DRAWING_THEME.textStrong));
      expectPixel(image, inkPoint, paletteHex('Green'));
    }
  );
});
