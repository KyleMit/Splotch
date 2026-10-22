// @vitest-environment happy-dom
import { paperInputPacket } from './native-paper-fixtures.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  adoptPaper,
  containsPaperPoint,
  paperContactPoint,
  paperSize,
  presentedPaperSize,
  pageArtTransform,
  CANONICAL_PAPER_SIZE,
  LEGACY_PAPER,
  UNADOPTED_PAPER,
  MIN_BACKING_SCALE,
  MIN_PAPER_CSS_PX,
  MAX_UNITS_PER_CSS_PX,
  readDrawingPaper,
  semanticWidth,
  textureScale,
} from '../../src/drawing/paperSpace.ts';
import { validateAiOriginalModel } from '../../src/platform/aiOriginalModel.ts';
import { addStrokes, createHistory } from '../../src/drawing/model.ts';
import { parseDrawing } from '../../src/drawing/drawingFormat.ts';
import { fittedPaper } from '../../src/drawing/paperGeometry.ts';
import { createContactResponder } from '../../src/drawing/contactResponder.ts';
import { createLiveInkFeed } from '../../src/drawing/liveInk.ts';
import { PageOutline } from '../../src/drawing/PageOutline.tsx';
import { InkAppearanceScope } from '../../src/drawing/InkAppearance.tsx';
import { loadNativePageOutlines } from './native-bundled-outlines-fixture.mjs';

vi.mock('react-native', () => ({ findNodeHandle: (target) => target }));
vi.mock('react-native-svg', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ children, ...props }) => createElement('svg', props, children),
    G: ({ children, ...props }) => createElement('g', props, children),
    Path: (props) => createElement('path', props),
    Rect: (props) => createElement('rect', props),
    Ellipse: (props) => createElement('ellipse', props),
    Image: (props) => createElement('image', props),
    SvgXml: (props) => createElement('svg-xml', props),
  };
});

// The paper area beside the swatch bar on a 390x844 phone held upright.
const PORTRAIT = { width: 390, height: 704 };
const PORTRAIT_SIZE = { width: 567, height: 1024 };
const pen = { brush: 'pen', color: 'Red', width: 22 };

describe('a picture takes the shape of the paper area it is first drawn in', () => {
  it.each([
    [PORTRAIT, PORTRAIT_SIZE],
    [
      { width: 844, height: 300 },
      { width: 1024, height: 364 },
    ],
    [{ width: 342, height: 256.5 }, CANONICAL_PAPER_SIZE],
    [
      { width: 1366, height: 1024 },
      { width: 1024, height: 768 },
    ],
    [
      { width: 800, height: 800 },
      { width: 768, height: 768 },
    ],
  ])('sizes an adoption of %j as %j semantic units', (frame, size) => {
    expect(paperSize(adoptPaper(frame.width, frame.height, 3))).toEqual(size);
    expect(presentedPaperSize(UNADOPTED_PAPER, frame)).toEqual(size);
  });

  it('keeps the canonical sheet for legacy pictures and an unmeasured blank page', () => {
    expect(paperSize(LEGACY_PAPER)).toEqual(CANONICAL_PAPER_SIZE);
    expect(presentedPaperSize(UNADOPTED_PAPER, { width: 0, height: 0 })).toEqual(
      CANONICAL_PAPER_SIZE
    );
  });

  it('round-trips finite off-paper ink without changing its adopted shape', () => {
    const paper = adoptPaper(PORTRAIT.width, PORTRAIT.height, 3);
    const strokes = [
      {
        ...pen,
        points: [
          { x: -30, y: 1024.01 },
          { x: 568, y: 10 },
        ],
      },
    ];
    const drawing = addStrokes(createHistory(), strokes, paper).drawing;
    const wire = JSON.parse(JSON.stringify(drawing));
    expect(wire.version).toBe(8);
    expect(wire.paper).toEqual({ kind: 'adopted', cssWidth: 390, cssHeight: 704, backingScale: 2 });
    expect(parseDrawing(wire)).toEqual(drawing);
    for (const invalid of [NaN, Infinity, -Infinity])
      expect(() =>
        parseDrawing({ ...wire, strokes: [{ ...pen, points: [{ x: invalid, y: 10 }] }] })
      ).toThrow('point');
    expect(() => parseDrawing({ ...wire, version: 6 })).toThrow('supported');
    const landscape = { ...wire, paper: { ...wire.paper, cssWidth: 704, cssHeight: 390 } };
    expect(parseDrawing(landscape).strokes).toEqual(strokes);
    expect(() => parseDrawing({ version: 5, pageId: 'blank', rainbow: 0, strokes })).toThrow(
      'point'
    );
  });
});

