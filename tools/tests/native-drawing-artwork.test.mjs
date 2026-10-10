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
  Platform: { OS: 'ios' },
  findNodeHandle: (owner) => owner,
  StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
  View: forwardRef(({ children, onLayout, testID }, ref) => {
    useImperativeHandle(ref, () => ({ measure: (complete) => complete(0, 0, 1024, 768, 0, 0) }));
    useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { width: 1024, height: 768 } } });
    }, [onLayout]);
    return createElement('div', { 'data-testid': testID }, children);
  }),
}));

vi.mock('react-native-svg', () => ({
  default: forwardRef(({ children, viewBox }, ref) => {
    const svg = useRef(null);
    useImperativeHandle(ref, () => ({
      toDataURL(callback) {
        if (svg.current.querySelector('image')) capturedOutputs.push(svg.current.cloneNode(true));
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
  Defs: ({ children }) => createElement('defs', null, children),
  G: ({ children, ...props }) => createElement('g', props, children),
  Image: ({ href, onLoad, ...props }) => {
    useEffect(() => onLoad?.(), [href]);
    return createElement('image', { href, ...props });
  },
  Rect: (props) => createElement('rect', props),
  Path: (props) => createElement('path', props),
  Circle: (props) => createElement('circle', props),
}));

const drawing = {
  version: 3,
  rainbow: 0,
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
let capturedOutputs;

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

function mount(snapshot = drawing) {
  const ref = createRef();
  act(() =>
    root.render(
      createElement(DrawingSurface, {
        drawing: snapshot,
        currentDrawing: () => snapshot,
        onPreparingChange: vi.fn(),
        onRendererFault: vi.fn(),
        color: 'Green',
        brush: 'marker',
        disabled: false,
        onCohort: vi.fn(),
        onDrawingChange: vi.fn(),
        onError: vi.fn(),
        ref,
      })
    )
  );
  return ref;
}

function touch(x, y, timestamp = 100) {
  const item = {
    identifier: 0,
    locationX: x,
    locationY: y,
    pageX: x,
    pageY: y,
    timestamp,
    target: 101,
  };
  return {
    currentTarget: 101,
    nativeEvent: { touches: [item], changedTouches: [item], target: 101 },
    touchHistory: {
      touchBank: [{ touchActive: true, startTimeStamp: 100 }],
      mostRecentTimeStamp: timestamp,
    },
  };
}
function liveArtwork() {
  const trees = [...container.querySelectorAll('[data-testid="drawing-paper"] svg')];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 1024 768');
  svg.setAttribute('width', '1024');
  svg.setAttribute('height', '768');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.innerHTML = trees.map((tree) => tree.innerHTML).join('');
  return svg;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('requestAnimationFrame', (callback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  capturedOutputs = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('coloring outlines over live and exported paint', () => {
  it('keeps committed and draft crossings visible on the live paper', async () => {
    mount();
    const first = touch(512, 100);
    act(() => responder.current.onPanResponderGrant(first));
    act(() => responder.current.onPanResponderStart(first));
    act(() => responder.current.onPanResponderMove(touch(512, 650, 200)));
    const svg = liveArtwork();
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
      const snapshot = { ...drawing, pageId, strokes: [{ ...drawing.strokes[0], points }] };
      const ref = mount(snapshot);
      const unlock = ref.current.lockInput();
      let exported;
      act(() => {
        exported = ref.current.capturePng(snapshot);
      });
      let base64;
      exported.then((value) => {
        base64 = value;
      });
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(base64).toBeDefined();
      });
      unlock();
      const exportSvg = capturedOutputs.at(-1);
      expectOutlineLast(exportSvg, 0, pageId);
      expect(exportSvg.querySelector('image')).not.toBeNull();
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
