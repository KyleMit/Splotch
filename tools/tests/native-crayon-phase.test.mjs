import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', async () => {
  const web = await import('react-native-svg/lib/module/elements.web.js');
  return {
    ...web,
    Pattern({ children, patternTransform, ...props }) {
      // The iOS painter clips translated children inside a fixed pattern grid.
      return createElement(
        web.Pattern,
        { ...props, overflow: 'hidden' },
        createElement(web.G, { transform: patternTransform }, children)
      );
    },
  };
});
vi.mock(
  '../../experiments/native-architecture/src/drawing/CrayonGlaze.tsx',
  () => import('../../experiments/native-architecture/src/drawing/CrayonGlaze.web.tsx')
);

const { Svg, Rect, Defs, Path, Pattern } = await import('react-native-svg');
const { Ink, InkArtwork } =
  await import('../../experiments/native-architecture/src/drawing/Ink.tsx');
const PAPER_WIDTH = 1024;
const PAPER_HEIGHT = 768;
const CORE_HALF_HEIGHT = 7;
const SAMPLE_WIDTH = 96;
const MIN_COVERAGE = 0.3;
const MAX_COVERAGE = 0.85;
const MIN_BUILDUP = 0.1;
const SAMPLE_COLUMNS = [120, 330, 540, 750];

async function raster(children) {
  const svg = renderToStaticMarkup(
    createElement(
      Svg,
      { width: PAPER_WIDTH, height: PAPER_HEIGHT, viewBox: `0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}` },
      createElement(Rect, { width: PAPER_WIDTH, height: PAPER_HEIGHT, fill: '#ffffff' }),
      ...children
    )
  );
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function coverage(output, x, y) {
  let colored = 0;
  for (let dy = -CORE_HALF_HEIGHT; dy < CORE_HALF_HEIGHT; dy++) {
    for (let dx = 0; dx < SAMPLE_WIDTH; dx++) {
      const offset = ((y + dy) * output.info.width + x + dx) * 4;
      colored += output.data.subarray(offset, offset + 3).some((channel) => channel < 240);
    }
  }
  return colored / (SAMPLE_WIDTH * CORE_HALF_HEIGHT * 2);
}

function crayon(seed, points) {
  return { brush: 'crayon', width: 34, color: 'Red', seed, points };
}

function line(seed, y) {
  return crayon(seed, [
    { x: 100, y },
    { x: 950, y },
  ]);
}

function artwork(strokes) {
  return raster([
    createElement(
      InkArtwork,
      { strokes },
      ...strokes.map((stroke, index) => createElement(Ink, { key: index, stroke }))
    ),
  ]);
}

describe('crayon phase under native pattern clipping', () => {
  it('reproduces the translated-content clipping that erased the native seed20 fixture', async () => {
    const translated = await raster([
      createElement(
        Defs,
        { key: 'defs' },
        createElement(
          Pattern,
          {
            id: 'clipped',
            width: 256,
            height: 256,
            patternUnits: 'userSpaceOnUse',
            patternContentUnits: 'userSpaceOnUse',
            patternTransform: 'translate(212 172)',
          },
          createElement(Rect, { width: 256, height: 256, fill: '#f05050' })
        )
      ),
      createElement(Path, {
        key: 'stroke',
        d: 'M100 550L950 550',
        stroke: 'url(#clipped)',
        strokeWidth: 34,
      }),
    ]);
    expect(coverage(translated, 250, 550)).toBe(0);
    expect(coverage(await artwork([line(20, 550)]), 250, 550)).toBeGreaterThan(MIN_COVERAGE);
  });

  it.each([1, 17, 18, 19, 20, 21])(
    'keeps seed %s tooth across tile boundaries at both native failure heights',
    async (seed) => {
      const output = await artwork([line(seed, 550), line(seed, 650)]);
      for (const y of [550, 650]) {
        for (const x of SAMPLE_COLUMNS) {
          expect(coverage(output, x, y)).toBeGreaterThan(MIN_COVERAGE);
          expect(coverage(output, x, y)).toBeLessThan(MAX_COVERAGE);
        }
      }
    }
  );

  it('fills fresh pits on a repeated pass without losing untouched tiles', async () => {
    const first = line(20, 550);
    const repeat = crayon(21, [
      { x: 100, y: 550 },
      { x: 450, y: 550 },
    ]);
    const before = await artwork([first]);
    const after = await artwork([first, repeat]);
    expect(coverage(after, 200, 550)).toBeGreaterThan(coverage(before, 200, 550) + MIN_BUILDUP);
    expect(coverage(after, 750, 550)).toBe(coverage(before, 750, 550));
  });

  it('builds wax when the same saved gesture backtracks through a clipped phase', async () => {
    const points = [
      { x: 100, y: 550 },
      { x: 500, y: 550 },
      { x: 950, y: 550 },
    ];
    const before = await artwork([crayon(20, points)]);
    const after = await artwork([crayon(20, [...points, { x: 500, y: 550 }, { x: 100, y: 550 }])]);
    expect(coverage(after, 200, 550)).toBeGreaterThan(coverage(before, 200, 550) + MIN_BUILDUP);
  });

  it('builds wax on reentry into the older top edge of a saved loop', async () => {
    const points = [
      { x: 700, y: 550 },
      { x: 950, y: 550 },
      { x: 950, y: 650 },
      { x: 700, y: 650 },
    ];
    const before = await artwork([crayon(21, points)]);
    const after = await artwork([crayon(21, [...points, { x: 700, y: 550 }, { x: 950, y: 550 }])]);
    expect(coverage(after, 750, 550)).toBeGreaterThan(coverage(before, 750, 550) + MIN_BUILDUP);
  });
});
