import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  addStroke,
  clearDrawing,
  createHistory,
  parseDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('react-native-svg/lib/module/elements.web.js'));
vi.mock(
  '../../experiments/native-architecture/src/drawing/CrayonGlaze.tsx',
  () => import('../../experiments/native-architecture/src/drawing/CrayonGlaze.web.tsx')
);

const { Svg, Rect } = await import('react-native-svg');
const { Ink, InkArtwork } =
  await import('../../experiments/native-architecture/src/drawing/Ink.tsx');

async function pixels(strokes) {
  const svg = renderToStaticMarkup(
    createElement(
      Svg,
      { width: 1024, height: 768, viewBox: '0 0 1024 768' },
      createElement(Rect, { width: 1024, height: 768, fill: '#ffffff' }),
      createElement(
        InkArtwork,
        { strokes },
        ...strokes.map((stroke, index) => createElement(Ink, { key: index, stroke }))
      )
    )
  );
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function region(output, x, y, width, height) {
  let colored = 0;
  let green = 0;
  const channels = [0, 0, 0];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const offset = ((y + dy) * output.info.width + x + dx) * 4;
      const rgb = [...output.data.subarray(offset, offset + 3)];
      const ink = rgb.some((channel) => channel < 240);
      colored += ink;
      green += ink && rgb[1] > rgb[2] && rgb[0] < 160;
      channels.forEach((_, index) => {
        channels[index] += ink ? rgb[index] : 0;
      });
    }
  }
  return { coverage: colored / (width * height), green, rgb: channels.map((sum) => sum / colored) };
}

function crayon(color, seed, points) {
  return { brush: 'crayon', color, seed, points };
}

describe('native brush artwork output', () => {
  it('renders a spatial rainbow and preserves later solid ink in the same composition', async () => {
    const output = await pixels([
      {
        brush: 'magic',
        rainbow: 0,
        points: [
          { x: 100, y: 200 },
          { x: 900, y: 200 },
        ],
      },
      {
        brush: 'marker',
        color: 'Black',
        points: [
          { x: 500, y: 150 },
          { x: 500, y: 250 },
        ],
      },
    ]);
    const at = (x, y) => [
      ...output.data.subarray((y * output.info.width + x) * 4, (y * output.info.width + x) * 4 + 4),
    ];
    expect(at(150, 200)).not.toEqual(at(850, 200));
    expect(at(500, 200).slice(0, 3)).toEqual([10, 11, 16]);
  });

  it('renders tooth inside the crayon and gradual same-color buildup without changing the hue', async () => {
    const line = [
      { x: 100, y: 200 },
      { x: 900, y: 200 },
    ];
    const first = crayon('Red', 1, line);
    const second = crayon('Red', 2, [
      { x: 100, y: 200 },
      { x: 450, y: 200 },
    ]);
    const once = await pixels([first]);
    const twice = await pixels([first, second]);
    const before = region(once, 150, 193, 200, 14);
    const after = region(twice, 150, 193, 200, 14);
    expect(before.coverage).toBeGreaterThan(0.3);
    expect(before.coverage).toBeLessThan(0.85);
    expect(after.coverage).toBeGreaterThan(before.coverage + 0.1);
    expect(
      Math.max(...after.rgb.map((channel, index) => Math.abs(channel - before.rgb[index])))
    ).toBeLessThan(10);
    expect(region(twice, 600, 193, 200, 14)).toEqual(region(once, 600, 193, 200, 14));
    expect(region(twice, 150, 230, 200, 20).coverage).toBe(0);
  });

  it('mixes blue and yellow crossings subtractively in the artwork itself', async () => {
    const output = await pixels([
      crayon('Yellow', 1, [
        { x: 100, y: 200 },
        { x: 900, y: 200 },
      ]),
      crayon('Blue', 2, [
        { x: 500, y: 100 },
        { x: 500, y: 300 },
      ]),
    ]);
    expect(region(output, 492, 192, 16, 16).green).toBeGreaterThan(30);
  });

  it('builds wax before the finger lifts when a gesture backtracks over itself', async () => {
    const forward = [
      { x: 100, y: 400 },
      { x: 350, y: 400 },
      { x: 600, y: 400 },
    ];
    const before = await pixels([crayon('Red', 1, forward)]);
    const after = await pixels([
      crayon('Red', 1, [...forward, { x: 350, y: 400 }, { x: 100, y: 400 }]),
    ]);
    expect(region(after, 150, 393, 200, 14).coverage).toBeGreaterThan(
      region(before, 150, 393, 200, 14).coverage + 0.1
    );
  });

  it('reveals the same Magic color at a paper position across separate strokes and taps', async () => {
    const long = {
      brush: 'magic',
      rainbow: 3,
      points: [
        { x: 100, y: 200 },
        { x: 900, y: 200 },
      ],
    };
    const first = await pixels([long]);
    const second = await pixels([
      long,
      { brush: 'magic', rainbow: 3, points: [{ x: 400, y: 200 }] },
    ]);
    const offset = (200 * first.info.width + 400) * 4;
    expect(second.data.subarray(offset, offset + 4)).toEqual(
      first.data.subarray(offset, offset + 4)
    );
  });

  it('keeps exact rendered pixels after saving, reopening, and undoing a clear', async () => {
    const stroke = crayon('Purple', 4, [
      { x: 100, y: 400 },
      { x: 350, y: 400 },
      { x: 100, y: 400 },
    ]);
    let history = addStroke(createHistory(), stroke);
    history = addStroke(history, {
      brush: 'magic',
      rainbow: 0,
      points: [
        { x: 100, y: 200 },
        { x: 900, y: 200 },
      ],
    });
    const original = await pixels(history.drawing.strokes);
    const reopened = parseDrawing(JSON.parse(JSON.stringify(history.drawing)));
    const restored = undoDrawing(clearDrawing(history)).drawing;
    expect((await pixels(reopened.strokes)).data.equals(original.data)).toBe(true);
    expect((await pixels(restored.strokes)).data.equals(original.data)).toBe(true);
  });
});
