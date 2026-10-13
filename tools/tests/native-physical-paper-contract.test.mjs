import { describe, expect, it, vi } from 'vitest';
import {
  adoptPaper,
  drawingPaper,
  LEGACY_PAPER,
  readDrawingPaper,
  semanticWidth,
  textureScale,
  paperContactPoint,
  containsPaperPoint,
  samePaper,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import {
  addStrokes,
  clearDrawing,
  createHistory,
  emptyDrawing,
  parseDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { createContactCohort } from '../../experiments/native-architecture/src/drawing/contactCohort.ts';
import {
  STROKE_WIDTHS,
  strokeWidthPx,
} from '../../experiments/native-architecture/src/drawing/strokeWidth.ts';
import { planInk } from '../../experiments/native-architecture/src/drawing/checkpoints.ts';
import { crayonPasses } from '../../experiments/native-architecture/src/drawing/crayon.ts';

const PHONE_WIDTH = 342;
const PHONE_HEIGHT = 256.5;
const point = { x: 100, y: 400 };
const pen = { brush: 'pen', color: 'Red', width: 22, points: [point] };
const crayon = { brush: 'crayon', color: 'Red', width: 22, seed: 1, points: [point] };

function contact(drawing = emptyDrawing(), adopt = () => adoptPaper(PHONE_WIDTH, PHONE_HEIGHT, 1)) {
  const owner = createContactCohort();
  owner.start('a', 'Red', 'crayon', point, drawing, 'extraThick', adopt);
  return owner;
}

describe('drawing-level physical paper reference', () => {
  it.each([
    [342, 256.5, 1],
    [760, 570, 1],
    [342, 256.5, 3],
  ])('projects the finite CSS widths and backing texels at adoption %s/%s DPR%s', (w, h, dpr) => {
    const paper = adoptPaper(w, h, dpr);
    const scale = w / 1024;
    for (const brush of ['pen', 'crayon', 'magic', 'eraser'])
      for (const selection of STROKE_WIDTHS) {
        const width = strokeWidthPx(brush, selection);
        expect(semanticWidth(width, paper) * scale).toBeCloseTo(width, 12);
      }
    expect(textureScale(paper) * scale).toBeCloseTo(1 / Math.min(dpr, 2), 12);
    expect(textureScale(paper) / semanticWidth(1, paper)).toBeCloseTo(1 / Math.min(dpr, 2), 12);
    expect(semanticWidth(22, LEGACY_PAPER)).toBe(22);
    expect(textureScale(LEGACY_PAPER)).toBe(1);
    expect(semanticWidth(22, paper) * scale).not.toBeCloseTo(22 * scale, 2);
  });

  it('reserves once per first cohort and publishes the identical reference with committed ink', () => {
    const drawing = emptyDrawing();
    const adoption = vi.fn(() => adoptPaper(PHONE_WIDTH, PHONE_HEIGHT, 1));
    const owner = contact(drawing, adoption);
    const previewPaper = owner.paper();
    owner.start('b', 'Blue', 'pen', point, drawing, 'thin', () => {
      throw new Error('second adoption');
    });
    expect(adoption).toHaveBeenCalledTimes(1);
    expect(owner.finish('a')).toBeNull();
    expect(drawing).toEqual(emptyDrawing());
    const history = addStrokes(createHistory(drawing), owner.finish('b'), owner.paper());
    expect(history.drawing.version).toBe(6);
    expect(history.drawing.paper).toBe(previewPaper);
    expect(history.undo).toEqual([drawing]);
    expect(history.drawing.strokes.map(({ width }) => width)).toEqual([22, 4]);
    expect(undoDrawing(history).drawing).toBe(drawing);
  });

  it('retains the adopted reference after resize, reopen and later cohorts; Clear creates a new picture', () => {
    const owner = contact();
    const first = addStrokes(createHistory(), owner.finish('a'), owner.paper());
    const reopened = parseDrawing(JSON.parse(JSON.stringify(first.drawing)));
    const next = contact(reopened, () => {
      throw new Error('resize must not adopt');
    });
    const continued = addStrokes(createHistory(reopened), next.finish('a'), next.paper());
    expect(continued.drawing.paper).toBe(reopened.paper);
    expect(samePaper(drawingPaper(first.drawing), drawingPaper(reopened))).toBe(true);
    expect(semanticWidth(22, reopened.paper) * (760 / 1024)).toBeCloseTo((22 * 760) / 342, 12);
    const cleared = clearDrawing(continued, false);
    expect(cleared.drawing.paper).toEqual({ kind: 'unadopted' });
    expect(undoDrawing(cleared).drawing).toBe(continued.drawing);
  });

  it('rejects absent adoption and reference substitution without mutating history', () => {
    const original = createHistory();
    expect(() => addStrokes(original, [pen])).toThrow('reference');
    const paper = adoptPaper(PHONE_WIDTH, PHONE_HEIGHT, 1);
    const next = addStrokes(original, [pen], paper);
    expect(() => addStrokes(next, [pen], adoptPaper(760, 570, 1))).toThrow('reference');
    expect(original.drawing.strokes).toEqual([]);
    expect(() => contact(emptyDrawing(), () => adoptPaper(0, 10, 1))).toThrow();
  });

  it.each([
    null,
    {},
    { kind: 'unadopted', cssWidth: 342 },
    { kind: 'legacy' },
    { kind: 'adopted', cssWidth: 342, cssHeight: 256.5, backingScale: 1, extra: 1 },
    ...[0, -1, NaN, Infinity, 1025, '342'].map((cssWidth) => ({
      kind: 'adopted',
      cssWidth,
      cssHeight: 256.5,
      backingScale: 1,
    })),
    ...[0, -1, NaN, Infinity, 769].map((cssHeight) => ({
      kind: 'adopted',
      cssWidth: 342,
      cssHeight,
      backingScale: 1,
    })),
    ...[0, -1, NaN, Infinity, 2.01, '1'].map((backingScale) => ({
      kind: 'adopted',
      cssWidth: 342,
      cssHeight: 256.5,
      backingScale,
    })),
  ])('rejects malformed or unsupported paper metadata %#', (value) => {
    expect(() => readDrawingPaper(value)).toThrow();
  });

  it('enforces exact v6 wire keys, canonical new widths and adopted nonempty records', () => {
    const drawing = { ...emptyDrawing(), paper: adoptPaper(342, 256.5, 1), strokes: [pen, crayon] };
    expect(parseDrawing(JSON.parse(JSON.stringify(drawing)))).toEqual(drawing);
    for (const bad of [
      { ...drawing, extra: true },
      { ...drawing, paper: { kind: 'unadopted' } },
      { ...drawing, strokes: [{ ...crayon, width: 34 }] },
      { ...drawing, strokes: [{ ...pen, brush: 'marker' }] },
      { ...drawing, strokes: [{ ...pen, width: 23 }] },
      { ...drawing, strokes: [{ ...pen, points: [{ x: 1025, y: 400 }] }] },
    ])
      expect(() => parseDrawing(bad)).toThrow();
    expect(() => addStrokes(createHistory(drawing), [{ ...crayon, width: 34 }])).toThrow('width');
  });

  it.each([
    { version: 1, strokes: [{ brush: 'pencil', color: 'Red', points: [point] }] },
    { version: 2, pageId: 'blank', strokes: [{ brush: 'marker', color: 'Red', points: [point] }] },
    {
      version: 2,
      rainbow: 0,
      strokes: [{ brush: 'crayon', color: 'Red', seed: 1, points: [point] }],
    },
    { version: 3, pageId: 'blank', rainbow: 0, strokes: [{ brush: 'eraser', points: [point] }] },
    { version: 4, pageId: 'blank', rainbow: 0, strokes: [{ ...crayon, width: 34 }] },
    { version: 5, pageId: 'blank', rainbow: 0, strokes: [{ ...pen, width: 44 }] },
  ])('preserves legacy geometry and writes no inferred reference %#', (wire) => {
    const drawing = parseDrawing(wire);
    expect(drawing.version).toBe(5);
    expect(Object.hasOwn(drawing, 'paper')).toBe(false);
    expect(textureScale(drawingPaper(drawing))).toBe(1);
    const owner = contact(drawing, () => {
      throw new Error('legacy adoption');
    });
    const next = addStrokes(createHistory(drawing), owner.finish('a'), owner.paper());
    expect(next.drawing.version).toBe(5);
    expect(next.drawing.strokes[0]).toEqual(drawing.strokes[0]);
    expect(parseDrawing(JSON.parse(JSON.stringify(drawing)))).toEqual(drawing);
  });

  it('maps actual SVG meet geometry without border subtraction or independent axis stretching', () => {
    expect(paperContactPoint(171, 128.25, 342, 256.5)).toEqual({ x: 512, y: 384 });
    expect(containsPaperPoint(171, 0, 342, 300)).toBe(false);
    expect(containsPaperPoint(171, 150, 342, 300)).toBe(true);
    expect(paperContactPoint(0, 21.75, 342, 300)).toEqual({ x: 0, y: 0 });
    expect(paperContactPoint(342, 278.25, 342, 300)).toEqual({ x: 1024, y: 768 });
    expect(paperContactPoint(0, 0, 342, 256.5)).toEqual({ x: 0, y: 0 });
  });

  it('refuses a pixel checkpoint from another reference despite identical semantic strokes', () => {
    const phone = adoptPaper(342, 256.5, 1);
    const tablet = adoptPaper(760, 570, 1);
    const strokes = [pen, crayon];
    const checkpoint = { id: 1, strokes: [pen], base64: 'model-only', paper: phone };
    expect(planInk(strokes, checkpoint, phone).checkpoint).toBe(checkpoint);
    expect(planInk(strokes, checkpoint, tablet).checkpoint).toBeNull();
    expect(planInk(strokes, checkpoint, LEGACY_PAPER).checkpoint).toBeNull();
    expect(planInk(strokes, checkpoint, phone).paper).toBe(phone);
  });

  it('preserves pass segmentation under a simultaneous stroke, width and texel coordinate transform', () => {
    const points = [0, 2, 4, 6, 8, 6, 4, 2, 0].map((x) => ({ x, y: 400 }));
    const physical = { ...crayon, width: 2, points };
    const factor = textureScale(adoptPaper(342, 256.5, 1));
    const canonical = {
      ...physical,
      points: points.map(({ x, y }) => ({ x: x * factor, y: y * factor })),
    };
    const expected = crayonPasses(physical, 2);
    const actual = crayonPasses(canonical, 2 * factor, factor);
    expect(actual.map(({ seed }) => seed)).toEqual(expected.map(({ seed }) => seed));
    expect(actual.map(({ points }) => points.length)).toEqual(
      expected.map(({ points }) => points.length)
    );
    expect(actual.length).toBeGreaterThan(1);
  });
  it('rejects unsafe derived geometry and accidental ink in the unadopted branch', () => {
    expect(() => adoptPaper(Number.MIN_VALUE, Number.MIN_VALUE, 1)).toThrow();
    expect(() => paperContactPoint(0, 0, Number.MIN_VALUE, Number.MIN_VALUE)).toThrow();
    expect(() => semanticWidth(22, { kind: 'unadopted' })).toThrow('adopted');
    expect(() => textureScale({ kind: 'unadopted' })).toThrow('adopted');
    for (const ratio of [0, -1, NaN, Infinity])
      expect(() => adoptPaper(342, 256.5, ratio)).toThrow();
  });
});
