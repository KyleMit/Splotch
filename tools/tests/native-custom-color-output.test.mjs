import { adoptedDrawing, canonicalPaper } from './native-paper-fixtures.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import {
  emptyDrawing,
  strokeStyle,
  createHistory,
  addStrokes,
  clearDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { parseDrawing } from '../../experiments/native-architecture/src/drawing/drawingFormat.ts';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('react-native-svg/lib/module/elements.web.js'));
vi.mock(
  '../../experiments/native-architecture/src/drawing/CrayonGlaze.tsx',
  () => import('../../experiments/native-architecture/src/drawing/CrayonGlaze.web.tsx')
);
const { Svg } = await import('react-native-svg');
const { InkScene } = await import('../../experiments/native-architecture/src/drawing/InkScene.tsx');

function stroke(brush, color, y = 200) {
  return {
    ...strokeStyle(brush, color, emptyDrawing(2)),
    points: [
      { x: 100, y },
      { x: 700, y },
    ],
  };
}
function artwork(strokes, theme = 'light') {
  return renderToStaticMarkup(
    createElement(
      Svg,
      { width: 1024, height: 768, viewBox: '0 0 1024 768' },
      createElement(
        InkAppearanceScope.Provider,
        { value: { pageId: 'blank', theme } },
        createElement(InkScene, { strokes, checkpoint: null, onImageLoad() {} })
      )
    )
  );
}
async function png(strokes, theme = 'light') {
  return sharp(Buffer.from(artwork(strokes, theme)))
    .png()
    .toBuffer();
}
async function pixel(image, x, y) {
  const data = await sharp(image).ensureAlpha().raw().toBuffer();
  return [...data.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4)];
}

describe('production custom pigment artwork', () => {
  it.each(['pen', 'crayon'])(
    'reaches actual %s PNG pixels and preserves them through save/reopen and Clear/Undo',
    async (brush) => {
      const selected = stroke(brush, '#123ABC');
      const history = addStrokes(createHistory(emptyDrawing(2)), [selected], canonicalPaper());
      const original = await png(history.drawing.strokes);
      const other = await png([stroke(brush, '#FEDCBA')]);
      expect(original.equals(other)).toBe(false);
      const reopened = parseDrawing(JSON.parse(JSON.stringify(history.drawing)));
      expect((await png(reopened.strokes)).equals(original)).toBe(true);
      const restored = undoDrawing(clearDrawing(history, false)).drawing;
      expect((await png(restored.strokes)).equals(original)).toBe(true);
    }
  );
  it.each(['pen'])('renders exact %s pigment channels in a PNG', async (brush) => {
    expect(await pixel(await png([stroke(brush, '#123ABC')]), 300, 200)).toEqual([
      18, 58, 188, 255,
    ]);
  });
  it('shares equivalent named/custom crayon pigment definitions with safe unique IDs and resolves every local reference', () => {
    const markup = artwork([
      stroke('crayon', 'Blue'),
      stroke('crayon', '#62A2E9', 300),
      stroke('crayon', '#123ABC', 400),
    ]);
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(id))).toBe(true);
    const references = [...markup.matchAll(/(?:href="#|url\(#)([^")]+)/g)].map((match) => match[1]);
    expect(references.length).toBeGreaterThan(0);
    expect(references.every((id) => ids.includes(id))).toBe(true);
    const pigments = ids.filter((id) => id.includes('-wax-'));
    const one = [...artwork([stroke('crayon', 'Blue')]).matchAll(/\bid="([^"]+-wax-[^"]+)"/g)]
      .length;
    expect(pigments).toHaveLength(one * 2);
  });
  it.each(
    ['light', 'dark'].flatMap((theme) => [false, true].map((reverse) => ({ theme, reverse })))
  )(
    'shares resolved Blue pigment and exact RGBA for either named/custom order on $theme, reversed=$reverse',
    async ({ theme, reverse }) => {
      const colors = reverse ? ['#62A2E9', 'Blue'] : ['Blue', '#62A2E9'];
      const strokes = colors.map((color, index) => stroke('crayon', color, 200 + index * 360));
      const equivalent = strokes.map((item) => ({ ...item, color: 'Blue' }));
      const pigmentIds = (markup) =>
        [...markup.matchAll(/\bid="([^"]+-wax-[^"]+)"/g)].map((match) => match[1]);
      expect(pigmentIds(artwork(strokes, theme))).toHaveLength(
        pigmentIds(artwork([strokes[0]], theme)).length
      );
      const mixed = await sharp(await png(strokes, theme))
        .ensureAlpha()
        .raw()
        .toBuffer();
      const named = await sharp(await png(equivalent, theme))
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect(mixed.equals(named)).toBe(true);
      expect(
        parseDrawing(
          JSON.parse(
            JSON.stringify({
              ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }, 2),
              strokes,
            })
          )
        ).strokes.map((item) => item.color)
      ).toEqual(colors);
    }
  );
  it.each([false, true])(
    'shares resolved-white pigment with unchanged Black RGBA and semantic IDs, reversed=%s',
    async (reverse) => {
      const paints = [stroke('crayon', 'Black'), stroke('crayon', '#FFFFFF', 560)];
      const strokes = reverse ? paints.toReversed() : paints;
      const pigments = (markup) => [...markup.matchAll(/\bid="([^"]+-wax-[^"]+)"/g)].length;
      expect(pigments(artwork(strokes, 'dark'))).toBe(pigments(artwork([strokes[0]], 'dark')));
      expect(pigments(artwork(strokes, 'light'))).toBe(
        pigments(artwork([strokes[0]], 'light')) * 2
      );
      const blackRegion = async (image) =>
        sharp(image)
          .extract({ left: 0, top: 0, width: 1024, height: 384 })
          .ensureAlpha()
          .raw()
          .toBuffer();
      const mixed = await blackRegion(await png(strokes, 'dark'));
      const alone = await blackRegion(await png([paints[0]], 'dark'));
      expect(mixed.equals(alone)).toBe(true);
      expect(
        parseDrawing(
          JSON.parse(
            JSON.stringify({
              ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }, 2),
              strokes,
            })
          )
        ).strokes.map((item) => item.color)
      ).toEqual(strokes.map((item) => item.color));
    }
  );
  it('keeps Magic pixels paper-fixed and allows custom crayon overlap to build different mixed pixels', async () => {
    expect(
      (await png([stroke('magic', '#123ABC')])).equals(await png([stroke('magic', '#FEDCBA')]))
    ).toBe(true);
    const yellow = stroke('crayon', '#FFFF00');
    const blue = { ...stroke('crayon', '#0000FF'), seed: 2 };
    const overlap = await png([yellow, blue]);
    expect(overlap.equals(await png([yellow]))).toBe(false);
    expect(overlap.equals(await png([blue]))).toBe(false);
    expect(overlap.equals(await png([yellow, blue, { ...blue, seed: 3 }]))).toBe(false);
  });
});
