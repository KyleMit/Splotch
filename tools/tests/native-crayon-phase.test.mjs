import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  createShippingCrayonOracle,
  shippingCrayonTile,
} from './native-crayon-shipping-oracle.mjs';
import { crayonPasses } from '../../experiments/native-architecture/src/drawing/crayon.ts';
import { paletteHex } from '../../experiments/native-architecture/src/drawing/palette.ts';

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

const { Svg, Rect, Defs, Path, Pattern, Image, G } = await import('react-native-svg');
const { Ink, InkArtwork } =
  await import('../../experiments/native-architecture/src/drawing/Ink.tsx');
const PAPER_WIDTH = 1024;
const PAPER_HEIGHT = 768;
const CORE_HALF_HEIGHT = 7;
const SAMPLE_WIDTH = 96;
const MIN_COVERAGE = 0.3;
const MIN_BUILDUP = 0.1;
const SAMPLE_COLUMNS = [120, 330, 540, 750];
const PHASE_SEEDS = [1, 17, 18, 19, 20, 21];
const LEGACY_COVERAGE_CEILING = 0.85;
const OVERFLOW_WIDTH_PX = 68;

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

function corePixels(output, x, y) {
  return Buffer.concat(
    Array.from({ length: CORE_HALF_HEIGHT * 2 }, (_, row) => {
      const offset = ((y - CORE_HALF_HEIGHT + row) * output.info.width + x) * 4;
      return output.data.subarray(offset, offset + SAMPLE_WIDTH * 4);
    })
  );
}

// The reference rolls shipping texels, avoiding the native renderer's four translated SVG Uses.
async function shippingReference(
  strokes,
  { phaseShiftPx = 0, flat = false, extraWidthPx = 0 } = {}
) {
  const owner = createShippingCrayonOracle();
  const children = [];
  for (const [strokeIndex, stroke] of strokes.entries()) {
    const [start, end] = stroke.points;
    if (stroke.points.length !== 2 || start.y !== end.y || start.x >= end.x)
      throw new Error('Phase oracle requires a forward horizontal line');
    const passes = crayonPasses(stroke, stroke.width);
    if (passes.length !== 1) throw new Error('Phase oracle requires one deposition pass');
    const shapes = [];
    for (let band = 0; band < owner.crayonPassCount(); band++) {
      const tile = shippingCrayonTile(owner, paletteHex(stroke.color), passes[0].seed, band);
      const rolled = new Uint8ClampedArray(tile.pixels.length);
      for (let y = 0; y < tile.height; y++) {
        for (let x = 0; x < tile.width; x++) {
          const sourceX =
            (((x - tile.phase.x - phaseShiftPx) % tile.width) + tile.width) % tile.width;
          const sourceY = (((y - tile.phase.y) % tile.height) + tile.height) % tile.height;
          const source = (sourceY * tile.width + sourceX) * 4;
          const destination = (y * tile.width + x) * 4;
          rolled.set(tile.pixels.subarray(source, source + 4), destination);
          if (flat) rolled[destination + 3] = 255;
        }
      }
      const png = await sharp(Buffer.from(rolled), {
        raw: { width: tile.width, height: tile.height, channels: 4 },
      })
        .png()
        .toBuffer();
      const id = `reference-${strokeIndex}-${band}`;
      children.push(
        createElement(
          Defs,
          { key: id },
          createElement(
            Pattern,
            {
              id,
              width: tile.width,
              height: tile.height,
              patternUnits: 'userSpaceOnUse',
              patternContentUnits: 'userSpaceOnUse',
            },
            createElement(Image, {
              width: tile.width,
              height: tile.height,
              preserveAspectRatio: 'none',
              href: `data:image/png;base64,${png.toString('base64')}`,
            })
          )
        )
      );
      const width = stroke.width * owner.crayonPassWidthScale(band) + extraWidthPx;
      shapes.push(
        createElement(Rect, {
          key: band,
          x: start.x,
          y: start.y - width / 2,
          width: end.x - start.x,
          height: width,
          fill: `url(#${id})`,
        })
      );
    }
    children.push(
      createElement(
        G,
        { key: `bottom-${strokeIndex}`, style: { mixBlendMode: 'darken' } },
        ...shapes
      )
    );
    children.push(
      createElement(
        G,
        { key: `top-${strokeIndex}`, opacity: 1 - owner.crayonColorMix() },
        ...shapes
      )
    );
  }
  return raster(children);
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

  it.each(PHASE_SEEDS)(
    'keeps seed %s tooth across tile boundaries at both native failure heights',
    async (seed) => {
      const strokes = [line(seed, 550), line(seed, 650)];
      const output = await artwork(strokes);
      const expected = await shippingReference(strokes);
      for (const y of [550, 650]) {
        for (const x of SAMPLE_COLUMNS) {
          expect(coverage(output, x, y)).toBeGreaterThan(MIN_COVERAGE);
          expect(
            corePixels(output, x, y).equals(corePixels(expected, x, y)),
            `seed ${seed}, core (${x}, ${y}), actual ${coverage(output, x, y)}, shipping ${coverage(expected, x, y)}`
          ).toBe(true);
          expect(coverage(expected, x, y)).toBeLessThan(1);
        }
      }
    }
  );

  it('exhibits a shipping-field counterexample to the legacy coverage ceiling', async () => {
    const coverages = [];
    for (const seed of PHASE_SEEDS) {
      const expected = await shippingReference([line(seed, 550), line(seed, 650)]);
      for (const y of [550, 650])
        for (const x of SAMPLE_COLUMNS) coverages.push(coverage(expected, x, y));
    }
    expect(Math.max(...coverages)).toBeGreaterThan(LEGACY_COVERAGE_CEILING);
  });

  it.each([
    ['flat tooth', { flat: true }],
    ['one-pixel phase shift', { phaseShiftPx: 1 }],
  ])('rejects the %s negative control', async (_name, mutant) => {
    const strokes = [line(20, 550)];
    const output = await artwork(strokes);
    const changed = await shippingReference(strokes, mutant);
    expect(corePixels(output, 330, 550).equals(corePixels(changed, 330, 550))).toBe(false);
  });

  it('keeps wax inside the full-width silhouette and detects an overflowing reference', async () => {
    const strokes = [line(20, 550)];
    const output = await artwork(strokes);
    const overflowing = await shippingReference(strokes, { extraWidthPx: OVERFLOW_WIDTH_PX });
    expect(coverage(output, 330, 584)).toBe(0);
    expect(coverage(overflowing, 330, 584)).toBeGreaterThan(MIN_COVERAGE);
  });

  it('changes actual core pixels when the stored deposition phase changes', async () => {
    const first = await artwork([line(17, 550)]);
    const second = await artwork([line(18, 550)]);
    expect(corePixels(first, 330, 550).equals(corePixels(second, 330, 550))).toBe(false);
  });

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
