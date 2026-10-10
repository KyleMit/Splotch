import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  PAPER_WIDTH,
  PAPER_HEIGHT,
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
      children
    )
  );
}
const blue = {
  brush: 'crayon',
  color: 'Blue',
  seed: 20,
  points: [
    { x: 100, y: 100 },
    { x: 700, y: 100 },
  ],
};
const yellow = {
  brush: 'crayon',
  color: 'Yellow',
  seed: 21,
  points: [
    { x: 300, y: 80 },
    { x: 300, y: 120 },
  ],
};
const magic = {
  brush: 'magic',
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

describe('joint artwork definitions and chronological mask composition', () => {
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
    const eraser = { brush: 'eraser', points: [{ x: 900, y: 600 }] };
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
  it('rejects an uncheckpointed second erase layer without silently changing paint order', () => {
    const erase = { brush: 'eraser', points: [{ x: 100, y: 100 }] };
    expect(() => scene([blue, erase, yellow, erase])).toThrow('checkpointed');
  });
});
