// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { paletteHex } from '../../experiments/native-architecture/src/drawing/palette.ts';
import {
  PAPER_WIDTH,
  PAPER_HEIGHT,
  emptyDrawing,
  strokeStyle,
} from '../../experiments/native-architecture/src/drawing/model.ts';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('react-native-svg/lib/module/elements.web.js'));
vi.mock(
  '../../experiments/native-architecture/src/drawing/CrayonGlaze.tsx',
  () => import('../../experiments/native-architecture/src/drawing/CrayonGlaze.web.tsx')
);
const { Svg } = await import('react-native-svg');
const { Ink, InkArtwork } =
  await import('../../experiments/native-architecture/src/drawing/Ink.tsx');
const { InkScene } = await import('../../experiments/native-architecture/src/drawing/InkScene.tsx');

function svg(children) {
  return renderToStaticMarkup(
    createElement(
      Svg,
      {
        width: PAPER_WIDTH,
        height: PAPER_HEIGHT,
        viewBox: `0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}`,
      },
      createElement(
        InkAppearanceScope.Provider,
        { value: { pageId: 'blank', theme: 'light' } },
        children
      )
    )
  );
}
const blue = {
  brush: 'crayon',
  width: 34,
  color: 'Blue',
  seed: 20,
  points: [
    { x: 100, y: 100 },
    { x: 700, y: 100 },
  ],
};
const yellow = {
  brush: 'crayon',
  width: 34,
  color: 'Yellow',
  seed: 21,
  points: [
    { x: 300, y: 80 },
    { x: 300, y: 120 },
  ],
};
const magic = {
  brush: 'magic',
  width: 30,
  rainbow: 3,
  points: [
    { x: 100, y: 200 },
    { x: 700, y: 200 },
  ],
};
function scene(strokes, checkpoint = null) {
  return svg(createElement(InkScene, { strokes, checkpoint, onImageLoad() {} }));
}
async function raw(source) {
  return sharp(Buffer.from(source)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
function tags(source, name) {
  return [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(([tag]) => tag);
}

function pixel(image, x, y) {
  const offset = (y * image.info.width + x) * image.info.channels;
  return [...image.data.subarray(offset, offset + image.info.channels)];
}

describe('joint artwork definitions and chronological mask composition', () => {
  it('mounts the installed web mask with luminance CSS and no unknown DOM prop', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const mounted = createRoot(host);
    const errors = vi.spyOn(console, 'error');
    const erase = {
      ...strokeStyle('eraser', 'Blue', emptyDrawing()),
      points: [{ x: 400, y: 100 }],
    };
    try {
      await act(() =>
        mounted.render(
          createElement(
            Svg,
            { width: PAPER_WIDTH, height: PAPER_HEIGHT },
            createElement(
              InkAppearanceScope.Provider,
              { value: { pageId: 'blank', theme: 'light' } },
              createElement(InkScene, {
                strokes: [blue, erase],
                checkpoint: null,
                onImageLoad() {},
              })
            )
          )
        )
      );
      const masks = host.querySelectorAll('mask');
      expect(masks).toHaveLength(1);
      expect(masks[0].style.getPropertyValue('mask-type')).toBe('luminance');
      expect(masks[0].getAttributeNames()).not.toContain('maskType');
      expect(masks[0].getAttributeNames()).not.toContain('masktype');
      expect(errors.mock.calls).toEqual([]);
    } finally {
      await act(() => mounted.unmount());
      errors.mockRestore();
      host.remove();
      vi.unstubAllGlobals();
    }
  });
  it('erases earlier ink with black luminance while preserving white-mask ink and later paint', async () => {
    const earlier = {
      ...strokeStyle('marker', 'Blue', emptyDrawing()),
      points: [
        { x: 100, y: 200 },
        { x: 700, y: 200 },
      ],
    };
    const erase = {
      ...strokeStyle('eraser', 'Blue', emptyDrawing()),
      points: [
        { x: 400, y: 150 },
        { x: 400, y: 250 },
      ],
    };
    const later = {
      ...strokeStyle('marker', 'Yellow', emptyDrawing()),
      points: [{ x: 400, y: 200 }],
    };
    const before = await raw(scene([earlier]));
    const erased = await raw(scene([earlier, erase]));
    const repainted = await raw(scene([earlier, erase, later]));
    expect(pixel(before, 400, 200)[3]).toBe(255);
    expect(pixel(erased, 400, 200)[3]).toBe(0);
    expect(pixel(erased, 200, 200)).toEqual(pixel(before, 200, 200));
    expect(pixel(erased, 200, 200)[3]).toBe(255);
    expect(pixel(erased, 20, 20)[3]).toBe(0);
    expect(pixel(repainted, 400, 200)).toEqual([
      ...paletteHex('Yellow')
        .slice(1)
        .match(/../g)
        .map((channel) => Number.parseInt(channel, 16)),
      255,
    ]);
  });
  it('gives the production InkScene the same pixels as its actual direct InkArtwork consumer', async () => {
    const strokes = [blue, yellow, blue, magic];
    const direct = svg(
      createElement(
        InkArtwork,
        { strokes },
        ...strokes.map((stroke, index) => createElement(Ink, { key: index, stroke }))
      )
    );
    const actual = await raw(scene(strokes));
    const expected = await raw(direct);
    expect(actual.info).toEqual(expected.info);
    expect(actual.data.equals(expected.data)).toBe(true);
  });
  it('shares explicit-color definitions across committed and later ink outside the ordered mask', async () => {
    const prefix = [blue, magic];
    const base64 = (
      await sharp(Buffer.from(scene(prefix)))
        .png()
        .toBuffer()
    ).toString('base64');
    const eraser = { brush: 'eraser', width: 44, points: [{ x: 900, y: 600 }] };
    const rendered = scene([eraser, yellow, blue], { id: 1, strokes: prefix, base64 });
    const patterns = tags(rendered, 'pattern');
    const uses = tags(rendered, 'use');
    const definitions = tags(rendered, 'path').filter((tag) => tag.includes(' id='));
    expect(patterns.length).toBeGreaterThan(0);
    expect(uses.length).toBeGreaterThan(definitions.length);
    expect(definitions.every((tag) => / fill="rgb\([0-9,]+\)"/.test(tag))).toBe(true);
    expect(definitions.every((tag) => !tag.includes(' d=""'))).toBe(true);
    expect(tags(rendered, 'mask')).toHaveLength(1);
    expect(tags(rendered, 'image')).toHaveLength(1);
    expect(rendered.indexOf('<defs>')).toBeLessThan(rendered.indexOf('<mask'));
    expect(rendered.indexOf('<image')).toBeLessThan(rendered.lastIndexOf('<pattern'));
  });
  it('applies both ordered erase layers without restoring the first hole or changing untouched pigment', async () => {
    const firstErase = { brush: 'eraser', width: 44, points: [{ x: 100, y: 100 }] };
    const secondErase = { brush: 'eraser', width: 44, points: [{ x: 300, y: 100 }] };
    const before = await raw(scene([blue]));
    const first = await raw(scene([blue, firstErase, yellow]));
    const rendered = scene([blue, firstErase, yellow, secondErase]);
    const second = await raw(rendered);
    expect(pixel(first, 100, 100)[3]).toBe(0);
    expect(pixel(first, 300, 100)[3]).toBeGreaterThan(0);
    expect(pixel(second, 300, 100)[3]).toBe(0);
    expect(pixel(second, 100, 100)[3]).toBe(0);
    expect(pixel(first, 600, 100)).toEqual(pixel(before, 600, 100));
    expect(pixel(second, 600, 100)).toEqual(pixel(before, 600, 100));
    expect(tags(rendered, 'mask')).toHaveLength(2);
  });
});
