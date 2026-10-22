import { adoptedDrawing } from './native-paper-fixtures.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { InkAppearanceScope } from '../../src/drawing/InkAppearance.tsx';
import { paintAppearance, paintHex, paintId } from '../../src/drawing/palette.ts';
import { PAPER_THEMES } from '../../src/drawing/theme.ts';
import { strokeStyle } from '../../src/drawing/model.ts';
import { parseDrawing } from '../../src/drawing/drawingFormat.ts';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('react-native-svg/lib/module/elements.web.js'));
vi.mock('../../src/drawing/CrayonGlaze.tsx', () => import('../../src/drawing/CrayonGlaze.web.tsx'));
const { Svg, Rect } = await import('react-native-svg');
const { InkScene } = await import('../../src/drawing/InkScene.tsx');
const { CrayonGlaze: NativeGlaze } = await vi.importActual('../../src/drawing/CrayonGlaze.tsx');
const WIDTH = 1024,
  HEIGHT = 768;
const SAMPLE = { x: 480, y: 378, width: 64, height: 12 };
function drawing(brush) {
  const base = adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 });
  return {
    ...base,
    strokes: [
      {
        ...strokeStyle(brush, 'Black', base, 'thick'),
        points: [
          { x: 100, y: 384 },
          { x: 924, y: 384 },
        ],
      },
    ],
  };
}
function render(strokes, theme) {
  return renderToStaticMarkup(
    createElement(
      Svg,
      { width: WIDTH, height: HEIGHT, viewBox: `0 0 ${WIDTH} ${HEIGHT}` },
      createElement(Rect, { width: WIDTH, height: HEIGHT, fill: PAPER_THEMES[theme].paper }),
      createElement(
        InkAppearanceScope.Provider,
        { value: { pageId: 'blank', theme } },
        createElement(InkScene, { checkpoint: null, strokes, onImageLoad() {} })
      )
    )
  );
}
function strongInkPixels(image, theme) {
  let count = 0;
  for (let y = SAMPLE.y; y < SAMPLE.y + SAMPLE.height; y++)
    for (let x = SAMPLE.x; x < SAMPLE.x + SAMPLE.width; x++) {
      const offset = (y * image.info.width + x) * image.info.channels;
      const channels = [...image.data.subarray(offset, offset + 3)];
      if (
        theme === 'dark'
          ? channels.every((channel) => channel > 230)
          : channels.every((channel) => channel < 30)
      )
        count++;
    }
  return count;
}
describe('semantic Black through resolved paint appearance', () => {
  it('projects canonical white only for semantic Black on dark paper and retains semantic IDs', () => {
    expect(paintAppearance('Black', 'dark').hex).toBe('#ffffff');
    expect(paintAppearance('#0A0B10', 'dark').hex).toBe('#0A0B10');
    expect(paintAppearance('Blue', 'dark').glaze).toBe('darken');
    expect(paintHex('Black')).toBe('#0a0b10');
    expect(paintId('Black')).toBe('ink-0a0b10');
  });
  it.each(['light', 'dark'])(
    'wires the native filter channel for %s without changing glaze strength',
    (theme) => {
      const svg = renderToStaticMarkup(
        createElement(
          Svg,
          {},
          createElement(
            NativeGlaze,
            { mode: paintAppearance('Black', theme).glaze },
            createElement(Rect, {
              width: 10,
              height: 10,
              fill: paintAppearance('Black', theme).hex,
            })
          )
        )
      );
      expect(svg).toContain(`mode="${theme === 'dark' ? 'lighten' : 'darken'}"`);
      expect(svg).toContain('opacity="0.44999999999999996"');
    }
  );
  it.each(
    ['pen', 'crayon'].flatMap((brush) => ['light', 'dark'].map((theme) => ({ brush, theme })))
  )(
    'paints real $brush SVG and PNG visibly on $theme paper without rewriting Black',
    async ({ brush, theme }) => {
      const snapshot = drawing(brush),
        serialized = JSON.stringify(snapshot);
      const svg = render(snapshot.strokes, theme);
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      const pixels = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(strongInkPixels(pixels, theme)).toBeGreaterThan((SAMPLE.width * SAMPLE.height) / 4);
      expect(JSON.stringify(snapshot)).toBe(serialized);
      expect(parseDrawing(JSON.parse(serialized)).strokes[0].color).toBe('Black');
      expect(svg).toContain(
        brush === 'crayon'
          ? `mix-blend-mode:${theme === 'dark' ? 'lighten' : 'darken'}`
          : `stroke="${paintAppearance('Black', theme).hex}"`
      );
    }
  );
});
