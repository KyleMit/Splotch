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
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import {
  addStrokes,
  createHistory,
  parseDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { fittedPaper } from '../../experiments/native-architecture/src/drawing/paperGeometry.ts';
import { createContactResponder } from '../../experiments/native-architecture/src/drawing/contactResponder.ts';
import { PageOutline } from '../../experiments/native-architecture/src/drawing/PageOutline.tsx';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';

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

  it('round-trips a portrait picture and bounds its points by its own shape', () => {
    const paper = adoptPaper(PORTRAIT.width, PORTRAIT.height, 3);
    const strokes = [{ ...pen, points: [{ x: 567, y: 1024 }] }];
    const drawing = addStrokes(createHistory(), strokes, paper).drawing;
    const wire = JSON.parse(JSON.stringify(drawing));
    expect(wire.version).toBe(7);
    expect(wire.paper).toEqual({ kind: 'adopted', cssWidth: 390, cssHeight: 704, backingScale: 2 });
    expect(parseDrawing(wire)).toEqual(drawing);
    expect(() =>
      parseDrawing({ ...wire, strokes: [{ ...pen, points: [{ x: 568, y: 10 }] }] })
    ).toThrow('point');
    expect(() =>
      parseDrawing({ ...wire, strokes: [{ ...pen, points: [{ x: 10, y: 1024.01 }] }] })
    ).toThrow('point');
    expect(() => parseDrawing({ ...wire, version: 6 })).toThrow('supported');
    const landscape = { ...wire, paper: { ...wire.paper, cssWidth: 704, cssHeight: 390 } };
    expect(() => parseDrawing(landscape)).toThrow('point');
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
    drafts,
    () => 3
  );
  function stroke(id, from, to, at) {
    const start = event([touch(id, ...from, at)]);
    input.grant(start);
    input.start(start);
    input.move(event([touch(id, ...to, at + 1)], undefined, { [id]: at }));
    input.release(event([], [touch(id, ...to, at + 2)], { [id]: at }));
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
      { x: 567, y: 1024 },
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
      { x: 0, y: 0 },
    ]);
  });

  it('refuses a contact in the letterbox outside the fitted paper', () => {
    const size = PORTRAIT_SIZE;
    expect(containsPaperPoint(195, 352, 390, 704, size)).toBe(true);
    expect(containsPaperPoint(10, 352, 844 * 0.5, 704, size)).toBe(false);
    expect(paperContactPoint(195, 352, 390, 704, size)).toEqual({ x: 283.5, y: 512 });
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

  it('fits bundled book art to the whole paper, not the canonical frame', () => {
    const markup = outline('farm/cat', PORTRAIT_SIZE);
    expect(markup).toContain('width="567"');
    expect(markup).toContain('height="1024"');
    expect(markup).toContain('preserveAspectRatio="xMidYMid meet"');
  });
});
