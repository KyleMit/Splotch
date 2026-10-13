import { canonicalPaper } from './native-paper-fixtures.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import { InkScene } from '../../experiments/native-architecture/src/drawing/InkScene.tsx';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
  parseDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { createContactCohort } from '../../experiments/native-architecture/src/drawing/contactCohort.ts';
import { paletteHex } from '../../experiments/native-architecture/src/drawing/palette.ts';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('react-native-svg/lib/module/elements.web.js'));
vi.mock(
  '../../experiments/native-architecture/src/drawing/CrayonGlaze.tsx',
  () => import('../../experiments/native-architecture/src/drawing/CrayonGlaze.web.tsx')
);
const { Svg } = await import('react-native-svg');

async function output(strokes) {
  const svg = renderToStaticMarkup(
    createElement(
      Svg,
      { width: 1024, height: 768, viewBox: '0 0 1024 768' },
      createElement(
        InkAppearanceScope.Provider,
        { value: { pageId: 'blank', theme: 'light' } },
        createElement(InkScene, { checkpoint: null, strokes, onImageLoad() {} })
      )
    )
  );
  return { svg, data: await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer() };
}
function rgba(data, x, y) {
  return [...data.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4)];
}
function channels(color) {
  return [
    ...paletteHex(color)
      .slice(1)
      .match(/../g)
      .map((part) => Number.parseInt(part, 16)),
    255,
  ];
}
function mixedCohort() {
  const input = createContactCohort();
  const drawing = emptyDrawing();
  input.start('a', 'Blue', 'pen', { x: 100, y: 200 }, drawing, 'medium', canonicalPaper);
  // Strokes end at their last sample midpoint, so a sample past 900 carries Blue's ink there.
  input.sample('a', { x: 900, y: 200 });
  input.sample('a', { x: 1000, y: 200 }, true);
  input.start('b', 'Yellow', 'eraser', { x: 300, y: 100 }, drawing);
  input.sample('b', { x: 300, y: 300 }, true);
  input.start('c', 'Red', 'pen', { x: 200, y: 200 }, drawing);
  input.sample('c', { x: 800, y: 200 }, true);
  input.start('d', 'Purple', 'eraser', { x: 600, y: 100 }, drawing);
  input.sample('d', { x: 600, y: 300 }, true);
  return { input, drawing };
}

describe('complete chronological live mixed-contact scene', () => {
  it('keeps later pigment outside the first erase and subjects it to the second erase', async () => {
    const { input } = mixedCohort();
    const rendered = await output(input.drafts());
    expect((rendered.svg.match(/<mask /g) ?? []).length).toBe(2);
    expect(rgba(rendered.data, 100, 200)).toEqual(channels('Blue'));
    expect(rgba(rendered.data, 300, 200)).toEqual(channels('Red'));
    expect(rgba(rendered.data, 600, 200)).toEqual([0, 0, 0, 0]);
    expect(rgba(rendered.data, 900, 200)).toEqual(channels('Blue'));
  });

  it('retains independent styles/start order through partial lift, one Undo and parsed replay', async () => {
    const { input, drawing } = mixedCohort();
    const live = await output(input.drafts());
    expect(input.finish('c')).toBeNull();
    expect(input.finish('a')).toBeNull();
    expect(input.finish('d')).toBeNull();
    const strokes = input.finish('b');
    expect(strokes.map(({ brush }) => brush)).toEqual(['pen', 'eraser', 'pen', 'eraser']);
    expect(strokes.filter(({ brush }) => brush === 'pen').map(({ color }) => color)).toEqual([
      'Blue',
      'Red',
    ]);
    const history = addStrokes(createHistory(drawing), strokes, input.paper());
    expect(history.undo).toEqual([drawing]);
    const saved = parseDrawing(JSON.parse(JSON.stringify(history.drawing)));
    expect((await output(saved.strokes)).data.equals(live.data)).toBe(true);
    expect(undoDrawing(history).drawing).toBe(drawing);
  });
});