const TARGET = {};
function touch(identifier, x, y, timestamp) {
  return { identifier, pageX: x, pageY: y, timestamp, target: TARGET };
}
function event(touches, changedTouches = touches, starts = {}) {
  const touchBank = [];
  for (const item of [...touches, ...changedTouches])
    touchBank[item.identifier] = {
      touchActive: touches.some(({ identifier }) => identifier === item.identifier),
      startTimeStamp: starts[item.identifier] ?? item.timestamp,
    };
  return {
    currentTarget: TARGET,
    nativeEvent: { touches, changedTouches, target: TARGET },
    touchHistory: {
      touchBank,
      mostRecentTimeStamp: Math.max(...[...touches, ...changedTouches].map((t) => t.timestamp)),
    },
  };
}

function responder(frame) {
  let history = createHistory();
  const drafts = vi.fn();
  const live = createLiveInkFeed();
  const input = createContactResponder(
    () => ({
      currentDrawing: () => history.drawing,
      color: 'Red',
      brush: 'pen',
      strokeWidth: 'thick',
      eraserWidth: 'thick',
      disabled: false,
      onCohort: (strokes, paper) => {
        history = addStrokes(history, strokes, paper);
      },
      onDrawingChange: vi.fn(),
      onError: (error) => {
        throw error;
      },
    }),
    () => frame.current,
    (paper, halos) => drafts(live.drafts(), paper, halos),
    () => 3,
    live
  );
  // The surface attaches its responder before any packet arrives; attaching connects the feed.
  input.attach();
  let sequence = 0;
  function send(phase, value) {
    input.receiveInput(
      paperInputPacket(phase, value, sequence++, { width: 844, height: 944, bottomInset: 0 })
    );
  }
  function stroke(id, from, to, at) {
    send('start', event([touch(id, ...from, at)]));
    send('move', event([touch(id, ...to, at + 1)], undefined, { [id]: at }));
    send('end', event([], [touch(id, ...to, at + 2)], { [id]: at }));
  }
  return { stroke, drafts, history: () => history };
}

describe('contacts on a portrait paper', () => {
  it('adopts the whole ink plane and maps contacts under the finger', () => {
    const frame = { current: { ...PORTRAIT, pageX: 0, pageY: 100 } };
    const f = responder(frame);
    f.stroke('a', [195, 452], [390, 804], 1);
    const drawing = f.history().drawing;
    expect(drawing.paper).toEqual({
      kind: 'adopted',
      cssWidth: 390,
      cssHeight: 704,
      backingScale: 2,
    });
    expect(drawing.strokes[0].points).toEqual([
      { x: 283.5, y: 512 },
      { x: 567.14, y: 1024 },
    ]);
  });

  it('maps the same paper spot after the picture is fitted into a landscape space', () => {
    const frame = { current: { ...PORTRAIT, pageX: 0, pageY: 100 } };
    const f = responder(frame);
    f.stroke('a', [195, 452], [195, 452], 1);
    const fit = fittedPaper({ width: 844, height: 300 }, f.history().drawing.paper);
    frame.current = { width: fit.width, height: fit.height, pageX: fit.left, pageY: 40 };
    f.stroke('b', [fit.left + fit.width / 2, 40 + fit.height / 2], [fit.left, 40], 10);
    expect(f.history().drawing.paper).toBe(f.history().undo.at(-1).paper);
    expect(f.history().drawing.strokes[1].points).toEqual([
      { x: 283.5, y: 512 },
      { x: -0.14, y: 0 },
    ]);
  });

  it('refuses a contact in the letterbox outside the fitted paper', () => {
    const size = PORTRAIT_SIZE;
    expect(containsPaperPoint(195, 352, 390, 704, size)).toBe(true);
    expect(containsPaperPoint(10, 352, 844 * 0.5, 704, size)).toBe(false);
    expect(paperContactPoint(195, 352, 390, 704, size)).toEqual({ x: 283.5, y: 512 });
  });

  it('retains an admitted movement outside the paper instead of drawing along its edge', () => {
    const frame = { current: { ...PORTRAIT, pageX: 0, pageY: 100 } };
    const f = responder(frame);
    f.stroke('a', [195, 452], [-30, 850], 1);
    expect(f.history().drawing.strokes[0].points).toEqual([
      { x: 283.5, y: 512 },
      { x: -43.77, y: 1090.91 },
    ]);
    expect(parseDrawing(f.history().drawing)).toEqual(f.history().drawing);
    f.stroke('outside', [-30, 452], [100, 452], 10);
    expect(f.history().drawing.strokes).toHaveLength(1);
  });
});

