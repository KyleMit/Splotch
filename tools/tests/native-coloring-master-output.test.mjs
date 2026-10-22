import { adoptedDrawing } from './native-paper-fixtures.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { coloringBookHistory } from '../../src/settings/coloringBook.ts';
import { strokeStyle } from '../../src/drawing/model.ts';
import { PAPER_THEMES } from '../../src/drawing/theme.ts';
import { InkAppearanceScope } from '../../src/drawing/InkAppearance.tsx';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('react-native-svg/lib/module/elements.web.js'));
const { default: Svg, Rect } = await import('react-native-svg');
const { Ink, InkArtwork } = await import('../../src/drawing/Ink.tsx');
async function rgba(drawing, theme) {
  const svg = renderToStaticMarkup(
    createElement(
      Svg,
      { width: 1024, height: 768, viewBox: '0 0 1024 768' },
      createElement(Rect, { width: 1024, height: 768, fill: PAPER_THEMES[theme].paper }),
      createElement(
        InkAppearanceScope.Provider,
        { value: { pageId: drawing.pageId, theme } },
        createElement(
          InkArtwork,
          { strokes: drawing.strokes },
          ...drawing.strokes.map((stroke, i) => createElement(Ink, { key: i, stroke }))
        )
      )
    )
  );
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
}
it.each(['light', 'dark'])(
  'recodes actual retained Magic PNG pixels to blank-paper colors in %s when coloring is disabled',
  async (theme) => {
    const original = adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }, 3, 'sunshine');
    const stroke = {
      ...strokeStyle('magic', 'Purple', original, 'thick'),
      points: [
        { x: 100, y: 384 },
        { x: 924, y: 384 },
      ],
    };
    const drawing = { ...original, strokes: [stroke] };
    const off = coloringBookHistory({ drawing, undo: [] }, false).drawing;
    const expected = { ...drawing, pageId: 'blank' };
    const [page, disabled, blank] = await Promise.all([
      rgba(drawing, theme),
      rgba(off, theme),
      rgba(expected, theme),
    ]);
    expect(disabled.equals(blank)).toBe(true);
    expect(page.equals(blank)).toBe(false);
    expect(off.strokes).toBe(drawing.strokes);
    expect(drawing.pageId).toBe('sunshine');
  }
);
