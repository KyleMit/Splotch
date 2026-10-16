import {
  paperRasterSize,
  paperRasterBounds,
} from '../../experiments/native-architecture/src/drawing/pictureExport.ts';
import { InkPaperScope } from '../../experiments/native-architecture/src/drawing/InkPaper.tsx';
import {
  adoptPaper,
  paperBounds,
  paperProjection,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
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

describe('grown-paper checkpoint mapping', () => {
  it.each([
    [400, 725, 800, 925],
    [660, 616, 1198, 1004],
    [400, 725, 800.25, 925.5],
    [400, 725, 400, 725],
  ])(
    'inverts capture placement exactly after growing %s/%s to %s/%s',
    (width, height, grownWidth, grownHeight) => {
      const paper = adoptPaper(width, height, 2);
      const projection = paperProjection(paper, { width: grownWidth, height: grownHeight });
      const bounds = paperBounds(projection);
      const raster = paperRasterSize(projection);
      const checkpoint = {
        id: 1,
        base64: 'checkpoint',
        strokes: [],
        paper,
        projection,
        raster,
        bounds: paperRasterBounds(projection, raster),
      };
      const svg = renderToStaticMarkup(
        createElement(
          InkPaperScope.Provider,
          { value: projection },
          createElement(InkScene, { checkpoint, strokes: [], onImageLoad() {} })
        )
      );
      const image = svg.match(/<image[^>]+>/)[0];
      const attribute = (name) => Number(image.match(new RegExp(` ${name}="([^"]+)"`))[1]);
      const scale = Math.min(raster.width / bounds.width, raster.height / bounds.height);
      const padding = {
        x: (raster.width - bounds.width * scale) / 2,
        y: (raster.height - bounds.height * scale) / 2,
      };
      const point = { x: bounds.x + bounds.width * 0.8, y: bounds.y + bounds.height * 0.8 };
      const captured = {
        x: (point.x - bounds.x) * scale + padding.x,
        y: (point.y - bounds.y) * scale + padding.y,
      };
      expect(attribute('width') / raster.width).toBeCloseTo(1 / scale, 12);
      expect(attribute('height') / raster.height).toBeCloseTo(1 / scale, 12);
      expect(attribute('x') + (captured.x * attribute('width')) / raster.width).toBeCloseTo(
        point.x,
        10
      );
      expect(attribute('y') + (captured.y * attribute('height')) / raster.height).toBeCloseTo(
        point.y,
        10
      );
    }
  );
});
