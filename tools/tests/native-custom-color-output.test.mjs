import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import {
  emptyDrawing,
  parseDrawing,
  strokeStyle,
  createHistory,
  addStrokes,
  clearDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';

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
function artwork(strokes) {
  return renderToStaticMarkup(
    createElement(
      Svg,
      { width: 1024, height: 768, viewBox: '0 0 1024 768' },
      createElement(InkScene, { strokes, checkpoint: null, onImageLoad() {} })
    )
  );
}
async function png(strokes) {
  return sharp(Buffer.from(artwork(strokes)))
    .png()
    .toBuffer();
}
async function pixel(image, x, y) {
  const data = await sharp(image).ensureAlpha().raw().toBuffer();
  return [...data.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4)];
}

describe('production custom pigment artwork', () => {
  it.each(['pencil', 'marker', 'crayon'])(
    'reaches actual %s PNG pixels and preserves them through save/reopen and Clear/Undo',
    async (brush) => {
      const selected = stroke(brush, '#123ABC');
      const history = addStrokes(createHistory(emptyDrawing(2)), [selected]);
      const original = await png(history.drawing.strokes);
      const other = await png([stroke(brush, '#FEDCBA')]);
      expect(original.equals(other)).toBe(false);
      const reopened = parseDrawing(JSON.parse(JSON.stringify(history.drawing)));
      expect((await png(reopened.strokes)).equals(original)).toBe(true);
      const restored = undoDrawing(clearDrawing(history, false)).drawing;
      expect((await png(restored.strokes)).equals(original)).toBe(true);
    }
  );
  it.each(['pencil', 'marker'])('renders exact %s pigment channels in a PNG', async (brush) => {
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
