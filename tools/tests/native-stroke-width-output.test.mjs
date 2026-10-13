import { adoptedDrawing, canonicalPaper } from './native-paper-fixtures.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import {
  addStrokes,
  clearDrawing,
  createHistory,
  emptyDrawing,
  parseDrawing,
  strokeStyle,
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

async function pixels(strokes) {
  const svg = renderToStaticMarkup(
    createElement(
      Svg,
      { width: 1024, height: 768, viewBox: '0 0 1024 768' },
      createElement(
        InkAppearanceScope.Provider,
        { value: { pageId: 'blank', theme: 'light' } },
        createElement(InkScene, { strokes, checkpoint: null, onImageLoad() {} })
      )
    )
  );
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
}
function stroke(brush, width) {
  return {
    ...strokeStyle(brush, 'Blue', emptyDrawing(3), width),
    points: [
      { x: 200, y: 200 },
      { x: 700, y: 200 },
    ],
  };
}
function coverage(data) {
  let sum = 0;
  for (let index = 3; index < data.length; index += 4) sum += data[index];
  return sum;
}
const alphaAt = (data, x, y) => data[(y * 1024 + x) * 4 + 3];

describe('actual stored width artwork output', () => {
  it.each(['pen', 'crayon', 'magic'])(
    'renders visibly distinct %s widths and preserves exact PNG pixels through save, reopen and undo',
    async (brush) => {
      const thin = await pixels([stroke(brush, 'thin')]);
      const medium = await pixels([stroke(brush, 'medium')]);
      const thickStroke = stroke(brush, 'thick');
      const thick = await pixels([thickStroke]);
      expect(coverage(medium)).toBeGreaterThan(coverage(thin) * 1.7);
      expect(coverage(thick)).toBeGreaterThan(coverage(medium) * 1.7);
      const history = addStrokes(createHistory(emptyDrawing(3)), [thickStroke], canonicalPaper());
      const reopened = parseDrawing(JSON.parse(JSON.stringify(history.drawing)));
      const restored = undoDrawing(clearDrawing(history, false)).drawing;
      expect((await pixels(reopened.strokes)).equals(thick)).toBe(true);
      expect((await pixels(restored.strokes)).equals(thick)).toBe(true);
    }
  );

  it('uses each stored eraser width to remove ink while preserving the same remote paint', async () => {
    const paint = stroke('pen', 'thick');
    const erase = (width) => ({
      ...strokeStyle('eraser', 'Blue', emptyDrawing(3), width),
      points: [{ x: 400, y: 200 }],
    });
    const thin = await pixels([paint, erase('thin')]);
    const thick = await pixels([paint, erase('thick')]);
    expect(alphaAt(thin, 400, 200)).toBe(0);
    expect(alphaAt(thick, 400, 200)).toBe(0);
    expect(alphaAt(thin, 406, 200)).toBe(255);
    expect(alphaAt(thick, 406, 200)).toBe(0);
    expect(alphaAt(thin, 430, 200)).toBe(255);
    expect(alphaAt(thick, 430, 200)).toBe(255);
    const original = {
      ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }, 3),
      strokes: [paint, erase('thin'), erase('thick')],
    };
    const reopened = parseDrawing(JSON.parse(JSON.stringify(original)));
    expect((await pixels(reopened.strokes)).equals(await pixels(original.strokes))).toBe(true);
  });
});
