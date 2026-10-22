import { paperProjection, drawingPaper } from '../../src/drawing/paperSpace.ts';
// @vitest-environment happy-dom
import { createAccessibilityInfoFixture } from '../lib/native-accessibility-fixture.mjs';
import {
  legacyDrawing,
  adoptedDrawing,
  createPaperInputView,
  paperInputPacket,
} from './native-paper-fixtures.mjs';
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
import { renderToStaticMarkup } from 'react-dom/server';
import { PageOutline } from '../../src/drawing/PageOutline.tsx';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingSurface } from '../../src/drawing/DrawingSurface.tsx';
import { DrawingAppearanceProvider } from '../../src/drawing/DrawingAppearance.tsx';
import { PAPER_HEIGHT, PAPER_WIDTH, emptyDrawing, strokeStyle } from '../../src/drawing/model.ts';
import { COLORING_PAGES } from '../../src/drawing/pages.ts';
import { paletteHex } from '../../src/drawing/palette.ts';
import { DRAWING_THEME } from '../../src/drawing/theme.ts';

const responder = vi.hoisted(() => ({ current: null, scheme: 'light', busy: true, errors: [] }));

vi.mock('react-native', () => {
  const View = forwardRef(({ children, onLayout, testID, style }, ref) => {
    useImperativeHandle(ref, () => ({ measure: (complete) => complete(0, 0, 1024, 768, 0, 0) }));
    useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { width: 1024, height: 768 } } });
    }, [onLayout]);
    const layers = Array.isArray(style) ? style : [style];
    const hidden = layers.some((layer) => layer?.left < 0 || layer?.opacity === 0);
    return createElement(
      'div',
      { 'data-testid': testID, 'data-hidden-artwork': hidden ? 'true' : undefined },
      children
    );
  });
  return {
    PixelRatio: { get: () => 1 },
    Dimensions: {
      get: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
      addEventListener: () => ({ remove() {} }),
    },
    AccessibilityInfo: createAccessibilityInfoFixture(),
    useColorScheme: () => responder.scheme,
    Platform: { OS: 'ios' },
    findNodeHandle: (owner) => owner,
    StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
    Image: ({ source, onLoad }) => {
      useEffect(() => onLoad?.(), [source.uri]);
      return null;
    },
    View,
    requireNativeComponent: (name) =>
      name === 'SplotchPaperInput'
        ? createPaperInputView(View, (emit) => {
            responder.current = emit;
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
vi.mock('react-native-svg', () => ({
  default: forwardRef(({ children, viewBox }, ref) => {
    const svg = useRef(null);
    useImperativeHandle(ref, () => ({
      toDataURL(callback) {
        if (hasCheckpointImage(svg.current)) capturedOutputs.push(svg.current.cloneNode(true));
        void sharp(Buffer.from(svg.current.outerHTML))
          .png()
          .toBuffer()
          .then((png) => {
            capturedBuffers.push({ svg: svg.current.cloneNode(true), png });
            callback(png.toString('base64'));
          });
      },
    }));
    return createElement(
      'svg',
      { ref: svg, viewBox, width: 1024, height: 768, xmlns: 'http://www.w3.org/2000/svg' },
      children
    );
  }),
  Defs: ({ children }) => createElement('defs', null, children),
  Mask: ({ children, ...props }) => createElement('mask', props, children),
  G: ({ children, ...props }) => createElement('g', props, children),
  Image: ({ href, onLoad, ...props }) => {
    useEffect(() => onLoad?.(), [href]);
    return createElement('image', { href, ...props });
  },
  Rect: (props) => createElement('rect', props),
  Path: (props) => createElement('path', props),
  Circle: (props) => createElement('circle', props),
  Pattern: ({ children, ...props }) =>
    createElement('pattern', { ...props, overflow: 'hidden' }, children),
  Use: (props) => createElement('use', props),
  LinearGradient: ({ children, ...props }) => createElement('linearGradient', props, children),
  Stop: (props) => createElement('stop', props),
}));

const drawing = {
  ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }, 0, 'sunshine'),
  strokes: [
    {
      ...strokeStyle('pen', 'Green', emptyDrawing()),
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
let capturedBuffers;

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
      createElement(
        DrawingAppearanceProvider,
        { preference: 'system' },
        createElement(DrawingSurface, {
          projection: paperProjection(drawingPaper(snapshot)),
          drawing: snapshot,
          currentDrawing: () => snapshot,
          onPreparingChange: (busy) => {
            responder.busy = busy;
          },
          onRendererFault: (error) => {
            responder.errors.push(error);
          },
          color: 'Green',
          brush: 'pen',
          strokeWidth: 'medium',
          eraserWidth: 'medium',
          disabled: false,
          onCohort: vi.fn(),
          onDrawingChange: vi.fn(),
          onError: vi.fn(),
          ref,
        })
      )
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
function hasCheckpointImage(svg) {
  return [...svg.querySelectorAll('image')].some((image) => !image.closest('defs'));
}

function liveArtwork() {
  const trees = [...container.querySelectorAll('[data-testid="drawing-paper"] svg')].filter(
    (tree) => !tree.closest('[data-hidden-artwork="true"]')
  );
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
  capturedBuffers = [];
  responder.scheme = 'light';
  responder.busy = true;
  responder.errors = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('coloring outlines over live and exported paint', () => {
  it('recodes real live Magic through the system-theme hook without replacing its Drawing', async () => {
    const snapshot = {
      ...legacyDrawing(3, 'sunshine'),
      strokes: [
        {
          brush: 'magic',
          width: 100,
          rainbow: 3,
          points: [
            { x: 100, y: 384 },
            { x: 924, y: 384 },
          ],
        },
        {
          ...strokeStyle('pen', 'Black', emptyDrawing(), 'thick'),
          points: [
            { x: 200, y: 100 },
            { x: 200, y: 650 },
          ],
        },
      ],
    };
    mount(snapshot);
    const day = await sharp(Buffer.from(liveArtwork().outerHTML))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expectPixel(day, { x: 512, y: 384 }, paletteHex('Yellow'));
    expectPixel(day, { x: 200, y: 150 }, paletteHex('Black'));
    responder.scheme = 'dark';
    const ref = mount(snapshot);
    const nightSvg = liveArtwork();
    const night = await sharp(Buffer.from(nightSvg.outerHTML))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expectPixel(night, { x: 512, y: 384 }, paletteHex('Orange'));
    expectPixel(night, { x: 200, y: 150 }, '#ffffff');
    const outlines = [...nightSvg.querySelectorAll('path[fill="none"]')].filter(
      (path) => path.getAttribute('stroke') === '#eceaf2'
    );
    expect(outlines.map((path) => path.getAttribute('d'))).toEqual(COLORING_PAGES.sunshine.paths);
    const unlock = ref.current.lockInput();
    let completed;
    act(() => {
      completed = ref.current.capturePng(snapshot);
    });
    let result;
    completed.then((value) => {
      result = value;
    });
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(result).toBeDefined();
    });
    unlock();
    const exported = await sharp(Buffer.from(result, 'base64'))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expectPixel(exported, { x: 512, y: 384 }, paletteHex('Orange'));
    expectPixel(exported, { x: 200, y: 150 }, '#ffffff');
    expect(snapshot.strokes[1].color).toBe('Black');
    expectPixel(exported, { x: 20, y: 20 }, '#211f29');
    expect(snapshot.strokes[0].rainbow).toBe(3);
  });

  it('refuses a direct outline without the required appearance owner', () => {
    expect(() => renderToStaticMarkup(createElement(PageOutline, { pageId: 'sunshine' }))).toThrow(
      'current paper appearance'
    );
  });

  it('keeps committed and draft crossings visible on the live paper', async () => {
    mount();
    const first = touch(512, 100);
    act(() =>
      responder.current({
        nativeEvent: paperInputPacket('start', first, 0, {
          width: 1024,
          height: 768,
          bottomInset: 0,
        }),
      })
    );
    act(() =>
      responder.current({
        nativeEvent: paperInputPacket('move', touch(512, 650, 200), 1, {
          width: 1024,
          height: 768,
          bottomInset: 0,
        }),
      })
    );
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

function mixedCrayonDrawing(reverse) {
  const base = adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 });
  const colors = ['Black', '#0A0B10'].map((color, index) => ({
    ...strokeStyle('crayon', color, base, 'thick'),
    points: [
      { x: 100, y: index === 0 ? 200 : 560 },
      { x: 924, y: index === 0 ? 200 : 560 },
    ],
  }));
  return {
    ...base,
    strokes: [
      ...(reverse ? colors.toReversed() : colors),
      {
        ...strokeStyle('eraser', 'Black', base, 'thin'),
        points: [
          { x: 100, y: 730 },
          { x: 924, y: 730 },
        ],
      },
    ],
  };
}
function mixedCoverage(image, y, bright) {
  let count = 0;
  for (let row = y - 6; row < y + 6; row++)
    for (let x = 480; x < 544; x++) {
      const offset = (row * image.info.width + x) * image.info.channels;
      const channels = [...image.data.subarray(offset, offset + 3)];
      if (
        image.data[offset + 3] > 200 &&
        channels.every((value) => (bright ? value > 230 : value < 30))
      )
        count++;
    }
  return count;
}
async function expectMixedPixels(png, theme) {
  const image = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(mixedCoverage(image, 200, theme === 'dark')).toBeGreaterThan((64 * 12) / 4);
  expect(mixedCoverage(image, 560, false)).toBeGreaterThan((64 * 12) / 4);
}
it.each([false, true])(
  'retains both crayon paints through live, actual raster prefix and export across theme transitions, reversed=%s',
  async (reverse) => {
    const snapshot = mixedCrayonDrawing(reverse);
    const serialized = JSON.stringify(snapshot);
    for (const theme of ['light', 'dark', 'light']) {
      responder.scheme = theme;
      responder.busy = true;
      const start = capturedBuffers.length;
      const ref = mount(snapshot);
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(responder.errors).toEqual([]);
        expect(responder.busy).toBe(false);
        expect(container.querySelector('[data-testid="drawing-paper"] image')).not.toBeNull();
      });
      const prefix = capturedBuffers.slice(start).find(({ svg }) => !hasCheckpointImage(svg));
      expect(prefix).toBeDefined();
      await expectMixedPixels(prefix.png, theme);
      const live = await sharp(Buffer.from(liveArtwork().outerHTML)).png().toBuffer();
      await expectMixedPixels(live, theme);
      const release = ref.current.lockInput();
      let output;
      await act(async () => {
        output = ref.current.capturePng(snapshot);
      });
      let base64;
      output.then((value) => {
        base64 = value;
      });
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(base64).toBeDefined();
      });
      release();
      await expectMixedPixels(Buffer.from(base64, 'base64'), theme);
      expect(JSON.stringify(snapshot)).toBe(serialized);
    }
  }
);
