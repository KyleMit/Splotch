import { describe, expect, it } from 'vitest';
import {
  paperPresentationFor,
  paperToView,
  viewForPresentation,
} from '../../web/src/lib/drawing/paperView.ts';
import {
  INITIAL_PAPER_PRESENTATION,
  presentPaper,
} from '../../experiments/native-architecture/src/drawing/paperPresentation.ts';
import {
  adoptPaper,
  UNADOPTED_PAPER,
  paperBounds,
  paperProjection,
  paperProjectionView,
  paperRasterSize,
  paperSize,
  semanticWidth,
  textureScale,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';

// iPad Pro 11 landscape, measured on shipping: the Raised palette column is 84 pt wide, and Flat
// floats it over a canvas that runs under it.
const WINDOW = { width: 1210, height: 834 };
const RAISED = { slot: { width: 1126, height: 802 }, origin: { x: 84, y: 32 } };
const FLAT = { slot: { width: 1210, height: 802 }, origin: { x: 0, y: 32 } };
const paper = adoptPaper(1126, 802, 2);

function step(state, layout, overrides = {}) {
  return presentPaper(state, {
    paper,
    empty: false,
    window: WINDOW,
    toolbarStyle: 'buttons',
    ...layout,
    ...overrides,
  });
}

describe('native paper presentation (shipping paperView / updateDrawingLayout)', () => {
  it('fills the slot with a blank paper', () => {
    const state = step(INITIAL_PAPER_PRESENTATION, RAISED, { paper: UNADOPTED_PAPER });
    expect(state.frame).toEqual({ left: 0, top: 0, ...RAISED.slot });
  });

  it('re-adopts the shipping extent on a large same-orientation window resize', () => {
    const original = { width: 400, height: 800 };
    const resized = { width: 800, height: 1000 };
    const inputs = {
      paper: adoptPaper(original.width, original.height, 2),
      empty: false,
      slot: original,
      origin: { x: 0, y: 0 },
      window: original,
      toolbarStyle: 'bare',
    };
    const shipping = paperPresentationFor({
      canvasEmpty: false,
      paper: original,
      paperAngle: 0,
      screenAngle: 0,
      viewport: resized,
    });
    expect(shipping).toBe('adopt');
    expect(paperToView(viewForPresentation(shipping, original, resized), 100, 200)).toEqual({
      x: 100,
      y: 200,
    });
    const initial = presentPaper(INITIAL_PAPER_PRESENTATION, inputs);
    const next = presentPaper(initial, { ...inputs, slot: resized, window: resized });
    expect(initial.frame).toEqual({ left: 0, top: 0, ...original });
    expect(next.frame).toEqual({ left: 0, top: 0, ...resized });
    expect(next.extent).toEqual(resized);
    expect(next.inputs.paper).toBe(inputs.paper);
    expect(paperBounds(paperProjection(inputs.paper, next.extent))).toEqual({
      x: 0,
      y: 0,
      width: 1024,
      height: 1280,
    });
  });

  it('retains the re-adopted extent through rotation, chrome and a layout-only switch', () => {
    const basis = adoptPaper(400, 800, 2);
    const inputs = {
      paper: basis,
      empty: false,
      slot: { width: 400, height: 800 },
      window: { width: 400, height: 800 },
      origin: { x: 0, y: 0 },
      toolbarStyle: 'bare',
    };
    const initial = presentPaper(INITIAL_PAPER_PRESENTATION, inputs);
    const resized = presentPaper(initial, {
      ...inputs,
      slot: { width: 800, height: 1000 },
      window: { width: 800, height: 1000 },
    });
    const rotated = presentPaper(resized, {
      ...inputs,
      slot: { width: 1000, height: 800 },
      window: { width: 1000, height: 800 },
    });
    expect(rotated.extent).toEqual({ width: 800, height: 1000 });
    expect(rotated.frame).toEqual({ left: 180, top: 0, width: 640, height: 800 });
    const back = presentPaper(rotated, resized.inputs);
    expect(back.frame).toEqual(resized.frame);
    const chrome = presentPaper(back, {
      ...back.inputs,
      slot: { width: 800, height: 950 },
      window: { width: 800, height: 950 },
    });
    expect(chrome.frame).toEqual(back.frame);
    expect(chrome.extent).toEqual(back.extent);
    const layout = presentPaper(back, {
      ...back.inputs,
      toolbarStyle: 'buttons',
      origin: { x: 84, y: 0 },
      slot: { width: 716, height: 1000 },
    });
    expect(layout.frame).toEqual({ left: -84, top: 0, width: 800, height: 1000 });
    expect(layout.extent).toEqual(back.extent);
  });

  it.each([
    { width: 400, height: 800 },
    { width: 390, height: 704 },
  ])('preserves the original rounded basis at repeated extents for %j', (css) => {
    const basis = adoptPaper(css.width, css.height, 2);
    const original = paperProjectionView(paperProjection(basis), css);
    const width = semanticWidth(22, basis);
    const texel = textureScale(basis);
    for (const extent of [{ width: 800, height: 1000 }, { width: 200, height: 600 }, css]) {
      const view = paperProjectionView(paperProjection(basis, extent), extent);
      expect(view.scale).toBeCloseTo(original.scale, 12);
      expect(view.left).toBeCloseTo(original.left, 12);
      expect(view.top).toBeCloseTo(original.top, 12);
      expect(semanticWidth(22, basis)).toBe(width);
      expect(textureScale(basis)).toBe(texel);
      const raster = paperRasterSize(paperProjection(basis, extent));
      expect(Number.isSafeInteger(raster.width)).toBe(true);
      expect(Number.isSafeInteger(raster.height)).toBe(true);
    }
    expect(paperSize(basis).height).toBe(1024);
    expect(basis).toEqual({
      kind: 'adopted',
      cssWidth: css.width,
      cssHeight: css.height,
      backingScale: 2,
    });
  });

  it('keeps an inked paper at its screen position across a Button style switch', () => {
    const raised = step(INITIAL_PAPER_PRESENTATION, RAISED);
    expect(raised.frame).toEqual({ left: 0, top: 0, width: 1126, height: 802 });
    const flat = step(raised, FLAT, { toolbarStyle: 'bare' });
    expect(flat.frame).toEqual({ left: 84, top: 0, width: 1126, height: 802 });
    const back = step(flat, RAISED);
    expect(back.frame).toEqual({ left: 0, top: 0, width: 1126, height: 802 });
  });

  it('releases the held position on rotation and contain-fits the paper upright', () => {
    const flat = step(step(INITIAL_PAPER_PRESENTATION, RAISED), FLAT, { toolbarStyle: 'bare' });
    const portrait = step(
      flat,
      {
        slot: { width: 834, height: 1178 },
        origin: { x: 0, y: 32 },
        window: { width: 834, height: 1210 },
      },
      { toolbarStyle: 'bare' }
    );
    expect(portrait.retained).toBeNull();
    expect(portrait.frame?.width).toBeCloseTo(834);
    expect(portrait.frame?.height).toBeCloseTo((802 * 834) / 1126);
  });

  it('adopts the slot again once the ink is gone', () => {
    const flat = step(step(INITIAL_PAPER_PRESENTATION, RAISED), FLAT, { toolbarStyle: 'bare' });
    expect(step(flat, FLAT, { toolbarStyle: 'bare', empty: true }).frame).toEqual({
      left: 0,
      top: 0,
      ...FLAT.slot,
    });
  });
});