describe('rotation keeps the picture shape (ADR-0050)', () => {
  const portrait = adoptPaper(PORTRAIT.width, PORTRAIT.height, 3);

  it('fills the space while the page is blank so the first contact adopts it', () => {
    expect(fittedPaper({ width: 844, height: 300 }, UNADOPTED_PAPER)).toEqual({
      left: 0,
      top: 0,
      width: 844,
      height: 300,
    });
  });

  it('presents an unrotated picture in exactly the frame it adopted', () => {
    expect(fittedPaper(PORTRAIT, portrait)).toEqual({ left: 0, top: 0, ...PORTRAIT });
  });

  it('contain-fits and centers a portrait picture in a landscape space', () => {
    const fit = fittedPaper({ width: 844, height: 300 }, portrait);
    expect(fit.height).toBe(300);
    expect(fit.width).toBeCloseTo((300 * 390) / 704, 9);
    expect(fit.left).toBeCloseTo((844 - fit.width) / 2, 9);
    expect(fit.top).toBe(0);
    const back = fittedPaper(PORTRAIT, portrait);
    expect(back).toEqual({ left: 0, top: 0, ...PORTRAIT });
  });

  it('keeps the canonical 4:3 sheet for a legacy picture', () => {
    expect(fittedPaper({ width: 390, height: 704 }, LEGACY_PAPER)).toEqual({
      left: 0,
      top: 205.75,
      width: 390,
      height: 292.5,
    });
  });
});

describe('coloring pages on a non-4:3 paper', () => {
  function outline(pageId, size) {
    return renderToStaticMarkup(
      createElement(
        InkAppearanceScope.Provider,
        { value: { pageId, theme: 'light' } },
        createElement(PageOutline, { pageId, size })
      )
    );
  }

  it('contain-fits and centers the sample page frame on the paper', () => {
    expect(pageArtTransform(PORTRAIT_SIZE)).toBe('translate(0 299.375) scale(0.5537109375)');
    expect(pageArtTransform(CANONICAL_PAPER_SIZE)).toBe('translate(0 0) scale(1)');
    expect(outline('sunshine', PORTRAIT_SIZE)).toContain(
      'transform="translate(0 299.375) scale(0.5537109375)"'
    );
  });

  it('fits bundled book art to the whole paper, not the canonical frame', async () => {
    // The native line art loads on first use; the static render below draws it once loaded.
    await loadNativePageOutlines(['farm/cat']);
    const markup = outline('farm/cat', PORTRAIT_SIZE);
    expect(markup).toContain('width="567"');
    expect(markup).toContain('height="1024"');
    expect(markup).toContain('preserveAspectRatio="xMidYMid meet"');
  });
});

describe('the adopted paper is bounded from below', () => {
  const stroke = { ...pen, points: [{ x: 0, y: 0 }] };
  function wire(paper) {
    return { version: 7, paper, pageId: 'blank', rainbow: 0, strokes: [stroke] };
  }
  const paper = (cssWidth, cssHeight = cssWidth, backingScale = 1) => ({
    kind: 'adopted',
    cssWidth,
    cssHeight,
    backingScale,
  });

  it('refuses a vanishing paper whose stroke widths would overflow', () => {
    const vanishing = wire(paper(1e-305));
    expect(() => parseDrawing(vanishing)).toThrow('paper reference');
    expect(() => validateAiOriginalModel(JSON.stringify(vanishing), 'current')).toThrow();
    expect(() => adoptPaper(1e-305, 1e-305, 1)).toThrow('paper reference');
  });

  it.each([
    [MIN_PAPER_CSS_PX, MIN_PAPER_CSS_PX],
    [MIN_PAPER_CSS_PX + 1e-9, MIN_PAPER_CSS_PX + 1e-9],
    [MIN_PAPER_CSS_PX, 8192],
  ])('admits a %s x %s paper with finite, bounded derived widths and texels', (w, h) => {
    const drawing = parseDrawing(wire(paper(w, h, MIN_BACKING_SCALE)));
    const width = semanticWidth(22, drawing.paper);
    expect(Number.isFinite(width)).toBe(true);
    expect(width).toBeLessThanOrEqual(22 * MAX_UNITS_PER_CSS_PX);
    expect(textureScale(drawing.paper)).toBeLessThanOrEqual(
      MAX_UNITS_PER_CSS_PX / MIN_BACKING_SCALE
    );
    expect(() =>
      validateAiOriginalModel(JSON.stringify(wire(paper(w, h, MIN_BACKING_SCALE))), 'current')
    ).not.toThrow();
  });

  it.each([
    paper(MIN_PAPER_CSS_PX - 1e-9),
    paper(390, MIN_PAPER_CSS_PX - 1e-9),
    paper(390, 704, MIN_BACKING_SCALE - 1e-9),
  ])('refuses metadata just below a minimum %#', (value) => {
    expect(() => readDrawingPaper(value)).toThrow('paper reference');
    expect(() => validateAiOriginalModel(JSON.stringify(wire(value)), 'current')).toThrow();
  });

  it('clamps a zoomed-out display ratio up to the minimum backing scale', () => {
    expect(adoptPaper(390, 704, 0.1).backingScale).toBe(MIN_BACKING_SCALE);
  });
});
